"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Archive, Bot, ClipboardCheck, FolderKanban, Network, Search } from "lucide-react";
import { AdminMonitor } from "@/components/AdminMonitor";
import { AnimatePresence, motion } from "framer-motion";
import { AuthGate } from "@/components/AuthGate";
import { CaseFiles } from "@/components/CaseFiles";
import { EvidenceDetail } from "@/components/EvidenceDetail";
import { EvidenceLocker } from "@/components/EvidenceLocker";
import { OraclePanel } from "@/components/OraclePanel";
import { RedStringBoard } from "@/components/RedStringBoard";
import { db } from "@/lib/firebase";
import { sampleConnections, sampleConspiracies, sampleEvidence } from "@/lib/sample-data";
import type { Connection, Conspiracy, Evidence } from "@/types/domain";

type ViewKey = "web" | "case-files" | "evidence-locker" | "oracle" | "review";

const views: Array<{ key: ViewKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: "web", label: "The Web", icon: Network },
  { key: "case-files", label: "Case Files", icon: FolderKanban },
  { key: "evidence-locker", label: "Evidence Locker", icon: Archive },
  { key: "oracle", label: "The Oracle", icon: Bot },
  { key: "review", label: "Review", icon: ClipboardCheck }
];

function iso(value: unknown) {
  if (!value) {
    return new Date().toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  return new Date(value as string | number | Date).toISOString();
}

export function AppShell() {
  return (
    <AuthGate>
      {({ user, isAdminHint }) => (
        <AuthenticatedApp userEmail={user.email ?? "unknown"} isAdminHint={isAdminHint} />
      )}
    </AuthGate>
  );
}

function AuthenticatedApp({
  userEmail,
  isAdminHint
}: {
  userEmail: string;
  isAdminHint: boolean;
}) {
  const [activeView, setActiveView] = useState<ViewKey>("web");
  const [searchTerm, setSearchTerm] = useState("");
  const [credibilityMin, setCredibilityMin] = useState(0);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(sampleEvidence[0]?.id ?? null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [evidences, setEvidences] = useState<Evidence[]>(sampleEvidence);
  const [conspiracies, setConspiracies] = useState<Conspiracy[]>(sampleConspiracies);
  const [connections, setConnections] = useState<Connection[]>(sampleConnections);
  const [dataStatus, setDataStatus] = useState<"live" | "sample" | "error">("sample");

  useEffect(() => {
    const evidenceQuery = query(collection(db, "evidences"), orderBy("created_at", "desc"), limit(100));
    const conspiracyQuery = query(collection(db, "conspiracies"), orderBy("last_weaved", "desc"), limit(60));
    const connectionQuery = query(collection(db, "connections"), orderBy("created_at", "desc"), limit(250));

    const unsubscribeEvidence = onSnapshot(
      evidenceQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            created_at: iso(data.created_at),
            updated_at: data.updated_at ? iso(data.updated_at) : undefined,
            retrieved_at: iso(data.retrieved_at),
            archived_assets: data.archived_assets ?? [],
            linked_conspiracy_ids: data.linked_conspiracy_ids ?? [],
            tags: data.tags ?? [],
            entities: data.entities ?? [],
            review_status: data.review_status ?? "approved"
          } as Evidence;
        });
        if (docs.length > 0) {
          setEvidences(docs);
          setDataStatus("live");
          setSelectedEvidenceId((current) => current ?? docs[0]?.id ?? null);
        }
      },
      () => setDataStatus("error")
    );

    const unsubscribeConspiracies = onSnapshot(
      conspiracyQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            last_weaved: iso(data.last_weaved),
            tags: data.tags ?? []
          } as Conspiracy;
        });
        if (docs.length > 0) {
          setConspiracies(docs);
        }
      },
      () => setDataStatus("error")
    );

    const unsubscribeConnections = onSnapshot(
      connectionQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            created_at: iso(data.created_at),
            updated_at: data.updated_at ? iso(data.updated_at) : undefined
          } as Connection;
        });
        if (docs.length > 0) {
          setConnections(docs);
        }
      },
      () => setDataStatus("error")
    );

    return () => {
      unsubscribeEvidence();
      unsubscribeConspiracies();
      unsubscribeConnections();
    };
  }, []);

  const filteredEvidence = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return evidences.filter((evidence) => {
      const passesCredibility = evidence.credibility_score >= credibilityMin;
      if (!needle) {
        return passesCredibility;
      }

      const haystack = [
        evidence.title,
        evidence.content_text,
        evidence.platform,
        evidence.archive_status,
        ...evidence.tags,
        ...evidence.entities
      ]
        .join(" ")
        .toLowerCase();
      return passesCredibility && haystack.includes(needle);
    });
  }, [credibilityMin, evidences, searchTerm]);

  const selectedEvidence = useMemo(
    () => evidences.find((evidence) => evidence.id === selectedEvidenceId) ?? filteredEvidence[0] ?? null,
    [evidences, filteredEvidence, selectedEvidenceId]
  );

  const boardEvidence = useMemo(
    () => filteredEvidence.filter((evidence) => (evidence.review_status ?? "approved") === "approved"),
    [filteredEvidence]
  );

  return (
    <main className="app-frame">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark">RS</span>
          <div>
            <p>The</p>
            <h1>Red String Project</h1>
          </div>
        </div>

        <div className="header-search">
          <Search size={16} />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search evidence, entities, tags"
          />
        </div>

        <div className="header-meta">
          <span className={`status-dot ${dataStatus}`} />
          <span>{dataStatus === "live" ? "Connected" : dataStatus === "error" ? "Using demo records" : "Demo records"}</span>
          <span className="role-chip" title={userEmail}>
            {isAdminHint ? "Admin" : "Read only"}
          </span>
        </div>
      </header>

      <nav className="app-nav">
        {views.map((view) => {
          const Icon = view.icon;
          return (
            <button
              key={view.key}
              className={activeView === view.key ? "active" : ""}
              onClick={() => setActiveView(view.key)}
            >
              <Icon size={16} />
              {view.label}
            </button>
          );
        })}
      </nav>

      <div className="disclaimer-strip">
        Exploratory pattern board. Evidence scores explain source quality and connection strength; they are not proof that a claim is true.
      </div>

      <section className="workspace">
        <aside className="filter-rail">
          <label>
            <span>Credibility</span>
            <strong>{credibilityMin}+</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={credibilityMin}
              onChange={(event) => setCredibilityMin(Number(event.target.value))}
            />
          </label>
          <div className="stat-stack">
            <p>
              <span>{boardEvidence.length}</span>
              board evidence
            </p>
            <p>
              <span>{connections.length}</span>
                strings
            </p>
            <p>
              <span>{conspiracies.length}</span>
                cases
            </p>
          </div>
        </aside>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            className="view-surface"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {activeView === "web" ? (
              <RedStringBoard
                evidences={boardEvidence}
                conspiracies={conspiracies}
                connections={connections}
                selectedEvidenceId={selectedEvidence?.id ?? null}
                onSelectEvidence={(id) => {
                  setSelectedEvidenceId(id);
                  setMobileDetailOpen(true);
                }}
              />
            ) : null}

            {activeView === "case-files" ? (
              <CaseFiles
                conspiracies={conspiracies}
                evidences={boardEvidence}
                connections={connections}
                onOpenCase={(caseId) => {
                  const firstEvidence = boardEvidence.find((evidence) =>
                    evidence.linked_conspiracy_ids.includes(caseId)
                  );
                  setSelectedEvidenceId(firstEvidence?.id ?? null);
                  setActiveView("web");
                }}
              />
            ) : null}

            {activeView === "evidence-locker" ? (
              <EvidenceLocker
                evidences={filteredEvidence}
                isAdminHint={isAdminHint}
                onSelect={(id) => {
                  setSelectedEvidenceId(id);
                  setActiveView("web");
                }}
              />
            ) : null}

            {activeView === "oracle" ? (
              <OraclePanel evidences={evidences} isAdminHint={isAdminHint} />
            ) : null}

            {activeView === "review" ? (
              <AdminMonitor evidences={evidences} isAdminHint={isAdminHint} />
            ) : null}
          </motion.div>
        </AnimatePresence>

        <aside className="detail-panel">
          <EvidenceDetail evidence={selectedEvidence} />
        </aside>
      </section>

      <button className="mobile-detail-button" onClick={() => setMobileDetailOpen(true)}>
        Selected evidence
      </button>
      {mobileDetailOpen ? (
        <div className="mobile-detail-sheet">
          <EvidenceDetail evidence={selectedEvidence} onClose={() => setMobileDetailOpen(false)} />
        </div>
      ) : null}
    </main>
  );
}
