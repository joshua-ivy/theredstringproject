"use client";

import { FormEvent, useMemo, useState } from "react";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytesResumable } from "firebase/storage";
import { ExternalLink, FileUp, Loader2, Plus, Send, Trash2, Upload } from "lucide-react";
import { auth, db, functions, storage } from "@/lib/firebase";
import type { Conspiracy, Evidence, Project } from "@/types/domain";

interface EvidenceLockerProps {
  evidences: Evidence[];
  projects: Project[];
  conspiracies: Conspiracy[];
  currentProjectId: string | null;
  currentCaseId: string | null;
  pinMode?: boolean;
  onPinComplete?: () => void;
  isAdminHint: boolean;
  onSelect: (id: string) => void;
  onDeleted?: (id: string) => void;
}

type FilterKey = "all" | "approved" | "review";
type LockerSort = "credibility" | "newest" | "risk";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function manipulationScore(evidence: Evidence) {
  return Math.max(4, Math.min(90, 100 - evidence.credibility_score + (evidence.manipulation_flags?.length ?? 0) * 12));
}

function ScoreLine({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const color = inverse
    ? value < 15 ? "var(--green)" : value < 35 ? "var(--amber)" : "var(--red)"
    : value > 75 ? "var(--green)" : value > 50 ? "var(--amber)" : "var(--red)";
  return (
    <div className="locker-score-line">
      <div><span>{label}</span><strong>{value}<em>/100</em></strong></div>
      <i><b style={{ width: `${value}%`, background: color, boxShadow: `0 0 6px ${color}` }} /></i>
    </div>
  );
}

function CredibilityBuckets({ evidences }: { evidences: Evidence[] }) {
  const buckets = [
    { label: "0-25", count: evidences.filter((item) => item.credibility_score <= 25).length, color: "var(--red)" },
    { label: "26-50", count: evidences.filter((item) => item.credibility_score > 25 && item.credibility_score <= 50).length, color: "oklch(0.70 0.18 35)" },
    { label: "51-75", count: evidences.filter((item) => item.credibility_score > 50 && item.credibility_score <= 75).length, color: "var(--amber)" },
    { label: "76-100", count: evidences.filter((item) => item.credibility_score > 75).length, color: "var(--green)" }
  ];
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));

  return (
    <div className="cred-buckets">
      <div>
        {buckets.map((bucket) => (
          <span key={bucket.label}>
            <em>{bucket.count}</em>
            <b style={{ height: `${Math.max(8, (bucket.count / max) * 42)}px`, background: bucket.color }} />
          </span>
        ))}
      </div>
      <div>
        {buckets.map((bucket) => <small key={bucket.label}>{bucket.label}</small>)}
      </div>
    </div>
  );
}

