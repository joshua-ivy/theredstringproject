"use client";

import { Archive, ChevronRight, FileText, Filter, FolderOpen, Plus } from "lucide-react";
import type { Connection, Conspiracy, Evidence } from "@/types/domain";

interface CaseFilesProps {
  conspiracies: Conspiracy[];
  evidences: Evidence[];
  connections: Connection[];
  onOpenCase: (caseId: string) => void;
}

type Composition = Record<"gov" | "archival" | "media" | "social", number>;

const displayNow = new Date("2026-04-26T20:18:00.000Z").getTime();

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const hours = Math.max(1, Math.round((displayNow - date.getTime()) / 3600000));
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";
  return `${Math.round(hours / 24)}d ago`;
}

function sourceBucket(evidence: Evidence): keyof Composition {
  const source = `${evidence.platform} ${evidence.type} ${evidence.source_url}`.toLowerCase();
  if (source.includes("senate") || source.includes("gov") || source.includes("government")) return "gov";
  if (source.includes("archive") || source.includes("pdf")) return "archival";
  if (source.includes("youtube") || source.includes("news") || evidence.type === "video") return "media";
  if (source.includes("x") || source.includes("reddit") || source.includes("social")) return "social";
  return "media";
}

function caseCode(id: string) {
  if (id.includes("mkultra")) return "CASE-MK";
  if (id.includes("uap")) return "CASE-UAP";
  if (id.includes("cointel")) return "CASE-COINTEL";
  if (id.includes("election")) return "CASE-ELEC";
  return id.toUpperCase();
}

function compositionFor(caseEvidence: Evidence[]): Composition {
  const comp: Composition = { gov: 0, archival: 0, media: 0, social: 0 };
  caseEvidence.forEach((evidence) => {
    comp[sourceBucket(evidence)] += 1;
  });
  return comp;
}

function CompositionBar({ comp }: { comp: Composition }) {
  const segments = [
    { key: "gov", value: comp.gov, color: "var(--green)" },
    { key: "archival", value: comp.archival, color: "var(--cyan)" },
    { key: "media", value: comp.media, color: "var(--amber)" },
    { key: "social", value: comp.social, color: "var(--red)" }
  ];
  const total = Math.max(1, segments.reduce((sum, segment) => sum + segment.value, 0));

  return (
    <div className="composition">
      <div className="composition-bar">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <i key={segment.key} style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }} />
          ) : null
        )}
      </div>
      <div className="composition-legend">
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <span key={segment.key}>
              <b style={{ background: segment.color }} />
              {segment.key} {segment.value}
            </span>
          ))}
      </div>
    </div>
  );
}

function HeatGauge({ value }: { value: number }) {
  return (
    <div className="heat-gauge">
      <i><b style={{ width: `${value}%` }} /></i>
      <span>{value}&deg;</span>
    </div>
  );
}

export function CaseFiles({ conspiracies, evidences, connections, onOpenCase }: CaseFilesProps) {
  const totalEvidence = conspiracies.reduce((sum, item) => sum + item.evidence_count, 0);
  const totalStrings = Math.max(conspiracies.reduce((sum, item) => sum + item.string_count, 0), connections.length);
  const averageCredibility = conspiracies.length
    ? Math.round(conspiracies.reduce((sum, item) => sum + item.credibility_avg, 0) / conspiracies.length)
    : 0;

  return (
    <div className="case-screen exact-screen">
      <div className="screen-toolbar">
        <div>
          <p className="red-label">Active investigations</p>
          <h2>Case Files</h2>
          <span>Threads, dossiers, and clusters of related evidence currently being reviewed.</span>
        </div>
        <div className="screen-actions">
          <button><Filter size={12} /> Sort: heat</button>
          <button><Archive size={12} /> Archived</button>
          <button className="danger-action"><Plus size={12} /> New case</button>
        </div>
      </div>

      <div className="case-kpis exact-kpis">
        <p><strong>{conspiracies.length}</strong>open cases</p>
        <p><strong>{totalEvidence}</strong>linked evidence</p>
        <p><strong>{totalStrings}</strong>active strings</p>
        <p><strong>{averageCredibility}/100</strong>avg credibility</p>
      </div>

      <div className="case-grid exact-case-grid">
        {conspiracies.map((item) => {
          const caseEvidence = evidences.filter((evidence) => evidence.linked_conspiracy_ids.includes(item.id));
          const caseAverageCredibility = item.credibility_avg;
          const heat = Math.max(30, Math.min(82, Math.round((caseAverageCredibility + item.string_count) / 1.34)));
          const lastWeaved = shortDate(item.last_weaved);

          return (
            <article className="case-file exact-case-card" key={item.id}>
              <div className="case-topline">
                <span><FolderOpen size={13} /> Case file / {caseCode(item.id)}</span>
                <HeatGauge value={heat} />
              </div>
              <h2>{item.title}</h2>
              <p>{item.summary}</p>

              <div className="case-signal-grid exact-signal-grid">
                <span><strong>{item.evidence_count}</strong>evidence</span>
                <span><strong>{item.string_count}</strong>strings</span>
                <span><strong>{caseAverageCredibility}</strong>avg cred</span>
                <span><strong>{lastWeaved}</strong>last weave</span>
              </div>

              <div className="composition-label">Source composition</div>
              <CompositionBar comp={compositionFor(caseEvidence)} />

              <div className="entity-list compact">
                {item.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>

              <div className="case-card-actions">
                <button onClick={() => onOpenCase(item.id)}>
                  Open on board <ChevronRight size={12} />
                </button>
                <button title="Case document"><FileText size={12} /></button>
              </div>
            </article>
          );
        })}

        <button className="new-case-card" type="button">
          <Plus size={28} />
          Open a new case
        </button>
      </div>
    </div>
  );
}
