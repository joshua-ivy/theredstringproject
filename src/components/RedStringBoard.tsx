"use client";

import { useMemo, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import type { Connection, Conspiracy, Evidence } from "@/types/domain";

interface RedStringBoardProps {
  evidences: Evidence[];
  conspiracies: Conspiracy[];
  connections: Connection[];
  selectedEvidenceId: string | null;
  onSelectEvidence: (id: string) => void;
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

const evidenceSlots = [
  { x: 214, y: 172, rotate: -3 },
  { x: 456, y: 154, rotate: 2 },
  { x: 712, y: 182, rotate: -2 },
  { x: 1004, y: 164, rotate: 3 },
  { x: 302, y: 394, rotate: 2 },
  { x: 566, y: 442, rotate: -3 },
  { x: 850, y: 426, rotate: 1 },
  { x: 1142, y: 392, rotate: -2 },
  { x: 252, y: 628, rotate: -2 },
  { x: 520, y: 640, rotate: 3 },
  { x: 798, y: 646, rotate: -1 },
  { x: 1084, y: 624, rotate: 2 }
];

const caseSlots = [
  { x: 407, y: 338 },
  { x: 738, y: 374 },
  { x: 1058, y: 520 },
  { x: 620, y: 586 },
  { x: 936, y: 276 }
];

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
  onSelectEvidence
}: RedStringBoardProps) {
  const [zoom, setZoom] = useState(0.92);
  const [pan, setPan] = useState({ x: -32, y: 24 });
  const [nodePositions, setNodePositions] = useState<Record<string, BoardNode>>({});
  const [drag, setDrag] = useState<
    | { mode: "pan"; startX: number; startY: number; originX: number; originY: number }
    | { mode: "node"; id: string; startX: number; startY: number; originX: number; originY: number }
    | null
  >(null);

  const baseNodes = useMemo(() => {
    const nodes: BoardNode[] = [];

    conspiracies.forEach((item, index) => {
      const slot = caseSlots[index % caseSlots.length];
      nodes.push({
        id: item.id,
        kind: "case",
        x: slot.x + Math.floor(index / caseSlots.length) * 54,
        y: slot.y + Math.floor(index / caseSlots.length) * 42
      });
    });

    evidences.forEach((item, index) => {
      const slot = evidenceSlots[index % evidenceSlots.length];
      const ring = Math.floor(index / evidenceSlots.length);
      const drift = ring * 52;
      nodes.push({
        id: item.id,
        kind: "evidence",
        x: Math.min(1240, slot.x + drift),
        y: Math.min(700, slot.y + drift * 0.6),
        rotate: slot.rotate + (hashNumber(item.id) % 5) - 2
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
    const bend = (index % 2 === 0 ? 1 : -1) * Math.min(92, Math.sqrt(dx * dx + dy * dy) * 0.18);
    const cx = source.x + dx * 0.5 - dy * 0.08;
    const cy = source.y + dy * 0.5 + bend;
    return `M ${source.x} ${source.y} Q ${cx} ${cy} ${target.x} ${target.y}`;
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
        <button onClick={() => setZoom((value) => Math.max(0.55, value - 0.08))} title="Zoom out">
          <ZoomOut size={14} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((value) => Math.min(1.35, value + 0.08))} title="Zoom in">
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
                style={{ left: node.x, top: node.y }}
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
                style={{ left: node.x, top: node.y, transform: `translate(-50%, -50%) rotate(${node.rotate ?? 0}deg)` }}
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
        <span>{connections.length} saved strings</span>
        <span>{conspiracies.length} case clusters</span>
      </div>
    </div>
  );
}
