import { createHash } from "node:crypto";
import { getFunctions } from "firebase-admin/functions";
import { getStorage } from "firebase-admin/storage";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { GoogleGenAI } from "@google/genai";
import { load } from "cheerio";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import type { AnalysisResult, ArchivedAsset, EvidenceRecord } from "./types.js";
import { credibilityPrompt, oraclePrompt } from "./prompts.js";

initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();

const GEMINI_API_KEY = defineSecret("GOOGLE_GENAI_API_KEY");
const GOOGLE_PSE_API_KEY = defineSecret("GOOGLE_PSE_API_KEY");
const GOOGLE_PSE_CX = defineString("GOOGLE_PSE_CX", { default: "" });
const ADMIN_EMAILS = defineString("ADMIN_EMAILS", { default: "jivy26@gmail.com" });
const DEFAULT_SEARCH_QUERIES = defineString("DEFAULT_SEARCH_QUERIES", {
  default: "site:.gov declassified archive intelligence documents,uap public testimony documents"
});

const submitUrlSchema = z.object({
  url: z.string().url(),
  notes: z.string().max(4000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional()
});

const submitUploadSchema = z.object({
  storagePath: z.string().min(1).max(600),
  sourceUrl: z.string().url().optional(),
  notes: z.string().max(4000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional()
});

const reviewSchema = z.object({
  evidenceId: z.string().min(1),
  reviewStatus: z.enum(["pending_review", "approved", "rejected"]),
  note: z.string().max(1200).optional()
});

function adminEmails() {
  return ADMIN_EMAILS.value()
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function requireAdmin(request: { auth?: { token?: { email?: string; admin?: boolean } } }) {
  const email = request.auth?.token?.email?.toLowerCase();
  const allowlist = adminEmails();
  if (!request.auth || !email) {
    throw new HttpsError("unauthenticated", "Sign in before using this function.");
  }

  if (allowlist.includes(email)) {
    return email;
  }

  throw new HttpsError("permission-denied", "This account is not in the Red String admin allowlist.");
}

function sha256(input: Buffer | string) {
  return createHash("sha256").update(input).digest("hex");
}

function canonicalize(rawUrl: string) {
  const parsed = new URL(rawUrl);
  parsed.hash = "";
  const sorted = Array.from(parsed.searchParams.entries())
    .filter(([key]) => !key.toLowerCase().startsWith("utm_"))
    .sort(([a], [b]) => a.localeCompare(b));
  parsed.search = "";
  sorted.forEach(([key, value]) => parsed.searchParams.append(key, value));
  return parsed.toString();
}

function platformFromUrl(rawUrl: string) {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, "");
    if (hostname.includes("reddit")) return "reddit";
    if (hostname === "x.com" || hostname.endsWith(".x.com") || hostname.includes("twitter")) return "x";
    if (hostname.includes("youtube") || hostname.includes("youtu.be")) return "youtube";
    if (hostname.endsWith(".gov")) return "government";
    return hostname.split(".").slice(-2).join(".");
  } catch {
    return "web";
  }
}

function evidenceTypeFromContent(contentType: string, rawUrl: string) {
  const lower = contentType.toLowerCase();
  const url = rawUrl.toLowerCase();
  if (lower.includes("image/") || /\.(png|jpe?g|webp|gif)$/i.test(url)) return "image";
  if (lower.includes("pdf") || url.endsWith(".pdf")) return "pdf";
  if (lower.includes("video/") || /\.(mp4|mov|webm)$/i.test(url)) return "video";
  if (lower.includes("text/") || lower.includes("html")) return "text";
  return "link";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `case-${Date.now()}`;
}

async function fetchWithTimeout(url: string, timeoutMs = 18000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "TheRedStringProject/0.1 evidence preservation bot; contact=admin"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function htmlToText(html: string) {
  const $ = load(html);
  $("script, style, nav, footer, iframe, noscript").remove();
  const title = $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const body = $("body").text().replace(/\s+/g, " ").trim();
  return {
    title: title || description || "Untitled evidence",
    text: [description, body].filter(Boolean).join("\n\n").slice(0, 32000),
    image: $('meta[property="og:image"]').attr("content")
  };
}

async function archiveJson(path: string, data: unknown): Promise<ArchivedAsset> {
  const content = Buffer.from(JSON.stringify(data, null, 2));
  await bucket.file(path).save(content, {
    contentType: "application/json",
    metadata: {
      cacheControl: "private, max-age=31536000"
    }
  });
  return {
    path,
    kind: "metadata",
    contentType: "application/json",
    bytes: content.length,
    hash: sha256(content)
  };
}

async function archiveText(path: string, text: string): Promise<ArchivedAsset> {
  const content = Buffer.from(text);
  await bucket.file(path).save(content, {
    contentType: "text/plain; charset=utf-8",
    metadata: {
      cacheControl: "private, max-age=31536000"
    }
  });
  return {
    path,
    kind: "text",
    contentType: "text/plain",
    bytes: content.length,
    hash: sha256(content)
  };
}

async function archiveBytes(path: string, bytes: Buffer, contentType: string, kind: ArchivedAsset["kind"]) {
  await bucket.file(path).save(bytes, {
    contentType,
    metadata: {
      cacheControl: "private, max-age=31536000"
    }
  });
  return {
    path,
    kind,
    contentType,
    bytes: bytes.length,
    hash: sha256(bytes)
  } satisfies ArchivedAsset;
}

async function extractPdfText(bytes: Buffer) {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text.replace(/\s+/g, " ").trim().slice(0, 32000);
  } finally {
    await parser.destroy();
  }
}

async function enqueueAnalysis(evidenceId: string) {
  const queue = getFunctions().taskQueue("analyzeEvidenceTask");
  await queue.enqueue({ evidenceId }, { dispatchDeadlineSeconds: 540 });
}

async function queueAnalysisBestEffort(evidenceId: string) {
  try {
    await enqueueAnalysis(evidenceId);
  } catch (error) {
    logger.error("Analysis enqueue failed", { evidenceId, error });
    await db.collection("analysis_jobs").doc(evidenceId).set(
      {
        evidence_id: evidenceId,
        status: "enqueue_failed",
        error: error instanceof Error ? error.message : String(error),
        updated_at: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }
}

async function createEvidenceFromUrl(input: {
  url: string;
  notes?: string;
  tags?: string[];
  discoverySource?: string;
}) {
  const canonicalUrl = canonicalize(input.url);
  const existing = await db
    .collection("evidences")
    .where("canonical_url", "==", canonicalUrl)
    .limit(1)
    .get();
  if (!existing.empty) {
    return { evidenceId: existing.docs[0].id, status: "duplicate" };
  }

  const evidenceId = `ev-${sha256(canonicalUrl).slice(0, 18)}`;
  const root = `archives/${evidenceId}`;
  const retrievedAt = FieldValue.serverTimestamp();
  let title = canonicalUrl;
  let contentText = "";
  let contentHash = sha256(canonicalUrl);
  let archiveStatus: EvidenceRecord["archive_status"] = "link_only";
  let type: EvidenceRecord["type"] = "link";
  const archivedAssets: ArchivedAsset[] = [];

  try {
    const response = await fetchWithTimeout(canonicalUrl);
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    type = evidenceTypeFromContent(contentType, canonicalUrl);

    if (!response.ok) {
      archiveStatus = response.status === 403 || response.status === 401 ? "blocked" : "failed";
      contentText = `Fetch failed with HTTP ${response.status}. Source link retained for manual review.`;
    } else if (type === "image" || type === "pdf") {
      const bytes = Buffer.from(await response.arrayBuffer());
      contentHash = sha256(bytes);
      title = decodeURIComponent(new URL(canonicalUrl).pathname.split("/").pop() || canonicalUrl);
      contentText = `${type.toUpperCase()} evidence archived from ${canonicalUrl}.`;
      const extension = type === "pdf" ? "pdf" : contentType.split("/")[1]?.split(";")[0] || "bin";
      archivedAssets.push(await archiveBytes(`${root}/source.${extension}`, bytes, contentType, type === "pdf" ? "pdf" : "image"));
      if (type === "pdf") {
        try {
          const pdfText = await extractPdfText(bytes);
          if (pdfText) {
            contentText = pdfText;
            archivedAssets.push(await archiveText(`${root}/extracted.txt`, pdfText));
          }
        } catch (error) {
          logger.warn("PDF text extraction failed", { canonicalUrl, error });
          archivedAssets.push(
            await archiveJson(`${root}/pdf-extraction.json`, {
              status: "failed",
              reason: error instanceof Error ? error.message : String(error)
            })
          );
        }
      }
      archiveStatus = "archived";
    } else if (contentType.includes("html")) {
      const html = await response.text();
      contentHash = sha256(html);
      const extracted = htmlToText(html);
      title = extracted.title;
      contentText = extracted.text || `HTML source at ${canonicalUrl} had no extractable body text.`;
      archivedAssets.push(await archiveText(`${root}/extracted.txt`, contentText));
      archivedAssets.push(
        await archiveJson(`${root}/metadata.json`, {
          canonical_url: canonicalUrl,
          retrieved_at: new Date().toISOString(),
          content_type: contentType,
          og_image: extracted.image ?? null,
          source_hash: contentHash
        })
      );
      archiveStatus = "archived";
    } else {
      const text = await response.text();
      contentHash = sha256(text);
      title = decodeURIComponent(new URL(canonicalUrl).pathname.split("/").pop() || canonicalUrl);
      contentText = text.slice(0, 32000) || `Source retained at ${canonicalUrl}.`;
      archivedAssets.push(await archiveText(`${root}/extracted.txt`, contentText));
      archiveStatus = "archived";
    }
  } catch (error) {
    logger.warn("URL preservation failed", { canonicalUrl, error });
    archiveStatus = "failed";
    contentText = "Automatic preservation failed. Source link retained for manual review.";
  }

  const record: EvidenceRecord = {
    title,
    type,
    platform: platformFromUrl(canonicalUrl),
    source_url: input.url,
    canonical_url: canonicalUrl,
    content_text: contentText,
    credibility_score: 0,
    credibility_explanation: "Queued for Gemini credibility analysis.",
    credibility_breakdown: {},
    manipulation_flags: [],
    entities: [],
    tags: input.tags ?? [],
    archive_status: archiveStatus,
    archived_assets: archivedAssets,
    content_hash: contentHash,
    linked_conspiracy_ids: [],
    retrieved_at: retrievedAt,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    analysis_status: "queued",
    review_status: input.discoverySource ? "pending_review" : "approved",
    ...(input.discoverySource ? { discovery_source: input.discoverySource } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };

  await db.collection("evidences").doc(evidenceId).set(record);
  await db.collection("analysis_jobs").doc(evidenceId).set({
    evidence_id: evidenceId,
    status: "queued",
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp()
  });
  await queueAnalysisBestEffort(evidenceId);
  return { evidenceId, status: "queued" };
}

function fallbackAnalysis(record: FirebaseFirestore.DocumentData): AnalysisResult {
  const text = `${record.title ?? ""} ${record.content_text ?? ""}`;
  const candidates = Array.from(new Set(text.match(/\b[A-Z][A-Za-z0-9&.-]{2,}\b/g) ?? [])).slice(0, 10);
  const hasArchive = record.archive_status === "archived";
  const score = Math.min(82, Math.max(25, 42 + (hasArchive ? 18 : 0) + candidates.length * 2));
  return {
    title: record.title ?? "Untitled evidence",
    summary: String(record.content_text ?? "").slice(0, 360) || "Evidence queued without extracted text.",
    entities: candidates,
    tags: [...new Set([...(record.tags ?? []), ...candidates.slice(0, 4).map((item) => item.toLowerCase())])],
    credibility_score: score,
    credibility_explanation: hasArchive
      ? "Fallback score: local preservation succeeded, but Gemini analysis is not configured yet."
      : "Fallback score: source link is retained, but local preservation or Gemini analysis is incomplete.",
    credibility_breakdown: {
      source_trust: score,
      cross_verification: Math.max(20, score - 18),
      logical_coherence: score,
      manipulation_risk: Math.max(10, 100 - score),
      provenance: hasArchive ? 74 : 38
    },
    manipulation_flags: hasArchive ? [] : ["archive incomplete"],
    suggested_connections: candidates.slice(0, 3).map((label) => ({
      label,
      type: "correlates",
      weight: Math.min(0.82, Math.max(0.35, score / 100)),
      reason: `Entity "${label}" appears in the extracted evidence text.`
    }))
  };
}

async function runGeminiAnalysis(record: FirebaseFirestore.DocumentData, apiKey?: string): Promise<AnalysisResult> {
  if (!apiKey) {
    return fallbackAnalysis(record);
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: credibilityPrompt({
      url: record.canonical_url,
      title: record.title,
      content: record.content_text,
      archiveStatus: record.archive_status,
      notes: record.notes
    }),
    config: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  const parsed = JSON.parse(response.text ?? "{}") as Partial<AnalysisResult>;
  return {
    title: String(parsed.title ?? record.title ?? "Untitled evidence").slice(0, 180),
    summary: String(parsed.summary ?? record.content_text ?? "").slice(0, 1600),
    entities: Array.isArray(parsed.entities) ? parsed.entities.map(String).slice(0, 24) : [],
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => String(tag).toLowerCase()).slice(0, 24) : [],
    credibility_score: Math.max(0, Math.min(100, Number(parsed.credibility_score ?? 0))),
    credibility_explanation: String(parsed.credibility_explanation ?? "Gemini returned no explanation.").slice(0, 2400),
    credibility_breakdown: parsed.credibility_breakdown ?? {},
    manipulation_flags: Array.isArray(parsed.manipulation_flags) ? parsed.manipulation_flags.map(String).slice(0, 12) : [],
    suggested_connections: Array.isArray(parsed.suggested_connections)
      ? parsed.suggested_connections
          .map((connection) => ({
            label: String(connection.label ?? "").slice(0, 120),
            type: (connection.type === "supports" || connection.type === "contradicts"
              ? connection.type
              : "correlates") as AnalysisResult["suggested_connections"][number]["type"],
            weight: Math.max(0.1, Math.min(1, Number(connection.weight ?? 0.5))),
            reason: String(connection.reason ?? "Gemini suggested a semantic connection.").slice(0, 1200)
          }))
          .filter((connection) => connection.label)
          .slice(0, 8)
      : []
  };
}

async function embedText(text: string, apiKey?: string) {
  if (!apiKey) {
    const hash = sha256(text);
    return Array.from({ length: 32 }, (_, index) => parseInt(hash.slice(index * 2, index * 2 + 2), 16) / 255);
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text.slice(0, 12000),
    config: {
      outputDimensionality: 768
    }
  });
  const embedding = response.embeddings?.[0]?.values;
  return Array.isArray(embedding) ? embedding : [];
}

async function findSimilarEvidence(evidenceId: string, embedding: number[]) {
  if (!embedding.length) {
    return [];
  }

  try {
    const vectorQuery = (db.collection("evidences") as unknown as {
      findNearest: (options: Record<string, unknown>) => { get: () => Promise<FirebaseFirestore.QuerySnapshot> };
    }).findNearest({
      vectorField: "embedding",
      queryVector: embedding,
      limit: 8,
      distanceMeasure: "COSINE",
      distanceThreshold: 0.35
    });
    const snapshot = await vectorQuery.get();
    return snapshot.docs.filter((doc) => doc.id !== evidenceId).slice(0, 6);
  } catch (error) {
    logger.info("Vector query unavailable; using recent evidence fallback", { error });
    const snapshot = await db.collection("evidences").orderBy("created_at", "desc").limit(8).get();
    return snapshot.docs.filter((doc) => doc.id !== evidenceId).slice(0, 4);
  }
}

function oracleTerms(question: string) {
  const terms = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !["show", "with", "and", "the", "for", "all", "cases", "case", "evidence", "connecting"].includes(term));
  const expanded = new Set(terms);
  if (expanded.has("uap") || expanded.has("ufo")) {
    ["uap", "ufo", "unidentified", "anomalous", "craft", "aerospace"].forEach((term) => expanded.add(term));
  }
  if (expanded.has("mkultra") || expanded.has("mk")) {
    ["mkultra", "cia", "mind-control", "documents"].forEach((term) => expanded.add(term));
  }
  return Array.from(expanded);
}

function scoreOracleDocument(data: FirebaseFirestore.DocumentData, terms: string[]) {
  const text = [
    data.title,
    data.content_text,
    data.platform,
    data.type,
    ...(Array.isArray(data.entities) ? data.entities : []),
    ...(Array.isArray(data.tags) ? data.tags : [])
  ]
    .join(" ")
    .toLowerCase();
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

async function keywordEvidenceFallback(question: string, credibilityMin: number) {
  const snapshot = await db.collection("evidences").where("credibility_score", ">=", credibilityMin).limit(60).get();
  const terms = oracleTerms(question);
  const ranked = snapshot.docs
    .map((doc) => ({ doc, score: scoreOracleDocument(doc.data(), terms) }))
    .sort((a, b) => b.score - a.score || Number(b.doc.data().credibility_score ?? 0) - Number(a.doc.data().credibility_score ?? 0));
  const matches = ranked.filter((item) => item.score > 0);
  return (matches.length ? matches : ranked).map((item) => item.doc).slice(0, 8);
}

function mergeEvidenceDocs(...groups: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const seen = new Set<string>();
  return groups.filter((doc) => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  });
}

async function upsertCase(label: string, evidenceId: string, analysis: AnalysisResult, embedding: number[]) {
  const id = `case-${slugify(label)}`;
  const ref = db.collection("conspiracies").doc(id);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      transaction.set(ref, {
        title: label,
        summary: analysis.summary,
        credibility_avg: analysis.credibility_score,
        evidence_count: 1,
        string_count: 1,
        tags: analysis.tags.slice(0, 10),
        thumbnail: null,
        last_weaved: FieldValue.serverTimestamp(),
        embedding
      });
      return;
    }

    const existing = snap.data() ?? {};
    const evidenceCount = Number(existing.evidence_count ?? 0) + 1;
    const previousAverage = Number(existing.credibility_avg ?? analysis.credibility_score);
    transaction.update(ref, {
      credibility_avg: Math.round(((previousAverage * (evidenceCount - 1)) + analysis.credibility_score) / evidenceCount),
      evidence_count: evidenceCount,
      string_count: Number(existing.string_count ?? 0) + 1,
      tags: Array.from(new Set([...(existing.tags ?? []), ...analysis.tags])).slice(0, 20),
      last_weaved: FieldValue.serverTimestamp()
    });
  });

  await db.collection("connections").doc(`${evidenceId}-${id}`).set(
    {
      from: evidenceId,
      to: id,
      type: "correlates",
      weight: Math.max(0.2, Math.min(1, analysis.credibility_score / 100)),
      ai_reason: `Evidence analysis identified "${label}" as a related case/entity.`,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return id;
}

export const submitEvidenceUrl = onCall({ region: "us-central1" }, async (request) => {
  requireAdmin(request);
  const input = submitUrlSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Evidence URL submission is invalid.", input.error.flatten());
  }
  return createEvidenceFromUrl(input.data);
});

