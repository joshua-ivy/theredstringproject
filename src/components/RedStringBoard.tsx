"use client";

import { useMemo, useState } from "react";
import { Plus, ZoomIn, ZoomOut } from "lucide-react";
import type { Connection, Conspiracy, Evidence } from "@/types/domain";

interface RedStringBoardProps {
  evidences: Evidence[];
  conspiracies: Conspiracy[];
  connections: Connection[];
  selectedEvidenceId: string | null;
  onSelectEvidence: (id: string) => void;
  onPinEvidence: () => void;
  onNewString: () => void;
}

type NodeKind = "evidence" | "case";

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

const BOARD_WIDTH = 1400;
const BOARD_HEIGHT = 800;

const evidenceSlotById: Record<string, { x: number; y: number; rotate: number }> = {
  "evidence-church-hearings": { x: 540, y: 230, rotate: -4 },
  "evidence-national-archives": { x: 290, y: 285, rotate: 2 },
  "evidence-uap-testimony": { x: 580, y: 540, rotate: -1 },
  "evidence-declassified-memo": { x: 870, y: 200, rotate: 3 },
  "evidence-social-claim": { x: 950, y: 470, rotate: -2 },
  "evidence-rss-news": { x: 220, y: 460, rotate: -2 }
};

const fallbackEvidenceSlots = [
  { x: 540, y: 230, rotate: -4 },
  { x: 290, y: 285, rotate: 2 },
  { x: 580, y: 540, rotate: -1 },
  { x: 870, y: 200, rotate: 3 },
  { x: 950, y: 470, rotate: -2 },
  { x: 220, y: 460, rotate: -2 },
  { x: 1110, y: 310, rotate: 2 },
  { x: 720, y: 650, rotate: -3 }
];

const caseSlotById: Record<string, { x: number; y: number }> = {
  "case-mkultra": { x: 410, y: 360 },
  "case-uap": { x: 760, y: 380 },
  "case-election-media": { x: 1080, y: 600 }
};

const ghostArtifacts = [
  { x: 126, y: 314, rotate: -7, label: "RS-011 / unresolved" },
  { x: 1208, y: 222, rotate: 5, label: "source fragment" },
  { x: 180, y: 706, rotate: 2, label: "retrieved 04.26" },
  { x: 1200, y: 696, rotate: -4, label: "entity index" },
  { x: 686, y: 92, rotate: -2, label: "hash verified" }
];

