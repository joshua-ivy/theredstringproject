"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { ChevronLeft, FolderOpen, Plus, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { db } from "@/lib/firebase";
import type { Connection, Conspiracy, Evidence, Project } from "@/types/domain";

interface RedStringBoardProps {
  evidences: Evidence[];
  conspiracies: Conspiracy[];
  projects: Project[];
  connections: Connection[];
  activeProjectId: string | null;
  activeCaseId: string | null;
  selectedEvidenceId: string | null;
  isAdminHint: boolean;
  onSelectEvidence: (id: string) => void;
  onOpenProject: (id: string) => void;
  onBackToProjects: () => void;
  onOpenCase: (id: string) => void;
  onBackToProjectCases: () => void;
  onLinkEvidenceToCase: (evidenceId: string, caseId: string) => Promise<void>;
  onUnlinkEvidenceFromCase: (evidenceId: string, caseId: string) => Promise<void>;
  onPinEvidence: () => void;
  onNewString: () => void;
}

type NodeKind = "project" | "evidence" | "case";

interface BoardNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  rotate?: number;
}

interface BoardString {
  id: string;
  source: string;
  target: string;
  weight: number;
  type: string;
}

const BOARD_LAYOUT_DOC_ID = "default";
const PERSONAL_BOARD_STORAGE_KEY = "red-string-personal-board-node-positions-v1";
const BOARD_MIN_X = -900;
const BOARD_MIN_Y = -220;
const BOARD_MAX_X = 3200;
const BOARD_MAX_Y = 1420;
const BOARD_WIDTH = BOARD_MAX_X - BOARD_MIN_X;
const BOARD_HEIGHT = BOARD_MAX_Y - BOARD_MIN_Y;

function hashNumber(value: string) {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function storedNode(value: unknown): value is BoardNode {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BoardNode>;
  return (
    typeof candidate.id === "string" &&
    (candidate.kind === "project" || candidate.kind === "evidence" || candidate.kind === "case") &&
    typeof candidate.x === "number" &&
    typeof candidate.y === "number"
  );
}

function shortTitle(value: string, max = 46) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function readPersonalPositions() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PERSONAL_BOARD_STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => storedNode(value))) as Record<string, BoardNode>;
  } catch {
    return {};
  }
}

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

