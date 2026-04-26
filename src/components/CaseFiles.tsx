"use client";

import { CalendarDays, FileStack, FolderOpen, GitBranch, ShieldCheck } from "lucide-react";
import type { Connection, Conspiracy, Evidence } from "@/types/domain";

interface CaseFilesProps {
  conspiracies: Conspiracy[];
  evidences: Evidence[];
  connections: Connection[];
  onOpenCase: (caseId: string) => void;
}

export function CaseFiles({ conspiracies, evidences, connections, onOpenCase }: CaseFilesProps) {
  const totalEvidence = conspiracies.reduce((sum, item) => sum + item.evidence_count, 0);
  const totalStrings = conspiracies.reduce((sum, item) => sum + item.string_count, 0);
  const averageCredibility = conspiracies.length
    ? Math.round(conspiracies.reduce((sum, item) => sum + item.credibility_avg, 0) / conspiracies.length)
    : 0;
  const recurringEntities = Array.from(new Set(evidences.flatMap((evidence) => evidence.entities))).slice(0, 16);

  return (
    <div className="case-screen">
      <div className="screen-heading">
        <div>
          <p className="red-label">Active investigations</p>
          <h2>Case Files</h2>
          <span>Threads, dossiers, and clusters of related evidence currently being reviewed.</span>
        </div>
      </div>

      <div className="case-kpis">
        <p><strong>{conspiracies.length}</strong>open cases</p>
        <p><strong>{totalEvidence}</strong>linked evidence</p>
        <p><strong>{totalStrings}</strong>active strings</p>
        <p><strong>{averageCredibility}/100</strong>avg credibility</p>
      </div>

      <div className="case-grid">
        {conspiracies.map((item) => {
          const caseEvidence = evidences.filter((evidence) => evidence.linked_conspiracy_ids.includes(item.id));
          const caseConnections = connections.filter((connection) => connection.to === item.id || connection.from === item.id);
          const sourceCounts = caseEvidence.reduce<Record<string, number>>((acc, evidence) => {
            acc[evidence.type] = (acc[evidence.type] ?? 0) + 1;
            return acc;
          }, {});
          const strongestSource = caseEvidence.reduce<Evidence | null>(
            (best, evidence) => (!best || evidence.credibility_score > best.credibility_score ? evidence : best),
            null
          );
          const caseAverageCredibility = caseEvidence.length
            ? Math.round(caseEvidence.reduce((sum, evidence) => sum + evidence.credibility_score, 0) / caseEvidence.length)
            : item.credibility_avg;
          const reviewedDate = new Date(item.last_weaved).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric"
          });

          return (
            <article className="case-file" key={item.id}>
              <div className="case-topline">
                <span><FolderOpen size={18} /> Case file / {item.id}</span>
                <span>{caseAverageCredibility}/100 avg</span>
              </div>
              <h2>{item.title}</h2>
              <p>{item.summary}</p>

              <div className="case-signal-grid">
                <span>
                  <FileStack size={14} />
                  {caseEvidence.length || item.evidence_count} evidence
                </span>
                <span>
                  <GitBranch size={14} />
                  {caseConnections.length || item.string_count} strings
                </span>
                <span>
                  <CalendarDays size={14} />
                  {reviewedDate}
                </span>
                <span>
                  <ShieldCheck size={14} />
                  {strongestSource ? `${strongestSource.credibility_score}/100 source` : "No source yet"}
                </span>
              </div>

              <div className="source-mix" aria-label="Source type distribution">
                {Object.entries(sourceCounts).length > 0 ? (
                  Object.entries(sourceCounts).map(([type, count]) => (
                    <span key={type}>
                      <i style={{ width: `${Math.min(100, Math.max(18, count * 28))}%` }} />
                      {type}: {count}
                    </span>
                  ))
                ) : (
                  <span>
                    <i style={{ width: "28%" }} />
                    waiting for sources
                  </span>
                )}
              </div>

              <div className="entity-list compact">
                {item.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>

              <button className="secondary-button" onClick={() => onOpenCase(item.id)}>
                Open on board
              </button>
            </article>
          );
        })}
      </div>

      <div className="entity-index">
        <p className="red-label">Entity index</p>
        <div className="entity-list">
          {recurringEntities.length ? (
            recurringEntities.map((entity) => <span key={entity}>{entity}</span>)
          ) : (
            <span>No recurring entities yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
