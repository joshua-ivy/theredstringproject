"use client";

import { Archive, ExternalLink, X } from "lucide-react";
import type { Evidence } from "@/types/domain";

interface EvidenceDetailProps {
  evidence: Evidence | null;
  onClose?: () => void;
}

export function EvidenceDetail({ evidence, onClose }: EvidenceDetailProps) {
  const primaryAsset = evidence?.archived_assets.find((asset) => asset.url) ?? evidence?.archived_assets[0] ?? null;
  const hashPreview = evidence?.content_hash ? `${evidence.content_hash.slice(0, 12)}...` : "none";
  const sourceLabel = evidence
    ? `${evidence.platform} source - ${evidence.archive_status.replace(/_/g, " ")}`
    : "No source selected";
  const signalLabels = evidence ? Array.from(new Set([...evidence.entities, ...evidence.tags])).slice(0, 10) : [];

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
              <span>Credibility</span>
              <strong>{evidence.credibility_score} / 100</strong>
            </div>
            <div className="credibility-meter">
              <span style={{ width: `${evidence.credibility_score}%` }} />
            </div>
            <p>{evidence.credibility_explanation}</p>
          </section>

          <section className="detail-section">
            <h3>Entities and Tags</h3>
            <div className="entity-list">
              {signalLabels.map((entity) => (
                <span key={entity}>{entity}</span>
              ))}
            </div>
          </section>

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
            <span>Retrieved: {new Date(evidence.retrieved_at).toLocaleString()}</span>
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
