"use client";

import { FormEvent, useMemo, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Archive, ChevronRight, FileText, Filter, FolderOpen, Loader2, Plus, Trash2, X } from "lucide-react";
import { db, functions } from "@/lib/firebase";
import type { Connection, Conspiracy, Evidence, Project } from "@/types/domain";

interface CaseFilesProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  conspiracies: Conspiracy[];
  evidences: Evidence[];
  connections: Connection[];
  isAdminHint: boolean;
  onOpenCase: (caseId: string) => void;
}

type Composition = Record<"gov" | "archival" | "media" | "social", number>;
type CaseSortMode = "heat" | "credibility" | "evidence";

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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function CaseFiles({
  projects,
  selectedProjectId,
  onSelectProject,
  conspiracies,
  evidences,
  connections,
  isAdminHint,
  onOpenCase
}: CaseFilesProps) {
  const [sortMode, setSortMode] = useState<CaseSortMode>("heat");
  const [showArchived, setShowArchived] = useState(false);
  const [documentCase, setDocumentCase] = useState<Conspiracy | null>(null);
  const [deleteCase, setDeleteCase] = useState<Conspiracy | null>(null);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [caseTitle, setCaseTitle] = useState("");
  const [caseSummary, setCaseSummary] = useState("");
  const [caseTags, setCaseTags] = useState("");
  const [caseBusy, setCaseBusy] = useState(false);
  const [caseMessage, setCaseMessage] = useState<string | null>(null);
  const totalEvidence = conspiracies.reduce((sum, item) => sum + item.evidence_count, 0);
  const totalStrings = Math.max(conspiracies.reduce((sum, item) => sum + item.string_count, 0), connections.length);
  const averageCredibility = conspiracies.length
    ? Math.round(conspiracies.reduce((sum, item) => sum + item.credibility_avg, 0) / conspiracies.length)
    : 0;

  const casesWithSignals = useMemo(() => {
    return conspiracies.map((item) => {
      const caseEvidence = evidences.filter((evidence) => evidence.linked_conspiracy_ids.includes(item.id));
      const heat = Math.max(30, Math.min(82, Math.round((item.credibility_avg + item.string_count) / 1.34)));
      return { item, caseEvidence, heat };
    });
  }, [conspiracies, evidences]);

  const visibleCases = useMemo(() => {
    if (showArchived) return [];
    return [...casesWithSignals].sort((a, b) => {
      if (sortMode === "credibility") return b.item.credibility_avg - a.item.credibility_avg;
      if (sortMode === "evidence") return b.item.evidence_count - a.item.evidence_count;
      return b.heat - a.heat;
    });
  }, [casesWithSignals, showArchived, sortMode]);

  const documentEvidence = documentCase
    ? evidences.filter((evidence) => evidence.linked_conspiracy_ids.includes(documentCase.id))
    : [];

  async function submitNewCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdminHint) {
      setCaseMessage("Case creation is admin-only.");
      return;
    }
    const title = caseTitle.trim();
    if (!title) return;

    setCaseBusy(true);
    setCaseMessage(null);
    try {
      const id = `case-${slugify(title) || crypto.randomUUID()}`;
      await setDoc(
        doc(db, "conspiracies", id),
        {
          project_id: selectedProjectId,
          title,
          summary: caseSummary.trim() || "New case opened for evidence review.",
          credibility_avg: 0,
          evidence_count: 0,
          string_count: 0,
          tags: caseTags.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 12),
          thumbnail: null,
          last_weaved: serverTimestamp(),
          embedding: []
        },
        { merge: true }
      );
      if (selectedProjectId) {
        await setDoc(
          doc(db, "projects", selectedProjectId),
          {
            updated_at: serverTimestamp(),
            last_weaved: serverTimestamp()
          },
          { merge: true }
        );
      }
      setCaseMessage(`Opened ${title}.`);
      setCaseTitle("");
      setCaseSummary("");
      setCaseTags("");
      setNewCaseOpen(false);
    } catch (error) {
      setCaseMessage(error instanceof Error ? error.message : "New case could not be saved.");
    } finally {
      setCaseBusy(false);
    }
  }

  async function confirmDeleteCase() {
    if (!deleteCase) return;
    if (!isAdminHint) {
      setCaseMessage("Case deletion is admin-only.");
      return;
    }

    setCaseBusy(true);
    setCaseMessage(null);
    try {
      const callable = httpsCallable<
        { caseId: string },
        { caseId: string; evidenceDeleted: number; stringsDeleted: number; assetsDeleted: number }
      >(functions, "deleteCaseWithEvidence");
      const result = await callable({ caseId: deleteCase.id });
      setCaseMessage(
        `Deleted ${deleteCase.title}: ${result.data.evidenceDeleted} evidence record(s), ${result.data.stringsDeleted} string(s), ${result.data.assetsDeleted} archived asset(s).`
      );
      setDeleteCase(null);
      setDocumentCase((current) => current?.id === deleteCase.id ? null : current);
    } catch (error) {
      setCaseMessage(error instanceof Error ? error.message : "Case could not be deleted.");
    } finally {
      setCaseBusy(false);
    }
  }

  return (
    <div className="case-screen exact-screen">
      <div className="screen-toolbar">
        <div>
          <p className="red-label">Active investigations</p>
          <h2>Case Files</h2>
          <span>Threads, dossiers, and clusters of related evidence currently being reviewed.</span>
        </div>
        <div className="screen-actions">
          <button
            onClick={() => setSortMode((current) => current === "heat" ? "credibility" : current === "credibility" ? "evidence" : "heat")}
            title="Cycle case sorting"
          >
            <Filter size={12} /> Sort: {sortMode}
          </button>
          <button className={showArchived ? "active-action" : ""} onClick={() => setShowArchived((current) => !current)}>
            <Archive size={12} /> {showArchived ? "Active" : "Archived"}
          </button>
          <button className="danger-action" onClick={() => setNewCaseOpen(true)}>
            <Plus size={12} /> New case
          </button>
        </div>
      </div>
      {projects.length ? (
        <div className="project-switcher" aria-label="Project filter">
          {projects.map((project) => (
            <button
              key={project.id}
              className={project.id === selectedProjectId ? "active" : ""}
              onClick={() => onSelectProject(project.id)}
            >
              <strong>{project.title}</strong>
              <span>{project.case_count} cases / {project.evidence_count} records</span>
            </button>
          ))}
        </div>
      ) : null}
      {caseMessage ? <p className="system-message">{caseMessage}</p> : null}

      <div className="case-kpis exact-kpis">
        <p><strong>{conspiracies.length}</strong>open cases</p>
        <p><strong>{totalEvidence}</strong>linked evidence</p>
        <p><strong>{totalStrings}</strong>active strings</p>
        <p><strong>{averageCredibility}/100</strong>avg credibility</p>
      </div>

      <div className="case-grid exact-case-grid">
        {visibleCases.length ? visibleCases.map(({ item, caseEvidence, heat }) => {
          const caseAverageCredibility = item.credibility_avg;
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

              <div className={`case-card-actions ${isAdminHint ? "with-delete" : ""}`}>
                <button onClick={() => onOpenCase(item.id)}>
                  Open on board <ChevronRight size={12} />
                </button>
                <button title="Case document" onClick={() => setDocumentCase(item)}><FileText size={12} /></button>
                {isAdminHint ? (
                  <button
                    className="case-delete-button"
                    title="Delete case and linked evidence"
                    onClick={() => setDeleteCase(item)}
                  >
                    <Trash2 size={12} />
                  </button>
                ) : null}
              </div>
            </article>
          );
        }) : (
          <div className="case-empty-state">
            <Archive size={24} />
            <strong>No archived cases yet</strong>
            <span>Archiving will move completed investigations here once that review state exists.</span>
          </div>
        )}

        <button className="new-case-card" type="button" onClick={() => setNewCaseOpen(true)}>
          <Plus size={28} />
          Open a new case
        </button>
      </div>

      {newCaseOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setNewCaseOpen(false)}>
          <section className="case-modal" role="dialog" aria-modal="true" aria-labelledby="new-case-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setNewCaseOpen(false)} title="Close new case">
              <X size={16} />
            </button>
            <p className="red-label">New investigation</p>
            <h2 id="new-case-title">Open a new case</h2>
            {isAdminHint ? (
              <form className="intake-form exact-form" onSubmit={submitNewCase}>
                <label>
                  Case title
                  <input value={caseTitle} onChange={(event) => setCaseTitle(event.target.value)} placeholder="Case name" />
                </label>
                <label>
                  Summary
                  <textarea value={caseSummary} onChange={(event) => setCaseSummary(event.target.value)} placeholder="What this case is collecting and why it matters" />
                </label>
                <label>
                  Tags
                  <input value={caseTags} onChange={(event) => setCaseTags(event.target.value)} placeholder="cia, archive, documents" />
                </label>
                <button className="primary-button" disabled={caseBusy || !caseTitle.trim()}>
                  {caseBusy ? <Loader2 className="spin" size={15} /> : <Plus size={14} />}
                  Create case
                </button>
              </form>
            ) : (
              <div className="admin-only-panel">
                <p className="red-label">Admin-only</p>
                <span>Public visitors can browse cases, but opening a new investigation requires the approved admin account.</span>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {documentCase ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDocumentCase(null)}>
          <section className="case-modal case-document-modal" role="dialog" aria-modal="true" aria-labelledby="case-document-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setDocumentCase(null)} title="Close case document">
              <X size={16} />
            </button>
            <p className="red-label">Case document / {caseCode(documentCase.id)}</p>
            <h2 id="case-document-title">{documentCase.title}</h2>
            <p>{documentCase.summary}</p>
            <div className="case-document-grid">
              <span><strong>{documentCase.evidence_count}</strong>evidence</span>
              <span><strong>{documentCase.string_count}</strong>strings</span>
              <span><strong>{documentCase.credibility_avg}</strong>avg credibility</span>
            </div>
            <div className="entity-list compact">
              {documentCase.tags.map((tag) => <span key={tag}>#{tag}</span>)}
            </div>
            <div className="case-document-list">
              <div className="label-tag">Linked evidence</div>
              {documentEvidence.length ? documentEvidence.map((evidence) => (
                <button key={evidence.id} onClick={() => onOpenCase(documentCase.id)}>
                  <strong>{evidence.title}</strong>
                  <span>{evidence.platform} / {evidence.credibility_score}/100 / {evidence.archive_status.replace("_", " ")}</span>
                </button>
              )) : <span>No linked evidence yet.</span>}
            </div>
            <button className="primary-button" onClick={() => onOpenCase(documentCase.id)}>
              Open on board <ChevronRight size={14} />
            </button>
          </section>
        </div>
      ) : null}

      {deleteCase ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDeleteCase(null)}>
          <section className="case-modal case-document-modal" role="dialog" aria-modal="true" aria-labelledby="delete-case-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setDeleteCase(null)} title="Close delete case">
              <X size={16} />
            </button>
            <p className="red-label">Destructive action</p>
            <h2 id="delete-case-title">Delete this case and its evidence?</h2>
            <p>
              This will delete <strong>{deleteCase.title}</strong>, every string connected to it, and every evidence record currently linked to this case.
              Archived source files attached to those evidence records will also be removed when possible.
            </p>
            <div className="case-document-grid">
              <span><strong>{evidences.filter((evidence) => evidence.linked_conspiracy_ids.includes(deleteCase.id)).length}</strong>linked evidence</span>
              <span><strong>{connections.filter((connection) => connection.to === deleteCase.id || connection.from === deleteCase.id).length}</strong>direct strings</span>
              <span><strong>{deleteCase.credibility_avg}</strong>avg credibility</span>
            </div>
            {isAdminHint ? (
              <div className="modal-action-row">
                <button className="secondary-button" onClick={() => setDeleteCase(null)} disabled={caseBusy}>Cancel</button>
                <button className="danger-confirm-button" onClick={() => void confirmDeleteCase()} disabled={caseBusy}>
                  {caseBusy ? <Loader2 className="spin" size={15} /> : <Trash2 size={14} />}
                  Delete case and evidence
                </button>
              </div>
            ) : (
              <div className="admin-only-panel">
                <p className="red-label">Admin-only</p>
                <span>Public visitors can browse case files, but only the approved admin account can delete cases or evidence.</span>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
