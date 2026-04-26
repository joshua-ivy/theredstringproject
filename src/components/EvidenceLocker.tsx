"use client";

import { FormEvent, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytesResumable } from "firebase/storage";
import { Archive, ExternalLink, FileUp, LinkIcon, Loader2, ShieldAlert } from "lucide-react";
import { auth, functions, storage } from "@/lib/firebase";
import type { Evidence } from "@/types/domain";

interface EvidenceLockerProps {
  evidences: Evidence[];
  isAdminHint: boolean;
  onSelect: (id: string) => void;
}

export function EvidenceLocker({ evidences, isAdminHint, onSelect }: EvidenceLockerProps) {
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const archivedCount = useMemo(
    () => evidences.filter((evidence) => evidence.archive_status === "archived").length,
    [evidences]
  );

  async function submitUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) {
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const callable = httpsCallable<
        { url: string; notes?: string; tags?: string[] },
        { evidenceId: string; status: string }
      >(functions, "submitEvidenceUrl");
      const result = await callable({
        url: url.trim(),
        notes: notes.trim() || undefined,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      });
      setMessage(`Queued evidence ${result.data.evidenceId} (${result.data.status}).`);
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
    if (!file) {
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);
    setMessage(null);
    try {
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
      const uid = auth.currentUser?.uid;
      if (!uid) {
        throw new Error("You must be signed in before uploading evidence.");
      }
      const path = `pending-uploads/${uid}/${crypto.randomUUID()}-${safeName}`;
      const uploadRef = ref(storage, path);
      const task = uploadBytesResumable(uploadRef, file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: {
          originalName: file.name
        }
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
        notes: notes.trim() || undefined,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      });
      setMessage(`Uploaded and queued evidence ${result.data.evidenceId}.`);
      setFile(null);
      setUploadProgress(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed. Check custom admin claims and Storage rules.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="locker-view">
      <section className="locker-intake">
        <div className="section-title">
          <Archive size={18} />
          <div>
            <p>Evidence intake</p>
            <h2>Preserve a link or local file</h2>
          </div>
        </div>

        {!isAdminHint ? (
          <div className="guard-note">
            <ShieldAlert size={17} />
            This signed-in user is not in the client admin allowlist. Server Functions will reject writes unless
            ADMIN_EMAILS also includes this email.
          </div>
        ) : null}

        <form className="intake-form" onSubmit={submitUrl}>
          <label>
            Source URL
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/evidence"
              type="url"
            />
          </label>
          <label>
            Tags
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="cia, pdf, testimony" />
          </label>
          <label className="wide">
            Intake notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Context, why this matters, or source caveats"
            />
          </label>
          <button className="primary-button" type="submit" disabled={submitting || !url.trim()}>
            {submitting ? <Loader2 className="spin" size={17} /> : <LinkIcon size={17} />}
            Submit URL
          </button>
        </form>

        <div className="upload-strip">
          <label className="file-input">
            <FileUp size={18} />
            <span>{file ? file.name : "Choose upload"}</span>
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <button className="secondary-button" onClick={submitUpload} disabled={submitting || !file}>
            Upload file
          </button>
          {uploadProgress !== null ? <span className="upload-progress">{uploadProgress}%</span> : null}
        </div>

        {message ? <p className="system-message">{message}</p> : null}
      </section>

      <section className="locker-results">
        <div className="locker-stats">
          <p>
            <strong>{evidences.length}</strong>
            records
          </p>
          <p>
            <strong>{archivedCount}</strong>
            archived
          </p>
          <p>
            <strong>{evidences.filter((evidence) => evidence.credibility_score >= 70).length}</strong>
            high credibility
          </p>
        </div>

        <div className="evidence-table">
          {evidences.map((evidence) => (
            <article key={evidence.id} className="evidence-row" onClick={() => onSelect(evidence.id)}>
              <div>
                <span className={`archive-chip ${evidence.archive_status}`}>{evidence.archive_status}</span>
                <h3>{evidence.title}</h3>
                <p>{evidence.content_text}</p>
                <div className="entity-list compact">
                  {evidence.entities.slice(0, 5).map((entity) => (
                    <span key={entity}>{entity}</span>
                  ))}
                </div>
              </div>
              <div className="row-side">
                <strong>{evidence.credibility_score}</strong>
                <a href={evidence.source_url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                  <ExternalLink size={15} />
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
