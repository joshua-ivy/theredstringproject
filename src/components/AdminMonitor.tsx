"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { CheckCircle2, ClipboardCheck, Loader2, SearchCheck, XCircle } from "lucide-react";
import { db, functions } from "@/lib/firebase";
import type { AnalysisJob, Evidence, ReviewStatus, SearchRun } from "@/types/domain";

interface AdminMonitorProps {
  evidences: Evidence[];
  isAdminHint: boolean;
}

function iso(value: unknown) {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date(value as string | number | Date).toISOString();
}

export function AdminMonitor({ evidences, isAdminHint }: AdminMonitorProps) {
  const [analysisJobs, setAnalysisJobs] = useState<AnalysisJob[]>([]);
  const [searchRuns, setSearchRuns] = useState<SearchRun[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const jobQuery = query(collection(db, "analysis_jobs"), orderBy("updated_at", "desc"), limit(30));
    const runQuery = query(collection(db, "search_runs"), orderBy("created_at", "desc"), limit(20));

    const unsubscribeJobs = onSnapshot(
      jobQuery,
      (snapshot) => {
        setAnalysisJobs(
          snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              evidence_id: String(data.evidence_id ?? doc.id),
              status: String(data.status ?? "unknown"),
              error: data.error ? String(data.error) : undefined,
              created_at: iso(data.created_at),
              updated_at: iso(data.updated_at)
            };
          })
        );
      },
      () => setMessage("Review data could not be loaded for this account.")
    );

    const unsubscribeRuns = onSnapshot(
      runQuery,
      (snapshot) => {
        setSearchRuns(
          snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              query: String(data.query ?? ""),
              provider: String(data.provider ?? "google_pse"),
              status: String(data.status ?? "unknown"),
              result_count: Number(data.result_count ?? 0),
              error: data.error ? String(data.error) : undefined,
              created_at: iso(data.created_at),
              updated_at: iso(data.updated_at)
            };
          })
        );
      },
      () => setMessage("Search run data could not be loaded for this account.")
    );

    return () => {
      unsubscribeJobs();
      unsubscribeRuns();
    };
  }, []);

  const pendingEvidence = useMemo(
    () => evidences.filter((evidence) => (evidence.review_status ?? "approved") === "pending_review"),
    [evidences]
  );
  const failedEvidence = useMemo(
    () =>
      evidences.filter(
        (evidence) => evidence.archive_status === "failed" || evidence.archive_status === "blocked" || evidence.analysis_status === "failed"
      ),
    [evidences]
  );

  async function setReviewStatus(evidenceId: string, reviewStatus: ReviewStatus) {
    setBusyId(evidenceId);
    setMessage(null);
    try {
      const callable = httpsCallable<
        { evidenceId: string; reviewStatus: ReviewStatus; note?: string },
        { evidenceId: string; reviewStatus: ReviewStatus }
      >(functions, "setEvidenceReviewStatus");
      await callable({
        evidenceId,
        reviewStatus,
        note: reviewStatus === "approved" ? "Approved for board visibility." : "Rejected from board visibility."
      });
      setMessage(`Evidence ${reviewStatus.replace("_", " ")}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review update failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="monitor-view">
      <section className="monitor-column">
        <div className="section-title">
          <ClipboardCheck size={18} />
          <div>
            <p>Review Queue</p>
            <h2>Evidence waiting for the board</h2>
          </div>
        </div>
        {!isAdminHint ? <p className="system-message">Only the approved admin can change review status.</p> : null}
        {message ? <p className="system-message">{message}</p> : null}
        {pendingEvidence.length ? (
          <div className="review-list">
            {pendingEvidence.map((evidence) => (
              <article key={evidence.id} className="review-card">
                <span className={`archive-chip ${evidence.archive_status}`}>{evidence.archive_status}</span>
                <h3>{evidence.title}</h3>
                <p>{evidence.content_text}</p>
                <div className="review-actions">
                  <button className="primary-button" disabled={!isAdminHint || busyId === evidence.id} onClick={() => void setReviewStatus(evidence.id, "approved")}>
                    {busyId === evidence.id ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                    Approve
                  </button>
                  <button className="secondary-button" disabled={!isAdminHint || busyId === evidence.id} onClick={() => void setReviewStatus(evidence.id, "rejected")}>
                    <XCircle size={16} />
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">No evidence is waiting for review. New search discoveries will appear here before they show on the board.</div>
        )}
      </section>

      <section className="monitor-column">
        <div className="section-title">
          <SearchCheck size={18} />
          <div>
            <p>Collection Health</p>
            <h2>Recent jobs and search runs</h2>
          </div>
        </div>
        <div className="monitor-stats">
          <p><strong>{analysisJobs.filter((job) => job.status === "failed").length}</strong> failed analysis jobs</p>
          <p><strong>{failedEvidence.length}</strong> evidence records need attention</p>
          <p><strong>{searchRuns.filter((run) => run.status === "complete").length}</strong> completed search runs</p>
        </div>
        <div className="job-list">
          {analysisJobs.length ? analysisJobs.map((job) => (
            <article key={job.id} className="job-row">
              <strong>{job.evidence_id}</strong>
              <span>{job.status}</span>
              {job.error ? <p>{job.error}</p> : null}
            </article>
          )) : <div className="empty-state">No analysis jobs have run yet. Submit evidence or wait for the next scheduled search.</div>}
        </div>
        <div className="job-list">
          {searchRuns.length ? searchRuns.map((run) => (
            <article key={run.id} className="job-row">
              <strong>{run.query}</strong>
              <span>{run.status} · {run.result_count ?? 0} results</span>
              {run.error ? <p>{run.error}</p> : null}
            </article>
          )) : <div className="empty-state">No search runs have been recorded yet.</div>}
        </div>
      </section>
    </div>
  );
}
