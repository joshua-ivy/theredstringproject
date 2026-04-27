import { createHash } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { load } from "cheerio";
import { PDFParse } from "pdf-parse";

const projectId = "the-red-string-project";

initializeApp({
  credential: applicationDefault(),
  projectId,
  storageBucket: "the-red-string-project.firebasestorage.app"
});

const db = getFirestore();
const bucket = getStorage().bucket();

const sources = [
  {
    id: "evidence-nasa-uap-final-report",
    title: "NASA UAP Independent Study Team final report",
    url: "https://www.nasa.gov/wp-content/uploads/2023/09/uap-independent-study-team-final-report-0.pdf",
    type: "pdf",
    platform: "government",
    score: 88,
    explanation:
      "Official NASA report with stable government provenance and local archived PDF/text extraction. Credibility reflects source quality, not proof of any interpretation beyond the document.",
    tags: ["uap", "ufo", "nasa", "official-source", "scientific-review"],
    entities: ["NASA", "UAP Independent Study Team", "Unidentified Anomalous Phenomena"]
  },
  {
    id: "evidence-aaro-fy23-uap-report",
    title: "AARO FY23 consolidated annual report on UAP",
    url: "https://www.aaro.mil/Portals/136/PDFs/UNCLASSIFIED-FY23_Consolidated_Annual_Report_on_UAP-Oct_25_2023_1236.pdf",
    type: "pdf",
    platform: "military",
    score: 87,
    explanation:
      "Official AARO report with Department of Defense provenance and local archived PDF/text extraction. Credibility reflects source authenticity and reporting context, not confirmation of extraordinary claims.",
    tags: ["uap", "ufo", "aaro", "dod", "official-source", "annual-report"],
    entities: ["AARO", "Department of Defense", "Unidentified Anomalous Phenomena"]
  },
  {
    id: "evidence-aaro-uap-records",
    title: "AARO UAP records index",
    url: "https://www.aaro.mil/UAP-Records/",
    type: "text",
    platform: "military",
    score: 84,
    explanation:
      "Official AARO records index archived with extracted page text and metadata. It is strong as a source trail, while each listed item still needs its own document-level review.",
    tags: ["uap", "ufo", "aaro", "records", "official-source"],
    entities: ["AARO", "NARA", "NASA", "UAP records"]
  },
  {
    id: "evidence-aaro-official-uap-imagery",
    title: "AARO official UAP imagery page",
    url: "https://www.aaro.mil/UAP-Cases/Official-UAP-Imagery/",
    type: "text",
    platform: "military",
    score: 83,
    explanation:
      "Official AARO imagery index archived with extracted page text and metadata. It supports that official imagery cases exist, while individual media still needs case-specific analysis.",
    tags: ["uap", "ufo", "aaro", "imagery", "official-source"],
    entities: ["AARO", "Official UAP Imagery", "UAP cases"]
  },
  {
    id: "evidence-nasa-uap-resource-page",
    title: "NASA UAP resource page",
    url: "https://science.nasa.gov/uap",
    type: "text",
    platform: "government",
    score: 84,
    explanation:
      "Official NASA resource page archived with extracted page text and metadata. It is a reliable source trail for NASA's UAP study materials and related public briefings.",
    tags: ["uap", "ufo", "nasa", "official-source", "resource-page"],
    entities: ["NASA", "Unidentified Anomalous Phenomena", "UAP Independent Study"]
  }
];

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function canonicalize(rawUrl) {
  const parsed = new URL(rawUrl);
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString();
}

function htmlToText(html) {
  const $ = load(html);
  $("script, style, nav, footer, iframe, noscript").remove();
  const title = $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const body = $("body").text().replace(/\s+/g, " ").trim();
  return {
    title,
    text: [description, body].filter(Boolean).join("\n\n").slice(0, 32000)
  };
}

async function archiveText(path, text) {
  const bytes = Buffer.from(text);
  await bucket.file(path).save(bytes, {
    contentType: "text/plain; charset=utf-8",
    metadata: { cacheControl: "private, max-age=31536000" }
  });
  return {
    path,
    kind: "text",
    contentType: "text/plain",
    bytes: bytes.length,
    hash: sha256(bytes)
  };
}

