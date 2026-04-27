"use client";

import { FormEvent, useEffect, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";
import { Archive, Edit3, ExternalLink, Eye, Loader2, Save, Trash2, Upload, X } from "lucide-react";
import { auth, db, functions, storage } from "@/lib/firebase";
import type { Evidence } from "@/types/domain";

interface EvidenceDetailProps {
  evidence: Evidence | null;
  isAdminHint?: boolean;
  onClose?: () => void;
  onDeleted?: (id: string) => void;
}

function scoreTone(value: number, inverse = false) {
  if (inverse) {
    if (value < 15) return "var(--green)";
    if (value < 35) return "var(--amber)";
    return "var(--red)";
  }
  if (value > 75) return "var(--green)";
  if (value > 50) return "var(--amber)";
  return "var(--red)";
}

function ScoreRow({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const color = scoreTone(value, inverse);
  return (
    <div className="score-row">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <i>
        <b style={{ width: `${value}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
      </i>
    </div>
  );
}

function formatRetrieved(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function EvidenceDetail({ evidence, isAdminHint = false, onClose, onDeleted }: EvidenceDetailProps) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [reviewDraft, setReviewDraft] = useState({
    evidenceId: "",
    score: 0,
    explanation: "",
    message: null as string | null
  });
  const [reviewBusy, setReviewBusy] = useState(false);
  const [supplementUrls, setSupplementUrls] = useState("");
  const [supplementNotes, setSupplementNotes] = useState("");
  const [supplementFiles, setSupplementFiles] = useState<File[]>([]);
  const [supplementBusy, setSupplementBusy] = useState(false);
  const [supplementMessage, setSupplementMessage] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const primaryAsset = evidence?.archived_assets.find((asset) => asset.url) ?? evidence?.archived_assets[0] ?? null;
  const hashPreview = evidence?.content_hash ? `${evidence.content_hash.slice(0, 12)}...` : "none";
  const sourceLabel = evidence
    ? `${evidence.platform} - ${evidence.type} - ${evidence.archive_status.replace(/_/g, " ")}`
    : "No source selected";
  const signalLabels = evidence ? Array.from(new Set([...evidence.entities, ...evidence.tags])).slice(0, 10) : [];
  const provenance = evidence
    ? evidence.credibility_breakdown?.source_trust ??
      evidence.credibility_breakdown?.provenance ??
      Math.min(100, evidence.credibility_score + (evidence.archive_status === "archived" ? 8 : 2))
    : 0;
  const corroboration = evidence
    ? evidence.credibility_breakdown?.cross_verification ??
      evidence.credibility_breakdown?.corroboration ??
      Math.min(100, evidence.credibility_score - 8 + evidence.linked_conspiracy_ids.length * 8)
    : 0;
  const manipulation = evidence
    ? evidence.credibility_breakdown?.manipulation_signals ??
      evidence.credibility_breakdown?.manipulation_risk ??
      Math.max(4, Math.min(90, 100 - evidence.credibility_score + (evidence.manipulation_flags?.length ?? 0) * 12))
    : 0;

  useEffect(() => {
    setMode("view");
    setSupplementUrls("");
    setSupplementNotes("");
    setSupplementFiles([]);
    setSupplementMessage(null);
    setDeleteMessage(null);
  }, [evidence?.id]);

  const activeReviewDraft = evidence && reviewDraft.evidenceId === evidence.id
    ? reviewDraft
    : {
        evidenceId: evidence?.id ?? "",
        score: evidence?.credibility_score ?? 0,
        explanation: evidence?.credibility_explanation ?? "",
        message: null
      };

  async function saveCredibilityReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evidence) return;

    setReviewBusy(true);
    setReviewDraft((current) => ({ ...current, evidenceId: evidence.id, message: null }));
    try {
      await updateDoc(doc(db, "evidences", evidence.id), {
        machine_credibility_score: evidence.machine_credibility_score ?? evidence.credibility_score,
        machine_credibility_explanation: evidence.machine_credibility_explanation ?? evidence.credibility_explanation,
        credibility_score: activeReviewDraft.score,
        credibility_explanation: activeReviewDraft.explanation.trim(),
        credibility_review_note: "Admin-reviewed score. Treats the displayed score as source/artifact credibility, not proof of every interpretation.",
        credibility_reviewed_by: auth.currentUser?.email ?? "admin",
        credibility_reviewed_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      setReviewDraft((current) => ({ ...current, evidenceId: evidence.id, message: "Credibility review saved." }));
    } catch (error) {
      setReviewDraft((current) => ({
        ...current,
        evidenceId: evidence.id,
        message: error instanceof Error ? error.message : "Credibility review could not be saved."
      }));
    } finally {
      setReviewBusy(false);
    }
  }

  async function addSupportingSources(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!evidence) return;

    const urls = supplementUrls
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (urls.length === 0 && supplementFiles.length === 0) {
      setSupplementMessage("Add at least one URL or uploaded image/file.");
      return;
    }

    setSupplementBusy(true);
    setSupplementMessage(null);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("You must be signed in as admin before editing evidence.");
      const uploads = await Promise.all(
        supplementFiles.map(async (file) => {
          const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
          const path = `pending-supplements/${uid}/${crypto.randomUUID()}-${safeName}`;
          await uploadBytes(ref(storage, path), file, {
            contentType: file.type || "application/octet-stream",
            customMetadata: { originalName: file.name, evidenceId: evidence.id }
          });
          return { storagePath: path };
        })
      );

      const callable = httpsCallable<
        { evidenceId: string; urls?: string[]; uploads?: Array<{ storagePath: string }>; notes?: string },
        { evidenceId: string; added: number }
      >(functions, "addEvidenceSupplements");
      const result = await callable({
        evidenceId: evidence.id,
        urls,
        uploads,
        notes: supplementNotes.trim() || undefined
      });
      setSupplementMessage(`Added ${result.data.added} supporting source${result.data.added === 1 ? "" : "s"}.`);
      setSupplementUrls("");
      setSupplementNotes("");
      setSupplementFiles([]);
    } catch (error) {
      setSupplementMessage(error instanceof Error ? error.message : "Could not add supporting sources.");
    } finally {
      setSupplementBusy(false);
    }
  }

  async function deleteEvidence() {
    if (!evidence) return;
    const confirmed = window.confirm(`Delete "${evidence.title}" and its archived assets? This cannot be undone.`);
    if (!confirmed) return;

    setDeleteBusy(true);
    setDeleteMessage(null);
    try {
      const callable = httpsCallable<{ evidenceId: string }, { evidenceId: string; stringsDeleted: number; assetsDeleted: number }>(
        functions,
        "deleteEvidenceRecord"
      );
      const result = await callable({ evidenceId: evidence.id });
      setDeleteMessage(`Deleted evidence, ${result.data.stringsDeleted} strings, and ${result.data.assetsDeleted} archived assets.`);
      onDeleted?.(evidence.id);
      onClose?.();
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "Evidence deletion failed.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <div className="detail-heading">
        <p>Selected Evidence</p>
        <div className="detail-actions">
          <span>{evidence?.review_status?.replace(/_/g, " ") ?? "none"}</span>
          {evidence && isAdminHint ? (
            <div className="detail-mode-toggle" aria-label="Evidence detail mode">
              <button className={mode === "view" ? "active" : ""} onClick={() => setMode("view")} title="View evidence">
                <Eye size={14} />
              </button>
              <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")} title="Edit evidence">
                <Edit3 size={14} />
              </button>
            </div>
          ) : null}
          {onClose ? (
            <button onClick={onClose} title="Close evidence details">
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>
      {evidence ? (
        <>
          <div className="dossier-title">
            <h2>{evidence.title}</h2>
            <span>{sourceLabel}</span>
          </div>

          <section className="credibility-card">
            <div>
              <span>{evidence.credibility_reviewed_at ? "Reviewed Credibility" : "Credibility"}</span>
              <strong>{evidence.credibility_score} / 100</strong>
            </div>
            <div className="credibility-meter">
              <span style={{ width: `${evidence.credibility_score}%` }} />
            </div>
            <p>{evidence.credibility_explanation}</p>
            {evidence.machine_credibility_score !== undefined ? (
              <small>
                Machine draft: {evidence.machine_credibility_score}/100. Admin review can override Gemini when source reality,
                chronology, or provenance changes the reading.
              </small>
            ) : (
              <small>Gemini score is a draft signal. Admin review should account for source reality, chronology, and provenance.</small>
            )}
          </section>

          <section className="score-breakdown">
            <h3>Score Breakdown</h3>
            <ScoreRow label="Provenance" value={Math.round(provenance)} />
            <ScoreRow label="Corroboration" value={Math.round(corroboration)} />
            <ScoreRow label="Manipulation risk" value={Math.round(manipulation)} inverse />
          </section>

          <section className="detail-section">
            <h3>Entities and Tags</h3>
            <div className="entity-list">
              {signalLabels.map((entity) => (
                <span key={entity}>{entity}</span>
              ))}
            </div>
          </section>

          <section className="detail-section">
            <h3>Supporting Sources</h3>
            {evidence.supporting_sources?.length ? (
              <div className="supporting-source-list">
                {evidence.supporting_sources.map((source) => (
                  <a key={source.id} href={source.source_url} target="_blank" rel="noreferrer">
                    <span>{source.archive_status.replace(/_/g, " ")}</span>
                    <strong>{source.title}</strong>
                    <em>{source.type} / {source.archived_assets.length} preserved asset{source.archived_assets.length === 1 ? "" : "s"}</em>
                  </a>
                ))}
              </div>
            ) : (
              <p className="detail-empty">No supporting sources have been attached yet.</p>
            )}
          </section>

          {isAdminHint && mode === "edit" ? (
            <form className="credibility-review-form" onSubmit={saveCredibilityReview}>
              <h3>Admin Credibility Review</h3>
              <label>
                Reviewed score: {activeReviewDraft.score}/100
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={activeReviewDraft.score}
                  onChange={(event) =>
                    setReviewDraft({
                      evidenceId: evidence.id,
                      score: Number(event.target.value),
                      explanation: activeReviewDraft.explanation,
                      message: null
                    })
                  }
                />
              </label>
              <label>
                Review explanation
                <textarea
                  value={activeReviewDraft.explanation}
                  onChange={(event) =>
                    setReviewDraft({
                      evidenceId: evidence.id,
                      score: activeReviewDraft.score,
                      explanation: event.target.value,
                      message: null
                    })
                  }
                  placeholder="Explain source reality, chronology, provenance, and what remains unproven."
                />
              </label>
              <button className="secondary-button" disabled={reviewBusy || !activeReviewDraft.explanation.trim()}>
                {reviewBusy ? <Loader2 className="spin" size={14} /> : <Save size={14} />}
                Save review
              </button>
              {activeReviewDraft.message ? <span>{activeReviewDraft.message}</span> : null}
            </form>
          ) : null}

          {isAdminHint && mode === "edit" ? (
            <form className="credibility-review-form supplement-edit-form" onSubmit={addSupportingSources}>
              <h3>Attach Supporting Sources</h3>
              <label>
                Supporting URLs
                <textarea
                  value={supplementUrls}
                  onChange={(event) => setSupplementUrls(event.target.value)}
                  placeholder="One URL per line. These are archived as supporting sources under this evidence."
                />
              </label>
              <label>
                Supporting images or files
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf,text/plain"
                  onChange={(event) => setSupplementFiles(Array.from(event.target.files ?? []))}
                />
              </label>
              {supplementFiles.length > 0 ? (
                <div className="selected-upload-list">
                  {supplementFiles.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}
                </div>
              ) : null}
              <label>
                Notes
                <textarea
                  value={supplementNotes}
                  onChange={(event) => setSupplementNotes(event.target.value)}
                  placeholder="Why this strengthens, clarifies, or challenges the selected evidence."
                />
              </label>
              <button className="secondary-button" disabled={supplementBusy || (!supplementUrls.trim() && supplementFiles.length === 0)}>
                {supplementBusy ? <Loader2 className="spin" size={14} /> : <Upload size={14} />}
                Add supporting sources
              </button>
              {supplementMessage ? <span>{supplementMessage}</span> : null}
            </form>
          ) : null}

          {isAdminHint && mode === "edit" ? (
            <div className="danger-zone">
              <h3>Danger Zone</h3>
              <p>Delete this evidence, its direct strings, and archived files. Case aggregates are recalculated afterward.</p>
              <button className="danger-confirm-button" onClick={() => void deleteEvidence()} disabled={deleteBusy}>
                {deleteBusy ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                Delete evidence
              </button>
              {deleteMessage ? <span>{deleteMessage}</span> : null}
            </div>
          ) : null}

          <div className="detail-cta-row">
            <a className="source-link" href={evidence.source_url} target="_blank" rel="noreferrer">
              Open source <ExternalLink size={15} />
            </a>
            {primaryAsset?.url ? (
              <a className="source-link secondary-source" href={primaryAsset.url} target="_blank" rel="noreferrer">
                View archived asset <Archive size={15} />
              </a>
            ) : primaryAsset ? (
              <span className="source-link secondary-source" title={primaryAsset.path}>
                Archived asset saved <Archive size={15} />
              </span>
            ) : null}
          </div>

          <div className="archive-list">
            <h3>Preservation</h3>
            <span>Archive: {evidence.archive_status.replace(/_/g, " ")}</span>
            <span>Retrieved: {formatRetrieved(evidence.retrieved_at)}</span>
            <span title={evidence.content_hash}>Hash: {hashPreview}</span>
            {evidence.archived_assets.length > 0 ? (
              evidence.archived_assets.map((asset) => (
                <span key={`${asset.kind}-${asset.path}`} title={asset.path}>
                  {asset.kind}: {asset.contentType ?? "stored"}
                </span>
              ))
            ) : (
              <span>No local asset yet. Status: {evidence.archive_status}</span>
            )}
          </div>
        </>
      ) : (
        <p>Select an evidence card to inspect source links, archive status, and credibility notes.</p>
      )}
    </>
  );
}