export function EvidenceLocker({
  evidences,
  projects,
  conspiracies,
  currentProjectId,
  currentCaseId,
  pinMode = false,
  onPinComplete,
  isAdminHint,
  onSelect,
  onDeleted
}: EvidenceLockerProps) {
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId ?? projects[0]?.id ?? "");
  const [selectedCaseId, setSelectedCaseId] = useState(currentCaseId ?? "");
  const [newCaseTitle, setNewCaseTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortMode, setSortMode] = useState<LockerSort>("credibility");
  const [initialCredibility, setInitialCredibility] = useState<"low" | "med" | "high" | "auto">("auto");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const filteredEvidence = useMemo(() => {
    if (filter === "approved") {
      return evidences.filter((item) => (item.review_status ?? "approved") === "approved");
    }
    if (filter === "review") {
      return evidences.filter((item) => (item.review_status ?? "approved") !== "approved");
    }
    return evidences;
  }, [evidences, filter]);

  const sortedEvidence = useMemo(() => {
    return [...filteredEvidence].sort((a, b) => {
      if (sortMode === "newest") return Date.parse(b.created_at) - Date.parse(a.created_at);
      if (sortMode === "risk") return manipulationScore(b) - manipulationScore(a);
      return b.credibility_score - a.credibility_score;
    });
  }, [filteredEvidence, sortMode]);

  const archivedCount = useMemo(
    () => evidences.filter((evidence) => evidence.archive_status === "archived").length,
    [evidences]
  );
  const highCount = evidences.filter((evidence) => evidence.credibility_score >= 75).length;
  const flaggedCount = evidences.filter((evidence) => manipulationScore(evidence) > 30).length;
  const activeProjectId = selectedProjectId && projects.some((project) => project.id === selectedProjectId)
    ? selectedProjectId
    : "";
  const projectCases = conspiracies.filter((item) => item.project_id === activeProjectId);
  const activeCaseId = selectedCaseId && projectCases.some((item) => item.id === selectedCaseId)
    ? selectedCaseId
    : "";

  async function createIntakeCaseIfNeeded() {
    if (activeCaseId) {
      return activeCaseId;
    }

    const title = newCaseTitle.trim();
    if (!title) {
      return "";
    }

    if (!activeProjectId) {
      throw new Error("Choose a project before creating a new case.");
    }

    const id = `case-${slugify(title) || crypto.randomUUID()}`;
    await setDoc(
      doc(db, "conspiracies", id),
      {
        project_id: activeProjectId,
        title,
        summary: "New case opened during evidence intake.",
        credibility_avg: 0,
        evidence_count: 0,
        string_count: 0,
        tags: splitTags(tags),
        thumbnail: null,
        last_weaved: serverTimestamp(),
        embedding: []
      },
      { merge: true }
    );
    await setDoc(
      doc(db, "projects", activeProjectId),
      {
        updated_at: serverTimestamp(),
        last_weaved: serverTimestamp()
      },
      { merge: true }
    );
    setSelectedCaseId(id);
    setNewCaseTitle("");
    return id;
  }

  async function assignEvidence(evidenceId: string) {
    const caseId = await createIntakeCaseIfNeeded();
    if (activeProjectId) {
      await updateDoc(doc(db, "evidences", evidenceId), {
        project_id: activeProjectId,
        updated_at: serverTimestamp()
      });
    }

    if (caseId) {
      const callable = httpsCallable<
        { evidenceId: string; caseId: string },
        { evidenceId: string; caseId: string; status: string }
      >(functions, "linkEvidenceToCase");
      await callable({ evidenceId, caseId });
    }

    return caseId;
  }

  function assignmentLabel(caseId = activeCaseId) {
    const project = projects.find((item) => item.id === activeProjectId);
    const evidenceCase = conspiracies.find((item) => item.id === caseId) ?? (caseId && newCaseTitle.trim()
      ? { title: newCaseTitle.trim() }
      : null);
    if (project && evidenceCase) return `Filed under ${project.title} / ${evidenceCase.title}.`;
    if (project) return `Assigned to project ${project.title}. Choose a case later to place it on the board.`;
    return "Queued without project assignment.";
  }

  async function pinExistingEvidence(evidence: Evidence, returnToBoard = false) {
    if (!isAdminHint) {
      setMessage("Pinning evidence is admin-only.");
      return;
    }

    if (!activeCaseId && !newCaseTitle.trim()) {
      setMessage("Choose an existing case or enter a new case name before pinning evidence.");
      return;
    }

    if (evidence.linked_conspiracy_ids.includes(activeCaseId)) {
      setMessage(`${evidence.title} is already filed under this case.`);
      if (returnToBoard) {
        onPinComplete?.();
        onSelect(evidence.id);
      }
      return;
    }

    setAssigningId(evidence.id);
    setMessage(null);
    try {
      const caseId = await assignEvidence(evidence.id);
      setMessage(`Pinned ${evidence.title}. ${assignmentLabel(caseId)}`);
      if (returnToBoard) {
        onPinComplete?.();
        onSelect(evidence.id);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Evidence could not be pinned to that case.");
    } finally {
      setAssigningId(null);
    }
  }

  async function submitUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) return;

    setSubmitting(true);
    setMessage(null);
    try {
      const callable = httpsCallable<
        { url: string; notes?: string; tags?: string[] },
        { evidenceId: string; status: string }
      >(functions, "submitEvidenceUrl");
      const result = await callable({
        url: url.trim(),
        notes: [
          notes.trim(),
          initialCredibility !== "auto" ? `Initial credibility hint: ${initialCredibility}` : ""
        ].filter(Boolean).join("\n") || undefined,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      });
      const caseId = await assignEvidence(result.data.evidenceId);
      setMessage(`Queued evidence ${result.data.evidenceId} (${result.data.status}). ${assignmentLabel(caseId)}`);
      setUrl("");
      setNotes("");
      setTags("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Evidence submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitUpload() {
    if (!file) return;

    setSubmitting(true);
    setUploadProgress(0);
    setMessage(null);
    try {
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("You must be signed in before uploading evidence.");
      const path = `pending-uploads/${uid}/${crypto.randomUUID()}-${safeName}`;
      const uploadRef = ref(storage, path);
      const task = uploadBytesResumable(uploadRef, file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: { originalName: file.name }
      });

      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snapshot) => setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
          reject,
          () => resolve()
        );
      });

      const callable = httpsCallable<
        { storagePath: string; sourceUrl?: string; notes?: string; tags?: string[] },
        { evidenceId: string; status: string }
      >(functions, "submitEvidenceUpload");
      const result = await callable({
        storagePath: path,
        sourceUrl: url.trim() || undefined,
        notes: [
          notes.trim(),
          initialCredibility !== "auto" ? `Initial credibility hint: ${initialCredibility}` : ""
        ].filter(Boolean).join("\n") || undefined,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      });
      const caseId = await assignEvidence(result.data.evidenceId);
      setMessage(`Uploaded and queued evidence ${result.data.evidenceId}. ${assignmentLabel(caseId)}`);
      setFile(null);
      setUploadProgress(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed. Check custom admin claims and Storage rules.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteEvidence(evidence: Evidence) {
    const confirmed = window.confirm(`Delete "${evidence.title}" and its archived assets? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(evidence.id);
    setMessage(null);
    try {
      const callable = httpsCallable<{ evidenceId: string }, { evidenceId: string; stringsDeleted: number; assetsDeleted: number }>(
        functions,
        "deleteEvidenceRecord"
      );
      const result = await callable({ evidenceId: evidence.id });
      setMessage(`Deleted ${evidence.title}. Removed ${result.data.stringsDeleted} strings and ${result.data.assetsDeleted} archived assets.`);
      onDeleted?.(evidence.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Evidence deletion failed.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="locker-view exact-locker">
      <section className="locker-intake exact-intake">
        <div className="section-title">
          <Upload size={14} />
          <div>
            <p>Evidence Intake</p>
            <h2>Preserve a link or file</h2>
          </div>
        </div>

        {isAdminHint ? (
          <>
            <form className="intake-form exact-form" onSubmit={submitUrl}>
              {pinMode ? (
                <p className="system-message">
                  Pin mode is active. Choose a project and case, then click an evidence record below to file it onto the board.
                </p>
              ) : null}
              <label>
                Project
                <select
                  value={activeProjectId}
                  onChange={(event) => {
                    setSelectedProjectId(event.target.value);
                    setSelectedCaseId("");
                    setNewCaseTitle("");
                  }}
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>
              </label>
              <label>
                Case
                <select
                  value={activeCaseId}
                  onChange={(event) => {
                    setSelectedCaseId(event.target.value);
                    if (event.target.value) {
                      setNewCaseTitle("");
                    }
                  }}
                  disabled={!activeProjectId || projectCases.length === 0}
                >
                  <option value="">No case yet</option>
                  {projectCases.map((item) => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </select>
              </label>
              {activeProjectId && !activeCaseId ? (
                <label>
                  New case name
                  <input
                    value={newCaseTitle}
                    onChange={(event) => setNewCaseTitle(event.target.value)}
                    placeholder="September 15, 2024 Trump interview"
                  />
                </label>
              ) : null}
              <label>
                Source URL
                <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/evidence" type="url" />
              </label>
              <label>
                Tags
                <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="cia, pdf, testimony" />
              </label>
              <label>
                Intake notes
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Context, why this matters, or source caveats" />
              </label>

              <div>
                <div className="label-tag">Initial credibility</div>
                <div className="segmented">
                  {(["low", "med", "high", "auto"] as const).map((item) => (
                    <button
                      type="button"
                      className={initialCredibility === item ? "active" : ""}
                      onClick={() => setInitialCredibility(item)}
                      key={item}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <button className="primary-button" type="submit" disabled={submitting || !url.trim()}>
                {submitting ? <Loader2 className="spin" size={15} /> : <Send size={14} />}
                Submit URL
              </button>
            </form>

            <label className="upload-button">
              <FileUp size={14} />
              <span>{file ? file.name : "Upload file"}</span>
              <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
            {file ? (
              <button className="secondary-button exact-upload-submit" onClick={submitUpload} disabled={submitting}>
                Queue upload
              </button>
            ) : null}
            {uploadProgress !== null ? <span className="upload-progress">{uploadProgress}%</span> : null}
            {message ? <p className="system-message">{message}</p> : null}
          </>
        ) : (
          <div className="admin-only-panel">
            <p className="red-label">Read-only archive</p>
            <span>Evidence intake is hidden from public visitors. Sign in with an approved admin account to preserve links, upload files, and queue analysis.</span>
          </div>
        )}

        <div className="preservation-note">
          <p className="red-label">Preservation</p>
          <span>URLs are timestamped, hashed, and stored with redaction notes. Local uploads are mirrored to encrypted archive.</span>
        </div>

        <div className="locker-distribution">
          <div className="label-tag">Credibility distribution</div>
          <CredibilityBuckets evidences={evidences} />
        </div>
      </section>

      <section className="locker-results exact-results">
        <div className="locker-stats exact-locker-stats">
          <p><strong>{evidences.length}</strong>records</p>
          <p><strong>{archivedCount}</strong>archived</p>
          <p><strong>{highCount}</strong>high credibility</p>
          <p><strong>{flaggedCount}</strong>manipulation flagged</p>
        </div>

        <div className="locker-tabs-row">
          <div className="locker-tabs">
            {[
              { id: "all" as const, label: "All" },
              { id: "approved" as const, label: "Approved" },
              { id: "review" as const, label: "In review" }
            ].map((item) => (
              <button className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)} key={item.id}>
                {item.label}
              </button>
            ))}
          </div>
          <button
            className="sort-button"
            onClick={() => setSortMode((current) => current === "credibility" ? "newest" : current === "newest" ? "risk" : "credibility")}
          >
            Sort: {sortMode}
          </button>
        </div>

        <div className="evidence-table exact-evidence-table">
          {sortedEvidence.map((evidence) => {
            const manip = manipulationScore(evidence);
            return (
              <article
                key={evidence.id}
                className="evidence-row exact-evidence-row"
                onClick={() => {
                  if (pinMode) {
                    void pinExistingEvidence(evidence, true);
                    return;
                  }
                  onSelect(evidence.id);
                }}
              >
                <div className="locker-row-main">
                  <div className="locker-row-badges">
                    <span className={`archive-chip ${evidence.archive_status}`}>{evidence.archive_status.replace("_", " ")}</span>
                    <span className={`archive-chip ${evidence.review_status ?? "approved"}`}>{evidence.review_status === "pending_review" ? "review" : evidence.review_status ?? "approved"}</span>
                    {manip > 30 ? <span className="archive-chip failed">flag / {manip}</span> : null}
                  </div>
                  <h3>{evidence.title}</h3>
                  <div className="locker-row-source">{evidence.platform} / {evidence.type}</div>
                  <p>{evidence.content_text}</p>
                  <div className="locker-score-grid">
                    <ScoreLine label="cred" value={evidence.credibility_score} />
                    <ScoreLine label="manip" value={manip} inverse />
                  </div>
                  <div className="entity-list compact">
                    {evidence.tags.slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                </div>
                <div className="locker-row-actions">
                  {isAdminHint ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void pinExistingEvidence(evidence, false);
                      }}
                      disabled={
                        (!activeCaseId && !newCaseTitle.trim()) ||
                        assigningId === evidence.id ||
                        Boolean(activeCaseId && evidence.linked_conspiracy_ids.includes(activeCaseId))
                      }
                      title={activeCaseId || newCaseTitle.trim() ? "Pin evidence to selected case" : "Choose or name a case before pinning"}
                    >
                      {assigningId === evidence.id ? <Loader2 className="spin" size={14} /> : <Plus size={14} />}
                    </button>
                  ) : null}
                  <a href={evidence.source_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} title="Open source">
                    <ExternalLink size={14} />
                  </a>
                  {isAdminHint ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteEvidence(evidence);
                      }}
                      disabled={deletingId === evidence.id}
                      title="Delete evidence"
                    >
                      {deletingId === evidence.id ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
