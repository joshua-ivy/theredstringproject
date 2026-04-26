"use client";

import { FormEvent, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytesResumable } from "firebase/storage";
import { ExternalLink, FileUp, Loader2, Send, Upload } from "lucide-react";
import { auth, functions, storage } from "@/lib/firebase";
import type { Evidence } from "@/types/domain";

interface EvidenceLockerProps {
  evidences: Evidence[];
  isAdminHint: boolean;
  onSelect: (id: string) => void;
}

type FilterKey = "all" | "approved" | "review";

function manipulationScore(evidence: Evidence) {
  return Math.max(4, Math.min(90, 100 - evidence.credibility_score + (evidence.manipulation_flags?.length ?? 0) * 12));
}

function ScoreLine({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const color = inverse
    ? value < 15 ? "var(--green)" : value < 35 ? "var(--amber)" : "var(--red)"
    : value > 75 ? "var(--green)" : value > 50 ? "var(--amber)" : "var(--red)";
  return (
    <div className="locker-score-line">
      <div><span>{label}</span><strong>{value}<em>/100</em></strong></div>
      <i><b style={{ width: `${value}%`, background: color, boxShadow: `0 0 6px ${color}` }} /></i>
    </div>
  );
}

function CredibilityBuckets({ evidences }: { evidences: Evidence[] }) {
  const buckets = [
    { label: "0-25", count: evidences.filter((item) => item.credibility_score <= 25).length, color: "var(--red)" },
    { label: "26-50", count: evidences.filter((item) => item.credibility_score > 25 && item.credibility_score <= 50).length, color: "oklch(0.70 0.18 35)" },
    { label: "51-75", count: evidences.filter((item) => item.credibility_score > 50 && item.credibility_score <= 75).length, color: "var(--amber)" },
    { label: "76-100", count: evidences.filter((item) => item.credibility_score > 75).length, color: "var(--green)" }
  ];
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

  return (
    <div className="cred-buckets">
      <div>
        {buckets.map((bucket) => (
          <span key={bucket.label}>
            <em>{bucket.count}</em>
            <b style={{ height: `${Math.max(8, (bucket.count / max) * 42)}px`, background: bucket.color }} />
          </span>
        ))}
      </div>
      <div>
        {buckets.map((bucket) => <small key={bucket.label}>{bucket.label}</small>)}
      </div>
    </div>
  );
}

export function EvidenceLocker({ evidences, isAdminHint, onSelect }: EvidenceLockerProps) {
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  const filteredEvidence = useMemo(() => {
    if (filter === "approved") {
      return evidences.filter((item) => (item.review_status ?? "approved") === "approved");
    }
    if (filter === "review") {
      return evidences.filter((item) => (item.review_status ?? "approved") !== "approved");
    }
    return evidences;
  }, [evidences, filter]);

  const archivedCount = useMemo(
    () => evidences.filter((evidence) => evidence.archive_status === "archived").length,
    [evidences]
  );
  const highCount = evidences.filter((evidence) => evidence.credibility_score >= 75).length;
  const flaggedCount = evidences.filter((evidence) => manipulationScore(evidence) > 30).length;

  async function submitUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const callable = httpsCallable<
        { url: string; notes?: string; tags?: string[] },
        { evidenceId: string; status: string }
      >(functions, "submitEvidenceUrl");
      const result = await callable({
        url: url.trim(),
        notes: notes.trim() || undefined,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      });
      setMessage(`Queued evidence ${result.data.evidenceId} (${result.data.status}).`);
      setUrl("");
      setNotes("");
      setTags("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Evidence submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitUpload() {
    if (!file) return;

    setSubmitting(true);
    setUploadProgress(0);
    setMessage(null);
    try {
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("You must be signed in before uploading evidence.");
      const path = `pending-uploads/${uid}/${crypto.randomUUID()}-${safeName}`;
      const uploadRef = ref(storage, path);
      const task = uploadBytesResumable(uploadRef, file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: { originalName: file.name }
      });

      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snapshot) => setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
          reject,
          () => resolve()
        );
      });

      const callable = httpsCallable<
        { storagePath: string; sourceUrl?: string; notes?: string; tags?: string[] },
        { evidenceId: string; status: string }
      >(functions, "submitEvidenceUpload");
      const result = await callable({
        storagePath: path,
        sourceUrl: url.trim() || undefined,
        notes: notes.trim() || undefined,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      });
      setMessage(`Uploaded and queued evidence ${result.data.evidenceId}.`);
      setFile(null);
      setUploadProgress(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed. Check custom admin claims and Storage rules.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="locker-view exact-locker">
      <section className="locker-intake exact-intake">
        <div className="section-title">
          <Upload size={14} />
          <div>
            <p>Evidence Intake</p>
            <h2>Preserve a link or file</h2>
          </div>
        </div>

        {isAdminHint ? (
          <>
            <form className="intake-form exact-form" onSubmit={submitUrl}>
              <label>
                Source URL
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/evidence" type="url" />
              </label>
              <label>
                Tags
                <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="cia, pdf, testimony" />
              </label>
              <label>
                Intake notes
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Context, why this matters, or source caveats" />
              </label>

              <div>
                <div className="label-tag">Initial credibility</div>
                <div className="segmented">
                  {["low", "med", "high", "auto"].map((item) => (
                    <button type="button" className={item === "auto" ? "active" : ""} key={item}>{item}</button>
                  ))}
                </div>
              </div>

              <button className="primary-button" type="submit" disabled={submitting || !url.trim()}>
                {submitting ? <Loader2 className="spin" size={15} /> : <Send size={14} />}
                Submit URL
              </button>
            </form>

            <label className="upload-button">
              <FileUp size={14} />
              <span>{file ? file.name : "Upload file"}</span>
              <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
            {file ? (
              <button className="secondary-button exact-upload-submit" onClick={submitUpload} disabled={submitting}>
                Queue upload
              </button>
            ) : null}
            {uploadProgress !== null ? <span className="upload-progress">{uploadProgress}%</span> : null}
            {message ? <p className="system-message">{message}</p> : null}
          </>
        ) : (
          <div className="admin-only-panel">
            <p className="red-label">Read-only archive</p>
            <span>Evidence intake is hidden from public visitors. Sign in with an approved admin account to preserve links, upload files, and queue analysis.</span>
          </div>
        )}

        <div className="preservation-note">
          <p className="red-label">Preservation</p>
          <span>URLs are timestamped, hashed, and stored with redaction notes. Local uploads are mirrored to encrypted archive.</span>
        </div>

        <div className="locker-distribution">
          <div className="label-tag">Credibility distribution</div>
          <CredibilityBuckets evidences={evidences} />
        </div>
      </section>

      <section className="locker-results exact-results">
        <div className="locker-stats exact-locker-stats">
          <p><strong>{evidences.length}</strong>records</p>
          <p><strong>{archivedCount}</strong>archived</p>
          <p><strong>{highCount}</strong>high credibility</p>
          <p><strong>{flaggedCount}</strong>manipulation flagged</p>
        </div>

        <div className="locker-tabs-row">
          <div className="locker-tabs">
            {[
              { id: "all" as const, label: "All" },
              { id: "approved" as const, label: "Approved" },
              { id: "review" as const, label: "In review" }
            ].map((item) => (
              <button className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)} key={item.id}>
                {item.label}
              </button>
            ))}
          </div>
          <button className="sort-button">Sort: credibility</button>
        </div>

        <div className="evidence-table exact-evidence-table">
          {filteredEvidence.map((evidence) => {
            const manip = manipulationScore(evidence);
            return (
              <article key={evidence.id} className="evidence-row exact-evidence-row" onClick={() => onSelect(evidence.id)}>
                <div className="locker-row-main">
                  <div className="locker-row-badges">
                    <span className={`archive-chip ${evidence.archive_status}`}>{evidence.archive_status.replace("_", " ")}</span>
                    <span className={`archive-chip ${evidence.review_status ?? "approved"}`}>{evidence.review_status === "pending_review" ? "review" : evidence.review_status ?? "approved"}</span>
                    {manip > 30 ? <span className="archive-chip failed">flag / {manip}</span> : null}
                  </div>
                  <h3>{evidence.title}</h3>
                  <div className="locker-row-source">{evidence.platform} / {evidence.type}</div>
                  <p>{evidence.content_text}</p>
                  <div className="locker-score-grid">
                    <ScoreLine label="cred" value={evidence.credibility_score} />
                    <ScoreLine label="manip" value={manip} inverse />
                  </div>
                  <div className="entity-list compact">
                    {evidence.tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                </div>
                <a href={evidence.source_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                  <ExternalLink size={14} />
                </a>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