export function RedStringBoard({
  evidences,
  conspiracies,
  projects,
  connections,
  activeProjectId,
  activeCaseId,
  selectedEvidenceId,
  isAdminHint,
  onSelectEvidence,
  onOpenProject,
  onBackToProjects,
  onOpenCase,
  onBackToProjectCases,
  onLinkEvidenceToCase,
  onUnlinkEvidenceFromCase,
  onPinEvidence,
  onNewString
}: RedStringBoardProps) {
  const [zoom, setZoom] = useState(0.78);
  const [pan, setPan] = useState({ x: BOARD_MIN_X, y: BOARD_MIN_Y });
  const [boardMessage, setBoardMessage] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [nodePositions, setNodePositions] = useState<Record<string, BoardNode>>({});
  const [sharedPositions, setSharedPositions] = useState<Record<string, BoardNode>>({});
  const [personalPositions, setPersonalPositions] = useState<Record<string, BoardNode>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; evidenceId: string } | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({ title: "", summary: "", tags: "" });
  const [caseForm, setCaseForm] = useState({ title: "", summary: "", tags: "" });
  const [creatingRecord, setCreatingRecord] = useState(false);
  const nodePositionsRef = useRef<Record<string, BoardNode>>({});
  const [drag, setDrag] = useState<
    | { mode: "pan"; startX: number; startY: number; originX: number; originY: number }
    | { mode: "node"; id: string; startX: number; startY: number; originX: number; originY: number }
    | null
  >(null);

  useEffect(() => {
    const ref = doc(db, "board_layouts", BOARD_LAYOUT_DOC_ID);
    return onSnapshot(
      ref,
      (snapshot) => {
        const positions = snapshot.data()?.positions;
        if (!positions || typeof positions !== "object") {
          setSharedPositions({});
          return;
        }
        setSharedPositions(
          Object.fromEntries(Object.entries(positions).filter(([, value]) => storedNode(value))) as Record<string, BoardNode>
        );
      },
      () => {
        setSharedPositions({});
      }
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const timer = window.setTimeout(() => setPersonalPositions(readPersonalPositions()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const baseNodes = useMemo(() => {
    const nodes: BoardNode[] = [];
    const casePositions = new Map<string, { x: number; y: number }>();
    const filedCounts = new Map<string, number>();
    let unfiledIndex = 0;

    if (!activeProjectId) {
      projects.forEach((item, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        nodes.push({
          id: item.id,
          kind: "project",
          x: 360 + column * 620,
          y: 360 + row * 380
        });
      });
      return nodes;
    }

    const visibleCases = activeCaseId
      ? conspiracies.filter((item) => item.id === activeCaseId)
      : conspiracies;

    if (!activeCaseId) {
      nodes.push({
        id: activeProjectId,
        kind: "project",
        x: 420,
        y: 380
      });
    }

    visibleCases.forEach((item, index) => {
      const column = activeCaseId ? 0 : index % 3;
      const row = activeCaseId ? 0 : Math.floor(index / 3);
      const slot = activeCaseId
        ? { x: 720, y: 430 }
        : { x: 900 + column * 520, y: 310 + row * 330 };
      casePositions.set(item.id, slot);
      nodes.push({
        id: item.id,
        kind: "case",
        x: slot.x,
        y: slot.y
      });
    });

    if (!activeCaseId) {
      return nodes;
    }

    evidences.forEach((item) => {
      const primaryCaseId = item.linked_conspiracy_ids.find((caseId) => casePositions.has(caseId));
      const caseSlot = primaryCaseId ? casePositions.get(primaryCaseId) : null;
      const filedIndex = primaryCaseId ? filedCounts.get(primaryCaseId) ?? 0 : unfiledIndex;
      if (primaryCaseId) {
        filedCounts.set(primaryCaseId, filedIndex + 1);
      } else {
        unfiledIndex += 1;
      }

      const lane = filedIndex % 2 === 0 ? -220 : 220;
      const spread = Math.floor(filedIndex / 2);
      const side = spread % 2 === 0 ? -1 : 1;
      const orbit = Math.floor(spread / 2);
      const slot = caseSlot
        ? {
            x: caseSlot.x + side * (210 + orbit * 220),
            y: caseSlot.y + lane + Math.floor(filedIndex / 8) * 180
          }
        : {
            x: 260 + (filedIndex % 6) * 330,
            y: 920 + Math.floor(filedIndex / 6) * 180
          };

      nodes.push({
        id: item.id,
        kind: "evidence",
        x: Math.max(BOARD_MIN_X + 140, Math.min(BOARD_MAX_X - 170, slot.x)),
        y: Math.max(BOARD_MIN_Y + 120, Math.min(BOARD_MAX_Y - 140, slot.y)),
        rotate: (hashNumber(item.id) % 5) - 2
      });
    });

    return nodes;
  }, [activeCaseId, activeProjectId, conspiracies, evidences, projects]);

  const savedPositions = useMemo(
    () => (isAdminHint ? sharedPositions : { ...sharedPositions, ...personalPositions }),
    [isAdminHint, personalPositions, sharedPositions]
  );

  const activePositions = useMemo(
    () => ({
      ...savedPositions,
      ...nodePositions
    }),
    [nodePositions, savedPositions]
  );

  useEffect(() => {
    nodePositionsRef.current = activePositions;
  }, [activePositions]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, BoardNode>();
    baseNodes.forEach((node) => map.set(node.id, activePositions[node.id] ?? node));
    return map;
  }, [activePositions, baseNodes]);

  const validNodeIds = useMemo(() => new Set(baseNodes.map((node) => node.id)), [baseNodes]);

  const boardStrings = useMemo<BoardString[]>(() => {
    const nodeIds = new Set(baseNodes.map((node) => node.id));
    const projectLinks = activeProjectId && !activeCaseId
      ? conspiracies
          .filter((item) => nodeIds.has(item.id))
          .map((item) => ({
            id: `${activeProjectId}-${item.id}`,
            source: activeProjectId,
            target: item.id,
            weight: Math.max(0.3, item.credibility_avg / 100),
            type: "correlates"
          }))
      : [];
    const explicit = connections
      .filter((connection) => nodeIds.has(connection.from) && nodeIds.has(connection.to))
      .map((connection) => ({
        id: connection.id,
        source: connection.from,
        target: connection.to,
        weight: connection.weight,
        type: connection.type
      }));

    const implicit = evidences.flatMap((evidence) =>
      evidence.linked_conspiracy_ids
        .filter((caseId) => nodeIds.has(caseId))
        .map((caseId) => ({
          id: `${evidence.id}-${caseId}`,
          source: evidence.id,
          target: caseId,
          weight: Math.max(0.24, evidence.credibility_score / 100),
          type: "correlates"
        }))
    );

    const deduped = new Map<string, BoardString>();
    [...projectLinks, ...explicit, ...implicit].forEach((item) => deduped.set(item.id, item));
    return Array.from(deduped.values());
  }, [activeCaseId, activeProjectId, baseNodes, connections, conspiracies, evidences]);

  function pathFor(source: { x: number; y: number }, target: { x: number; y: number }, index: number) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const sag = 30 + Math.abs(dx + dy) * 0.04 + (index % 2) * 8;
    const mx = (source.x + target.x) / 2;
    const my = (source.y + target.y) / 2 + sag;
    return `M ${source.x} ${source.y} Q ${mx} ${my} ${target.x} ${target.y}`;
  }

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    setContextMenu(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ mode: "pan", startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y });
  }

  function beginNodeDrag(event: React.PointerEvent<HTMLElement>, id: string) {
    event.stopPropagation();
    setContextMenu(null);
    const node = nodeMap.get(id);
    if (!node) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ mode: "node", id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y });
  }

  function clampedPosition(x: number, y: number) {
    return {
      x: Math.max(BOARD_MIN_X + 80, Math.min(BOARD_MAX_X - 80, x)),
      y: Math.max(BOARD_MIN_Y + 80, Math.min(BOARD_MAX_Y - 80, y))
    };
  }

  function movePointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag) {
      return;
    }

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (drag.mode === "pan") {
      setPan({ x: drag.originX + dx, y: drag.originY + dy });
      return;
    }

    const next = clampedPosition(drag.originX + dx / zoom, drag.originY + dy / zoom);
    setNodePositions((current) => ({
      ...current,
      [drag.id]: {
        ...(current[drag.id] ?? nodeMap.get(drag.id)),
        ...next
      }
    }));
  }

  function cleanPositions(positions: Record<string, BoardNode>) {
    return Object.fromEntries(
      Object.entries(positions).filter(([id, value]) => validNodeIds.has(id) && storedNode(value))
    ) as Record<string, BoardNode>;
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdminHint) {
      setBoardMessage("Project creation is admin-only.");
      return;
    }

    const title = projectForm.title.trim();
    if (!title) return;

    const id = `project-${slugify(title) || crypto.randomUUID()}`;
    setCreatingRecord(true);
    setBoardMessage(null);
    try {
      await setDoc(
        doc(db, "projects", id),
        {
          title,
          summary: projectForm.summary.trim() || "Top-level project for related case files and evidence.",
          credibility_avg: 0,
          case_count: 0,
          evidence_count: 0,
          string_count: 0,
          tags: splitTags(projectForm.tags),
          status: "active",
          last_weaved: serverTimestamp(),
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        },
        { merge: true }
      );
      setProjectForm({ title: "", summary: "", tags: "" });
      setProjectModalOpen(false);
      onOpenProject(id);
      setBoardMessage(`Project opened: ${title}.`);
    } catch (error) {
      setBoardMessage(error instanceof Error ? error.message : "Project could not be saved.");
    } finally {
      setCreatingRecord(false);
    }
  }

  async function submitCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdminHint) {
      setBoardMessage("Case creation is admin-only.");
      return;
    }
    if (!activeProjectId) {
      setBoardMessage("Open a project before creating a case.");
      return;
    }

    const title = caseForm.title.trim();
    if (!title) return;

    const id = `case-${slugify(title) || crypto.randomUUID()}`;
    setCreatingRecord(true);
    setBoardMessage(null);
    try {
      await setDoc(
        doc(db, "conspiracies", id),
        {
          project_id: activeProjectId,
          title,
          summary: caseForm.summary.trim() || "New case opened for evidence review.",
          credibility_avg: 0,
          evidence_count: 0,
          string_count: 0,
          tags: splitTags(caseForm.tags),
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
      setCaseForm({ title: "", summary: "", tags: "" });
      setCaseModalOpen(false);
      onOpenCase(id);
      setBoardMessage(`Case opened: ${title}.`);
    } catch (error) {
      setBoardMessage(error instanceof Error ? error.message : "Case could not be saved.");
    } finally {
      setCreatingRecord(false);
    }
  }

  async function persistPositions(nextPositions: Record<string, BoardNode>, changedNodeId: string) {
    const cleanedPositions = cleanPositions(nextPositions);

    if (!isAdminHint) {
      const changedNode = cleanedPositions[changedNodeId];
      if (!changedNode) {
        return;
      }
      const nextPersonalPositions = cleanPositions({
        ...personalPositions,
        [changedNodeId]: changedNode
      });
      setPersonalPositions(nextPersonalPositions);
      window.localStorage.setItem(PERSONAL_BOARD_STORAGE_KEY, JSON.stringify(nextPersonalPositions));
      setNodePositions({});
      return;
    }

    try {
      await setDoc(
        doc(db, "board_layouts", BOARD_LAYOUT_DOC_ID),
        {
          positions: cleanedPositions,
          updated_at: serverTimestamp()
        },
        { merge: true }
      );
      setSharedPositions(cleanedPositions);
      setNodePositions({});
    } catch (error) {
      setBoardMessage(error instanceof Error ? error.message : "Could not save shared board layout.");
    }
  }

  function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  async function endPointer(event: React.PointerEvent<HTMLDivElement>) {
    const activeDrag = drag;
    setDrag(null);
    if (!activeDrag || activeDrag.mode !== "node") {
      return;
    }

    const moved = Math.hypot(event.clientX - activeDrag.startX, event.clientY - activeDrag.startY);
    if (moved < 24) {
      return;
    }

    const draggedNode = nodeMap.get(activeDrag.id);
    if (!draggedNode) {
      return;
    }

    const finalPosition = clampedPosition(
      activeDrag.originX + (event.clientX - activeDrag.startX) / zoom,
      activeDrag.originY + (event.clientY - activeDrag.startY) / zoom
    );
    const nextPositions = {
      ...nodePositionsRef.current,
      [activeDrag.id]: {
        ...(nodePositionsRef.current[activeDrag.id] ?? draggedNode),
        ...finalPosition
      }
    };
    setNodePositions(nextPositions);
    void persistPositions(nextPositions, activeDrag.id);

    const evidenceNode = draggedNode.kind === "evidence"
      ? { id: draggedNode.id, position: finalPosition }
      : Array.from(nodeMap.values())
          .filter((node) => node.kind === "evidence")
          .map((node) => ({ id: node.id, position: node }))
          .sort((a, b) => distance(a.position, finalPosition) - distance(b.position, finalPosition))[0];
    const caseNode = draggedNode.kind === "case"
      ? { id: draggedNode.id, position: finalPosition }
      : Array.from(nodeMap.values())
          .filter((node) => node.kind === "case")
          .map((node) => ({ id: node.id, position: node }))
          .sort((a, b) => distance(a.position, finalPosition) - distance(b.position, finalPosition))[0];

    if (!evidenceNode || !caseNode || evidenceNode.id === caseNode.id) {
      return;
    }

    if (distance(evidenceNode.position, caseNode.position) > 150) {
      return;
    }

    const evidence = evidences.find((item) => item.id === evidenceNode.id);
    const targetCase = conspiracies.find((item) => item.id === caseNode.id);
    if (!evidence || !targetCase) {
      return;
    }

    if (evidence.linked_conspiracy_ids.includes(targetCase.id)) {
      setBoardMessage(`${evidence.title} is already filed under ${targetCase.title}.`);
      return;
    }

    if (!isAdminHint) {
      setBoardMessage("Sign in as admin to file evidence under a case by dragging.");
      return;
    }

    setLinking(true);
    setBoardMessage(`Filing ${evidence.title} under ${targetCase.title}...`);
    try {
      await onLinkEvidenceToCase(evidence.id, targetCase.id);
      setBoardMessage(`Filed ${evidence.title} under ${targetCase.title}.`);
    } catch (error) {
      setBoardMessage(error instanceof Error ? error.message : "Could not file evidence under that case.");
    } finally {
      setLinking(false);
    }
  }

  async function undockEvidence(evidenceId: string, caseId: string) {
    const evidence = evidences.find((item) => item.id === evidenceId);
    const targetCase = conspiracies.find((item) => item.id === caseId);

    if (!evidence || !targetCase) {
      return;
    }

    if (!isAdminHint) {
      setBoardMessage("Sign in as admin to undock evidence from a case.");
      return;
    }

    setLinking(true);
    setContextMenu(null);
    setBoardMessage(`Undocking ${evidence.title} from ${targetCase.title}...`);
    try {
      await onUnlinkEvidenceFromCase(evidence.id, targetCase.id);
      setBoardMessage(`Undocked ${evidence.title} from ${targetCase.title}.`);
    } catch (error) {
      setBoardMessage(error instanceof Error ? error.message : "Could not undock that evidence.");
    } finally {
      setLinking(false);
    }
  }

  const contextEvidence = contextMenu ? evidences.find((item) => item.id === contextMenu.evidenceId) ?? null : null;
  const contextCases = contextEvidence
    ? contextEvidence.linked_conspiracy_ids
        .map((caseId) => conspiracies.find((item) => item.id === caseId))
        .filter((item): item is Conspiracy => Boolean(item))
    : [];
  const activeProject = activeProjectId ? projects.find((item) => item.id === activeProjectId) ?? null : null;
  const activeCase = activeCaseId ? conspiracies.find((item) => item.id === activeCaseId) ?? null : null;

  return (
    <div className="board-wrap">
      <div className="board-toolbar" aria-label="Board tools">
        <button onClick={() => setZoom((value) => Math.max(0.3, value - 0.1))} title="Zoom out">
          <ZoomOut size={14} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))} title="Zoom in">
          <ZoomIn size={14} />
        </button>
        <button
          onClick={() => {
            setNodePositions({});
            if (isAdminHint) {
              void deleteDoc(doc(db, "board_layouts", BOARD_LAYOUT_DOC_ID));
              setSharedPositions({});
            } else {
              window.localStorage.removeItem(PERSONAL_BOARD_STORAGE_KEY);
              setPersonalPositions({});
            }
            setBoardMessage("Board layout reset to the clean default.");
          }}
          title="Reset saved board layout"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="board-scope-bar">
        {activeProject ? (
          <button onClick={onBackToProjects} title="Back to projects">
            <ChevronLeft size={13} /> Projects
          </button>
        ) : null}
        {activeProject ? <span>{activeProject.title}</span> : <span>Projects</span>}
        {activeCase ? (
          <>
            <button onClick={onBackToProjectCases} title="Back to project cases">
              <ChevronLeft size={13} /> Cases
            </button>
            <span>{activeCase.title}</span>
          </>
        ) : null}
      </div>

      <div
        className="board-pan-surface"
        onPointerDown={beginPan}
        onPointerMove={movePointer}
        onPointerUp={(event) => void endPointer(event)}
        onPointerCancel={(event) => void endPointer(event)}
      >
        <div
          className="board-world"
          style={{
            width: BOARD_WIDTH,
            height: BOARD_HEIGHT,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
          }}
        >
          <svg className="board-strings" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} aria-hidden="true">
            <defs>
              <filter id="subtle-red-glow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {boardStrings.map((string, index) => {
              const source = nodeMap.get(string.source);
              const target = nodeMap.get(string.target);
              if (!source || !target) {
                return null;
              }
              const renderedSource = { x: source.x - BOARD_MIN_X, y: source.y - BOARD_MIN_Y };
              const renderedTarget = { x: target.x - BOARD_MIN_X, y: target.y - BOARD_MIN_Y };
              const selected = string.source === selectedEvidenceId || string.target === selectedEvidenceId;
              return (
                <g key={string.id}>
                  <path
                    className={`red-string ${string.type} ${selected ? "selected-string" : ""}`}
                    d={pathFor(renderedSource, renderedTarget, index)}
                    strokeWidth={1 + string.weight * 3.4}
                    opacity={selected ? 0.94 : 0.35 + string.weight * 0.38}
                    filter={selected || string.weight > 0.7 ? "url(#subtle-red-glow)" : undefined}
                  />
                  <circle className="string-endpoint" cx={renderedSource.x} cy={renderedSource.y} r={2.8 + string.weight * 2.4} />
                  <circle className="string-endpoint" cx={renderedTarget.x} cy={renderedTarget.y} r={2.8 + string.weight * 2.4} />
                </g>
              );
            })}
          </svg>

          {projects.map((item) => {
            const node = nodeMap.get(item.id);
            if (!node) {
              return null;
            }
            return (
              <button
                key={item.id}
                className={`project-anchor ${item.id === activeProjectId ? "selected" : ""}`}
                style={{ left: node.x - BOARD_MIN_X - 130, top: node.y - BOARD_MIN_Y - 76 }}
                onPointerDown={(event) => beginNodeDrag(event, item.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenProject(item.id);
                }}
              >
                <span className="project-node-mark"><FolderOpen size={18} /></span>
                <strong>{shortTitle(item.title, 36)}</strong>
                <em>{item.case_count} cases / {item.evidence_count} records</em>
                <i>{item.credibility_avg}/100 avg credibility</i>
              </button>
            );
          })}

          {conspiracies.map((item) => {
            const node = nodeMap.get(item.id);
            if (!node) {
              return null;
            }
            return (
              <button
                key={item.id}
                className={`case-anchor ${item.id === activeCaseId ? "selected" : ""}`}
                style={{ left: node.x - BOARD_MIN_X - 90, top: node.y - BOARD_MIN_Y - 50 }}
                onPointerDown={(event) => beginNodeDrag(event, item.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (activeProjectId && !activeCaseId) {
                    onOpenCase(item.id);
                  }
                }}
              >
                <span className="case-orbit" />
                <strong>{shortTitle(item.title, 28)}</strong>
                <em>{item.credibility_avg}/100 / {item.evidence_count} records</em>
              </button>
            );
          })}

          {evidences.map((item) => {
            const node = nodeMap.get(item.id);
            if (!node) {
              return null;
            }
            const isSelected = item.id === selectedEvidenceId;
            return (
              <article
                key={item.id}
                className={`board-note ${isSelected ? "selected" : ""}`}
                style={{ left: node.x - BOARD_MIN_X - 85, top: node.y - BOARD_MIN_Y - 30, transform: `rotate(${node.rotate ?? 0}deg)` }}
                onPointerDown={(event) => beginNodeDrag(event, item.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectEvidence(item.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectEvidence(item.id);
                  if (isAdminHint) {
                    const menuX =
                      typeof window === "undefined" ? event.clientX : Math.min(event.clientX, window.innerWidth - 300);
                    const menuY =
                      typeof window === "undefined" ? event.clientY : Math.min(event.clientY, window.innerHeight - 180);
                    setContextMenu({
                      x: Math.max(12, menuX),
                      y: Math.max(12, menuY),
                      evidenceId: item.id
                    });
                  } else {
                    setBoardMessage("Sign in as admin to undock evidence from a case.");
                  }
                }}
              >
                <span className="pin" />
                <div className="note-type">{item.platform} / {item.type}</div>
                <h3>{shortTitle(item.title)}</h3>
                <p>{shortTitle(item.content_text, 68)}</p>
                <div className="note-meta">
                  <span>{item.credibility_score}/100</span>
                  <span>{item.linked_conspiracy_ids.length} case{item.linked_conspiracy_ids.length === 1 ? "" : "s"}</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {contextMenu ? (
        <div
          className="board-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <p>{contextEvidence?.title ?? "Evidence"}</p>
          {contextCases.length ? (
            contextCases.map((item) => (
              <button key={item.id} onClick={() => void undockEvidence(contextMenu.evidenceId, item.id)}>
                Undock from {shortTitle(item.title, 34)}
              </button>
            ))
          ) : (
            <span>No case links to undock.</span>
          )}
        </div>
      ) : null}

      <div className="board-hud">
        <span>{evidences.length} evidence records</span>
        <span>/</span>
        <span>{connections.length} saved strings</span>
        <span>/</span>
        <span>{conspiracies.length} case clusters</span>
      </div>
      {boardMessage ? <div className="board-action-message">{boardMessage}</div> : null}
      {linking ? <div className="board-linking-indicator">Linking evidence...</div> : null}
      <div className="board-help-corner">
        <button onClick={() => {
          if (!isAdminHint) {
            setBoardMessage("Sign in as admin to create projects.");
            return;
          }
          setProjectModalOpen(true);
        }}>
          <Plus size={12} /> New project
        </button>
        {activeProjectId ? (
          <button onClick={() => {
            if (!isAdminHint) {
              setBoardMessage("Sign in as admin to create cases.");
              return;
            }
            setCaseModalOpen(true);
          }}>
            <Plus size={12} /> New case
          </button>
        ) : null}
        <button onClick={() => {
          setBoardMessage("Opening Evidence Locker. Add or select evidence to pin it onto the board.");
          onPinEvidence();
        }}>
          <Plus size={12} /> Pin evidence
        </button>
        <button onClick={() => {
          setBoardMessage("Strings are created from analyzed evidence connections. Start from Evidence Locker intake.");
          onNewString();
        }}>
          New string
        </button>
      </div>

      {projectModalOpen ? (
        <div className="modal-backdrop board-modal-backdrop" role="presentation" onMouseDown={() => setProjectModalOpen(false)}>
          <section className="case-modal board-create-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setProjectModalOpen(false)} title="Close new project">
              <X size={16} />
            </button>
            <p className="red-label">New project</p>
            <h2 id="new-project-title">Create a project</h2>
            <form className="intake-form exact-form" onSubmit={submitProject}>
              <label>
                Project title
                <input value={projectForm.title} onChange={(event) => setProjectForm((current) => ({ ...current, title: event.target.value }))} placeholder="UFO / UAP" />
              </label>
              <label>
                Summary
                <textarea value={projectForm.summary} onChange={(event) => setProjectForm((current) => ({ ...current, summary: event.target.value }))} placeholder="What broad investigation this project organizes" />
              </label>
              <label>
                Tags
                <input value={projectForm.tags} onChange={(event) => setProjectForm((current) => ({ ...current, tags: event.target.value }))} placeholder="uap, defense, testimony" />
              </label>
              <button className="primary-button" disabled={creatingRecord || !projectForm.title.trim()}>
                <Plus size={14} /> Create project
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {caseModalOpen ? (
        <div className="modal-backdrop board-modal-backdrop" role="presentation" onMouseDown={() => setCaseModalOpen(false)}>
          <section className="case-modal board-create-modal" role="dialog" aria-modal="true" aria-labelledby="new-board-case-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setCaseModalOpen(false)} title="Close new case">
              <X size={16} />
            </button>
            <p className="red-label">New case / {activeProject?.title ?? "Project"}</p>
            <h2 id="new-board-case-title">Create a case file</h2>
            <form className="intake-form exact-form" onSubmit={submitCase}>
              <label>
                Case title
                <input value={caseForm.title} onChange={(event) => setCaseForm((current) => ({ ...current, title: event.target.value }))} placeholder="AARO FY23 report timeline" />
              </label>
              <label>
                Summary
                <textarea value={caseForm.summary} onChange={(event) => setCaseForm((current) => ({ ...current, summary: event.target.value }))} placeholder="What this case collects under the current project" />
              </label>
              <label>
                Tags
                <input value={caseForm.tags} onChange={(event) => setCaseForm((current) => ({ ...current, tags: event.target.value }))} placeholder="aaro, report, uap" />
              </label>
              <button className="primary-button" disabled={creatingRecord || !caseForm.title.trim()}>
                <Plus size={14} /> Create case
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
