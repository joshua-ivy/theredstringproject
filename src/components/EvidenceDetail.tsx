"use client";

import { ExternalLink, X } from "lucide-react";
import type { Evidence } from "@/types/domain";

interface EvidenceDetailProps {
  evidence: Evidence | null;
  onClose?: () => void;
}

export function EvidenceDetail({ evidence, onClose }: EvidenceDetailProps) {
  return (
    <>
      <div className="detail-heading">
        <p>Selected Evidence</p>
        <div className="detail-actions">
          <span>{evidence?.archive_status ?? "none"}</span>
          {onClose ? (
            <button onClick={onClose} title="Close evidence details">
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>
      {evidence ? (
        <>
          <h2>{evidence.title}</h2>
          <div className="credibility-meter">
            <span style={{ width: `${evidence.credibility_score}%` }} />
          </div>
          <strong className="credibility-label">Credibility: {evidence.credibility_score}/100</strong>
          <p>{evidence.credibility_explanation}</p>
          <div className="entity-list">
            {evidence.entities.map((entity) => (
              <span key={entity}>{entity}</span>
            ))}
          </div>
          <a className="source-link" href={evidence.source_url} target="_blank" rel="noreferrer">
            Open evidence source <ExternalLink size={15} />
          </a>
          <div className="archive-list">
            <h3>Preservation</h3>
            <span>Review: {evidence.review_status ?? "approved"}</span>
            <span>Retrieved: {new Date(evidence.retrieved_at).toLocaleString()}</span>
            <span>Hash: {evidence.content_hash}</span>
            {evidence.archived_assets.length > 0 ? (
              evidence.archived_assets.map((asset) => (
                <span key={`${asset.kind}-${asset.path}`}>
                  {asset.kind}: {asset.path}
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