export const submitEvidenceUpload = onCall({ region: "us-central1" }, async (request) => {
  requireAdmin(request);
  const input = submitUploadSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Evidence upload submission is invalid.", input.error.flatten());
  }
  const uploadInput = input.data;
  const file = bucket.file(uploadInput.storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError("not-found", "Uploaded file was not found in Cloud Storage.");
  }

  const [metadata] = await file.getMetadata();
  const [bytes] = await file.download();
  const evidenceId = `ev-${sha256(`${uploadInput.storagePath}:${sha256(bytes)}`).slice(0, 18)}`;
  const archivePath = `archives/${evidenceId}/source-${metadata.name?.split("/").pop() ?? "upload"}`;
  await bucket.file(archivePath).save(bytes, {
    contentType: metadata.contentType ?? "application/octet-stream",
    metadata: { cacheControl: "private, max-age=31536000" }
  });

  const sourceUrl = uploadInput.sourceUrl ?? `storage://${archivePath}`;
  const type = evidenceTypeFromContent(metadata.contentType ?? "", archivePath);
  let contentText = `Uploaded ${type} evidence preserved at ${archivePath}.`;
  const archivedAssets: ArchivedAsset[] = [
    {
      path: archivePath,
      kind: type === "pdf" ? "pdf" : type === "image" ? "image" : "source",
      contentType: metadata.contentType ?? "application/octet-stream",
      bytes: bytes.length,
      hash: sha256(bytes)
    }
  ];

  if (type === "pdf") {
    try {
      const pdfText = await extractPdfText(bytes);
      if (pdfText) {
        contentText = pdfText;
        archivedAssets.push(await archiveText(`archives/${evidenceId}/extracted.txt`, pdfText));
      }
    } catch (error) {
      logger.warn("Uploaded PDF text extraction failed", { evidenceId, error });
      archivedAssets.push(
        await archiveJson(`archives/${evidenceId}/pdf-extraction.json`, {
          status: "failed",
          reason: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }

  const record: EvidenceRecord = {
    title: String(metadata.metadata?.originalName ?? metadata.name?.split("/").pop() ?? "Uploaded evidence"),
    type,
    platform: "user_upload",
    source_url: sourceUrl,
    canonical_url: sourceUrl,
    content_text: contentText,
    media_url: archivePath,
    credibility_score: 0,
    credibility_explanation: "Queued for Gemini credibility analysis.",
    credibility_breakdown: {},
    manipulation_flags: [],
    entities: [],
    tags: uploadInput.tags ?? [],
    archive_status: "archived",
    archived_assets: archivedAssets,
    content_hash: sha256(bytes),
    linked_conspiracy_ids: [],
    retrieved_at: FieldValue.serverTimestamp(),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    analysis_status: "queued",
    review_status: "approved",
    ...(uploadInput.notes ? { notes: uploadInput.notes } : {})
  };

  await db.collection("evidences").doc(evidenceId).set(record);
  await db.collection("analysis_jobs").doc(evidenceId).set({
    evidence_id: evidenceId,
    status: "queued",
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp()
  });
  await queueAnalysisBestEffort(evidenceId);
  return { evidenceId, status: "queued" };
});

export const setEvidenceReviewStatus = onCall({ region: "us-central1" }, async (request) => {
  const reviewerEmail = requireAdmin(request);
  const input = reviewSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Review update is invalid.", input.error.flatten());
  }
  const reviewInput = input.data;
  await db.collection("evidences").doc(reviewInput.evidenceId).set(
    {
      review_status: reviewInput.reviewStatus,
      review_note: reviewInput.note ?? null,
      reviewed_by: reviewerEmail,
      reviewed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return {
    evidenceId: reviewInput.evidenceId,
    reviewStatus: reviewInput.reviewStatus
  };
});

export const analyzeEvidenceTask = onTaskDispatched(
  {
    region: "us-central1",
    secrets: [GEMINI_API_KEY],
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 20
    },
    rateLimits: {
      maxConcurrentDispatches: 3
    }
  },
  async (request) => {
    const evidenceId = String(request.data?.evidenceId ?? "");
    if (!evidenceId) {
      logger.warn("Task missing evidenceId");
      return;
    }

    const ref = db.collection("evidences").doc(evidenceId);
    await ref.update({
      analysis_status: "analyzing",
      updated_at: FieldValue.serverTimestamp()
    });
    await db.collection("analysis_jobs").doc(evidenceId).set(
      {
        evidence_id: evidenceId,
        status: "running",
        updated_at: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    try {
      const snap = await ref.get();
      if (!snap.exists) {
        logger.warn("Evidence missing before analysis", { evidenceId });
        return;
      }
      const record = snap.data() ?? {};
      const apiKey = GEMINI_API_KEY.value();
      const analysis = await runGeminiAnalysis(record, apiKey);
      const embedding = await embedText(`${analysis.title}\n${analysis.summary}\n${record.content_text ?? ""}`, apiKey);

      const linkedCaseIds: string[] = [];
      for (const connection of analysis.suggested_connections.slice(0, 5)) {
        linkedCaseIds.push(await upsertCase(connection.label, evidenceId, analysis, embedding));
      }

      if (linkedCaseIds.length === 0 && analysis.entities[0]) {
        linkedCaseIds.push(await upsertCase(analysis.entities[0], evidenceId, analysis, embedding));
      }

      const similar = await findSimilarEvidence(evidenceId, embedding);
      await Promise.all(
        similar.map((doc) =>
          db.collection("connections").doc(`${evidenceId}-${doc.id}`).set(
            {
              from: evidenceId,
              to: doc.id,
              type: "correlates",
              weight: 0.52,
              ai_reason: "Firestore vector search or fallback retrieval found semantic similarity.",
              created_at: FieldValue.serverTimestamp(),
              updated_at: FieldValue.serverTimestamp()
            },
            { merge: true }
          )
        )
      );

      await ref.update({
        title: analysis.title,
        content_text: analysis.summary || record.content_text,
        credibility_score: analysis.credibility_score,
        credibility_explanation: analysis.credibility_explanation,
        credibility_breakdown: analysis.credibility_breakdown,
        manipulation_flags: analysis.manipulation_flags,
        entities: analysis.entities,
        tags: Array.from(new Set([...(record.tags ?? []), ...analysis.tags])),
        linked_conspiracy_ids: Array.from(new Set(linkedCaseIds)),
        embedding,
        analysis_status: "complete",
        updated_at: FieldValue.serverTimestamp()
      });

      await db.collection("analysis_jobs").doc(evidenceId).set(
        {
          evidence_id: evidenceId,
          status: "complete",
          updated_at: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    } catch (error) {
      logger.error("Evidence analysis failed", { evidenceId, error });
      await ref.update({
        analysis_status: "failed",
        credibility_explanation: "Analysis failed. Source and archive metadata remain available for manual review.",
        updated_at: FieldValue.serverTimestamp()
      });
      await db.collection("analysis_jobs").doc(evidenceId).set(
        {
          evidence_id: evidenceId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          updated_at: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      throw error;
    }
  }
);

export const runSearchDiscovery = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "America/Chicago",
    region: "us-central1",
    secrets: [GOOGLE_PSE_API_KEY]
  },
  async () => {
    const apiKey = GOOGLE_PSE_API_KEY.value();
    const cx = GOOGLE_PSE_CX.value();
    if (!apiKey || !cx) {
      logger.warn("Google PSE discovery skipped; GOOGLE_PSE_API_KEY or GOOGLE_PSE_CX is missing.");
      return;
    }

    const configured = await db.collection("discovery_queries").where("active", "==", true).limit(20).get();
    const queries = configured.empty
      ? DEFAULT_SEARCH_QUERIES.value().split(",").map((query) => query.trim()).filter(Boolean)
      : configured.docs.map((doc) => String(doc.data().query ?? "")).filter(Boolean);

    for (const searchQuery of queries) {
      const runRef = db.collection("search_runs").doc();
      await runRef.set({
        query: searchQuery,
        provider: "google_pse",
        status: "running",
        created_at: FieldValue.serverTimestamp()
      });

      try {
        const params = new URLSearchParams({
          key: apiKey,
          cx,
          q: searchQuery,
          num: "5",
          safe: "active"
        });
        const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Google PSE returned ${response.status}`);
        }
        const payload = (await response.json()) as {
          items?: Array<{ link?: string; title?: string; snippet?: string }>;
        };

        const results = payload.items ?? [];
        for (const item of results) {
          if (!item.link) continue;
          await createEvidenceFromUrl({
            url: item.link,
            notes: `Discovered by Google PSE query: ${searchQuery}\n${item.snippet ?? ""}`,
            tags: ["discovery"],
            discoverySource: "google_pse"
          });
        }

        await runRef.update({
          status: "complete",
          result_count: results.length,
          updated_at: FieldValue.serverTimestamp()
        });
      } catch (error) {
        logger.error("Search discovery failed", { searchQuery, error });
        await runRef.update({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          updated_at: FieldValue.serverTimestamp()
        });
      }
    }
  }
);

export const oracleAsk = onCall(
  {
    region: "us-central1",
    secrets: [GEMINI_API_KEY]
  },
  async (request) => {
    requireAdmin(request);
    const question = String(request.data?.question ?? "").trim();
    const credibilityMin = Math.max(0, Math.min(100, Number(request.data?.credibilityMin ?? 0)));
    if (!question) {
      throw new HttpsError("invalid-argument", "Question is required.");
    }

    const apiKey = GEMINI_API_KEY.value();
    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await embedText(question, apiKey);
    } catch (error) {
      logger.error("Oracle embedding failed; using keyword fallback", { error });
    }

    const vectorDocs = queryEmbedding.length ? await findSimilarEvidence("__oracle__", queryEmbedding) : [];
    const fallbackDocs = vectorDocs.length < 3 ? await keywordEvidenceFallback(question, credibilityMin) : [];
    const evidenceDocs = mergeEvidenceDocs(...vectorDocs, ...fallbackDocs);

    const candidates = evidenceDocs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as FirebaseFirestore.DocumentData & { id: string })
      .filter((doc) => Number(doc.credibility_score ?? 0) >= credibilityMin)
      .slice(0, 8);

    const context = candidates
      .map(
        (item, index) =>
          `[${index + 1}] ${item.title}\nCredibility: ${item.credibility_score}/100\nSource: ${item.source_url}\nArchive: ${item.archive_status}\n${item.content_text}`
      )
      .join("\n\n");

    let answer = "No preserved evidence matched the question at the requested credibility threshold.";
    if (context) {
      if (apiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: oraclePrompt({ question, credibilityMin, context }),
            config: { temperature: 0.2 }
          });
          answer = response.text ?? answer;
        } catch (error) {
          logger.error("Oracle Gemini answer failed; returning retrieval summary", { error });
          answer = "Gemini could not complete the reasoning step, so this is a retrieval summary over matching preserved evidence.";
        }
      } else {
        answer = "Gemini is not configured, so this answer is a retrieval summary over matching preserved evidence.";
      }
    }

    return {
      answer,
      citations: candidates.map((item) => ({
        evidenceId: item.id,
        title: String(item.title ?? "Untitled evidence"),
        sourceUrl: String(item.source_url ?? ""),
        archiveStatus: item.archive_status ?? "link_only",
        credibility: Number(item.credibility_score ?? 0)
      }))
    };
  }
);
