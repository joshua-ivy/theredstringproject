"use client";

import { FormEvent, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Archive, ExternalLink, Loader2, Save, X } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import type { Evidence } from "@/types/domain";

interface EvidenceDetailProps {
  evidence: Evidence | null;
  isAdminHint?: boolean;
  onClose?: () => void;
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

export function EvidenceDetail({ evidence, isAdminHint = false, onClose }: EvidenceDetailProps) {
  const [reviewDraft, setReviewDraft] = useState({
    evidenceId: "",
    score: 0,
    explanation: "",
    message: null as string | null
  });
  const [reviewBusy, setReviewBusy] = useState(false);
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

  return (
    <>
      <div className="detail-heading">
        <p>Selected Evidence</p>
        <div className="detail-actions">
          <span>{evidence?.review_status?.replace(/_/g, " ") ?? "none"}</span>
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

          {isAdminHint ? (
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
