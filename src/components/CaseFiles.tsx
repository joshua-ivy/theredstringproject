"use client";

import { FolderOpen, GitBranch } from "lucide-react";
import type { Connection, Conspiracy, Evidence } from "@/types/domain";

interface CaseFilesProps {
  conspiracies: Conspiracy[];
  evidences: Evidence[];
  connections: Connection[];
  onOpenCase: (caseId: string) => void;
}

export function CaseFiles({ conspiracies, evidences, connections, onOpenCase }: CaseFilesProps) {
  return (
    <div className="case-grid">
      {conspiracies.map((item) => {
        const caseEvidence = evidences.filter((evidence) => evidence.linked_conspiracy_ids.includes(item.id));
        const caseConnections = connections.filter((connection) => connection.to === item.id || connection.from === item.id);
        return (
          <article className="case-file" key={item.id}>
            <div className="case-topline">
              <FolderOpen size={18} />
              <span>{item.credibility_avg}/100</span>
            </div>
            <h2>{item.title}</h2>
            <p>{item.summary}</p>
            <div className="mini-web" aria-hidden="true">
              {Array.from({ length: 7 }).map((_, index) => (
                <span key={index} style={{ transform: `rotate(${index * 23}deg) translateX(${20 + index * 4}px)` }} />
              ))}
            </div>
            <div className="case-meta">
              <span>{caseEvidence.length || item.evidence_count} evidence</span>
              <span>
                <GitBranch size={13} />
                {caseConnections.length || item.string_count} strings
              </span>
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
  );
}