async function archiveJson(path, data) {
  const bytes = Buffer.from(JSON.stringify(data, null, 2));
  await bucket.file(path).save(bytes, {
    contentType: "application/json",
    metadata: { cacheControl: "private, max-age=31536000" }
  });
  return {
    path,
    kind: "metadata",
    contentType: "application/json",
    bytes: bytes.length,
    hash: sha256(bytes)
  };
}

async function archiveBytes(path, bytes, contentType, kind) {
  await bucket.file(path).save(bytes, {
    contentType,
    metadata: { cacheControl: "private, max-age=31536000" }
  });
  return {
    path,
    kind,
    contentType,
    bytes: bytes.length,
    hash: sha256(bytes)
  };
}

async function extractPdfText(bytes) {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text.replace(/\s+/g, " ").trim().slice(0, 32000);
  } finally {
    await parser.destroy();
  }
}

async function preserve(source) {
  const canonicalUrl = canonicalize(source.url);
  const root = `archives/${source.id}`;
  const response = await fetch(canonicalUrl, {
    headers: { "user-agent": "TheRedStringProject/0.1 evidence preservation bot; contact=admin" }
  });
  const assets = [];
  let contentText = `${source.title} official source retained at ${canonicalUrl}.`;
  let contentHash = sha256(`${canonicalUrl}:${response.status}`);
  let archiveStatus = response.ok ? "archived" : response.status === 401 || response.status === 403 ? "blocked" : "failed";

  if (!response.ok) {
    assets.push(
      await archiveJson(`${root}/metadata.json`, {
        canonical_url: canonicalUrl,
        retrieved_at: new Date().toISOString(),
        fetch_status: response.status,
        source_hash: contentHash
      })
    );
    contentText = `${source.title}. Automatic local mirroring returned HTTP ${response.status}; the official source link is retained for review. Tags: ${source.tags.join(", ")}. Entities: ${source.entities.join(", ")}.`;
  } else {
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const bytes = Buffer.from(await response.arrayBuffer());
    contentHash = sha256(bytes);

    if (source.type === "pdf") {
      assets.push(await archiveBytes(`${root}/source.pdf`, bytes, contentType, "pdf"));
      contentText = await extractPdfText(bytes);
      assets.push(await archiveText(`${root}/extracted.txt`, contentText));
    } else {
      const html = bytes.toString("utf8");
      const extracted = htmlToText(html);
      contentText = extracted.text || `${source.title} archived from ${canonicalUrl}.`;
      assets.push(await archiveBytes(`${root}/source.html`, bytes, contentType, "source"));
      assets.push(await archiveText(`${root}/extracted.txt`, contentText));
    }

    assets.push(
      await archiveJson(`${root}/metadata.json`, {
        canonical_url: canonicalUrl,
        retrieved_at: new Date().toISOString(),
        content_type: contentType,
        source_hash: contentHash
      })
    );
  }

  return {
    id: source.id,
    title: source.title,
    type: source.type,
    platform: source.platform,
    source_url: source.url,
    canonical_url: canonicalUrl,
    content_text: contentText,
    credibility_score: source.score,
    credibility_explanation: source.explanation,
    credibility_breakdown: {
      source_trust: 94,
      cross_verification: 70,
      logical_coherence: 82,
      manipulation_risk: 4,
      provenance: 96
    },
    manipulation_flags: [],
    entities: source.entities,
    tags: source.tags,
    archive_status: archiveStatus,
    archived_assets: assets,
    content_hash: contentHash,
    linked_conspiracy_ids: [],
    retrieved_at: FieldValue.serverTimestamp(),
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    analysis_status: "complete",
    review_status: "approved",
    review_note: "Seeded official UAP source for Oracle retrieval and evidence intake."
  };
}

const results = [];
for (const source of sources) {
  const record = await preserve(source);
  await db.collection("evidences").doc(source.id).set(record, { merge: true });
  results.push({
    id: source.id,
    title: source.title,
    score: source.score,
    assets: record.archived_assets.length
  });
}

console.log(JSON.stringify({ seeded: results }, null, 2));
