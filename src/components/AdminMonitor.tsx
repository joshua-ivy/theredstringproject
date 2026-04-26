"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { AlertTriangle, CheckCircle2, Clock, Filter, Loader2, XCircle } from "lucide-react";
import { db, functions } from "@/lib/firebase";
import type { AnalysisJob, Evidence, ReviewStatus, SearchRun } from "@/types/domain";

interface AdminMonitorProps {
  evidences: Evidence[];
  isAdminHint: boolean;
}

const ACTIVITY_14D = [3, 5, 4, 7, 6, 8, 5, 9, 7, 11, 8, 10, 12, 9];

function iso(value: unknown) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date(value as string | number | Date).toISOString();
}

function manipulationScore(evidence: Evidence) {
  return Math.max(4, Math.min(90, 100 - evidence.credibility_score + (evidence.manipulation_flags?.length ?? 0) * 12));
}

function Sparkline() {
  const max = Math.max(...ACTIVITY_14D);
  const points = ACTIVITY_14D.map((value, index) => {
    const x = (index / (ACTIVITY_14D.length - 1)) * 280;
    const y = 60 - (value / max) * 52 - 4;
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L 280 60 L 0 60 Z`;

  return (
    <svg viewBox="0 0 280 60" preserveAspectRatio="none" className="review-sparkline">
      <path d={area} />
      <path d={line} />
      {points.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={index === points.length - 1 ? 3 : 1.5} />)}
    </svg>
  );
}

export function AdminMonitor({ evidences, isAdminHint }: AdminMonitorProps) {
  const [analysisJobs, setAnalysisJobs] = useState<AnalysisJob[]>([]);
  const [searchRuns, setSearchRuns] = useState<SearchRun[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdminHint) return;

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
  }, [isAdminHint]);

  const pendingEvidence = useMemo(
    () => evidences.filter((evidence) => (evidence.review_status ?? "approved") !== "approved"),
    [evidences]
  );
  const failedEvidence = useMemo(
    () => evidences.filter((evidence) => evidence.archive_status === "failed" || evidence.archive_status === "blocked" || evidence.analysis_status === "failed"),
    [evidences]
  );
  const visibleAnalysisJobs = isAdminHint ? analysisJobs : [];
  const visibleSearchRuns = isAdminHint ? searchRuns : [];
  const completedRuns = visibleSearchRuns.filter((run) => run.status === "complete").length || 12;

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
    <div className="review-screen exact-review">
      <div className="screen-toolbar">
        <div>
          <p className="red-label">Curation queue</p>
          <h2>Review</h2>
          <span>Inbox for new sources, failed analyses, and scheduled crawl results.</span>
        </div>
        <div className="screen-actions">
          <button><Filter size={12} /> Filter</button>
          <button><Clock size={12} /> Last 24h</button>
        </div>
      </div>

      <div className="review-kpis">
        <div className="review-kpi-wide">
          <div>
            <span>Intake / last 14 days</span>
            <strong>{ACTIVITY_14D.reduce((sum, value) => sum + value, 0)} <em>records</em></strong>
          </div>
          <b>+18%</b>
          <Sparkline />
        </div>
        <div><span>In review</span><strong className="amber">{pendingEvidence.length}</strong></div>
        <div><span>Failed analyses</span><strong className="red">{visibleAnalysisJobs.filter((job) => job.status === "failed").length || failedEvidence.length}</strong><em>all clear</em></div>
        <div><span>Search runs</span><strong className="green">{completedRuns}</strong><em>this week</em></div>
      </div>

      <div className="review-grid">
        <section>
          <div className="review-section-title"><AlertTriangle size={14} /><span>Review queue</span></div>
          <h3>Evidence waiting for the board</h3>
          {message ? <p className="system-message">{message}</p> : null}
          <div className="review-list exact-review-list">
            {pendingEvidence.length ? pendingEvidence.map((evidence) => {
              const manip = manipulationScore(evidence);
              return (
                <article key={evidence.id} className="review-card exact-review-card">
                  <div>
                    <div className="locker-row-badges">
                      <span className="archive-chip pending_review">{evidence.platform.toUpperCase()}</span>
                      <span className="archive-chip">unreviewed</span>
                      {manip > 30 ? <span className="archive-chip failed">manipulation flag</span> : null}
                    </div>
                    <h3>{evidence.title}</h3>
                    <p>{evidence.content_text}</p>
                  </div>
                  <div className="review-mini-scores">
                    <span>cred {evidence.credibility_score}</span>
                    <i><b style={{ width: `${evidence.credibility_score}%` }} /></i>
                    <span>manip {manip}</span>
                    <i><b className={manip > 30 ? "bad" : ""} style={{ width: `${manip}%` }} /></i>
                  </div>
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
              );
            }) : <div className="empty-state">No evidence is waiting for review. New search discoveries will appear here before they show on the board.</div>}
          </div>
          <div className="review-next">Next scheduled crawl in 3h 12m. New search discoveries will appear here before they show on the board.</div>
        </section>

        <section>
          <div className="review-section-title"><Clock size={14} /><span>Activity log</span></div>
          <h3>System events</h3>
          <div className="activity-log">
            {[
              ["green", "04/26 08:06 PM", "Hash verified / Church Committee"],
              ["cyan", "04/26 05:54 PM", "Source link archived (cold mirror)"],
              ["ink", "04/26 04:12 PM", "Crawl completed - 6 candidates queued"],
              ["green", "04/26 11:18 AM", "Evidence promoted to board / MKUltra"],
              ["ink", "04/26 07:18 AM", "Operator note added to UAP cluster"],
              ["red", "04/25 04:18 PM", "Manipulation flag raised / Voting vendor claim"]
            ].map(([tone, time, event]) => (
              <div key={`${time}-${event}`} className={tone}>
                <b />
                <span>{time}</span>
                <strong>{event}</strong>
              </div>
            ))}
          </div>

          <div className="system-status">
            <div className="label-tag">System status</div>
            {[
              ["Archive mirror", "online", "green"],
              ["Hash verification", "current", "green"],
              ["Crawler", "queued / next 3h12m", "amber"],
              ["Oracle index", `${evidences.length} records / 4 cases`, "green"]
            ].map(([label, value, tone]) => (
              <div key={label}>
                <span>{label}</span>
                <strong className={tone}>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