function hashNumber(value: string) {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function shortTitle(value: string, max = 46) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

export function RedStringBoard({
  evidences,
  conspiracies,
  connections,
  selectedEvidenceId,
  onSelectEvidence,
  onPinEvidence,
  onNewString
}: RedStringBoardProps) {
  const [zoom, setZoom] = useState(0.78);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [boardMessage, setBoardMessage] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, BoardNode>>({});
  const [drag, setDrag] = useState<
    | { mode: "pan"; startX: number; startY: number; originX: number; originY: number }
    | { mode: "node"; id: string; startX: number; startY: number; originX: number; originY: number }
    | null
  >(null);

  const baseNodes = useMemo(() => {
    const nodes: BoardNode[] = [];

    conspiracies.forEach((item, index) => {
      const slot = caseSlotById[item.id] ?? { x: 410 + index * 240, y: 360 + (index % 2) * 110 };
      nodes.push({
        id: item.id,
        kind: "case",
        x: slot.x,
        y: slot.y
      });
    });

    evidences.forEach((item, index) => {
      const slot = evidenceSlotById[item.id] ?? fallbackEvidenceSlots[index % fallbackEvidenceSlots.length];
      const ring = Math.floor(index / fallbackEvidenceSlots.length);
      nodes.push({
        id: item.id,
        kind: "evidence",
        x: Math.min(1240, slot.x + ring * 48),
        y: Math.min(700, slot.y + ring * 36),
        rotate: slot.rotate + (hashNumber(item.id) % 3) - 1
      });
    });

    return nodes;
  }, [conspiracies, evidences]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, BoardNode>();
    baseNodes.forEach((node) => map.set(node.id, nodePositions[node.id] ?? node));
    return map;
  }, [baseNodes, nodePositions]);

  const boardStrings = useMemo<BoardString[]>(() => {
    const nodeIds = new Set(baseNodes.map((node) => node.id));
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
    [...explicit, ...implicit].forEach((item) => deduped.set(item.id, item));
    return Array.from(deduped.values());
  }, [baseNodes, connections, evidences]);

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
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ mode: "pan", startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y });
  }

  function beginNodeDrag(event: React.PointerEvent<HTMLElement>, id: string) {
    event.stopPropagation();
    const node = nodeMap.get(id);
    if (!node) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ mode: "node", id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y });
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

    setNodePositions((current) => ({
      ...current,
      [drag.id]: {
        ...(current[drag.id] ?? nodeMap.get(drag.id)),
        x: Math.max(70, Math.min(BOARD_WIDTH - 70, drag.originX + dx / zoom)),
        y: Math.max(70, Math.min(BOARD_HEIGHT - 70, drag.originY + dy / zoom))
      }
    }));
  }

  function endPointer() {
    setDrag(null);
  }

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
      </div>

      <div
        className="board-pan-surface"
        onPointerDown={beginPan}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
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
            {ghostArtifacts.slice(1).map((artifact, index) => (
              <path
                key={artifact.label}
                className="ghost-string"
                d={pathFor(ghostArtifacts[0], artifact, index)}
              />
            ))}
            {boardStrings.map((string, index) => {
              const source = nodeMap.get(string.source);
              const target = nodeMap.get(string.target);
              if (!source || !target) {
                return null;
              }
              const selected = string.source === selectedEvidenceId || string.target === selectedEvidenceId;
              return (
                <g key={string.id}>
                  <path
                    className={`red-string ${string.type} ${selected ? "selected-string" : ""}`}
                    d={pathFor(source, target, index)}
                    strokeWidth={1 + string.weight * 3.4}
                    opacity={selected ? 0.94 : 0.35 + string.weight * 0.38}
                    filter={selected || string.weight > 0.7 ? "url(#subtle-red-glow)" : undefined}
                  />
                  <circle className="string-endpoint" cx={source.x} cy={source.y} r={2.8 + string.weight * 2.4} />
                  <circle className="string-endpoint" cx={target.x} cy={target.y} r={2.8 + string.weight * 2.4} />
                </g>
              );
            })}
          </svg>

          {ghostArtifacts.map((artifact) => (
            <div
              key={artifact.label}
              className="ghost-artifact ghost-artifact-html"
              style={{ left: artifact.x, top: artifact.y, transform: `translate(-50%, -50%) rotate(${artifact.rotate}deg)` }}
            >
              <span className="pin ghost-pin" />
              {artifact.label}
            </div>
          ))}

          {conspiracies.map((item) => {
            const node = nodeMap.get(item.id);
            if (!node) {
              return null;
            }
            return (
              <button
                key={item.id}
                className="case-anchor"
                style={{ left: node.x - 90, top: node.y - 50 }}
                onPointerDown={(event) => beginNodeDrag(event, item.id)}
                onClick={(event) => event.preventDefault()}
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
                style={{ left: node.x - 85, top: node.y - 30, transform: `rotate(${node.rotate ?? 0}deg)` }}
                onPointerDown={(event) => beginNodeDrag(event, item.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectEvidence(item.id);
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

      <div className="board-hud">
        <span>{evidences.length} evidence records</span>
        <span>/</span>
        <span>{connections.length} saved strings</span>
        <span>/</span>
        <span>{conspiracies.length} case clusters</span>
      </div>
      {boardMessage ? <div className="board-action-message">{boardMessage}</div> : null}
      <div className="board-help-corner">
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
    </div>
  );
}
