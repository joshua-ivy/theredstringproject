"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { Connection, Conspiracy, Evidence } from "@/types/domain";

interface RedStringBoardProps {
  evidences: Evidence[];
  conspiracies: Conspiracy[];
  connections: Connection[];
  selectedEvidenceId: string | null;
  onSelectEvidence: (id: string) => void;
}

type BoardNode = d3.SimulationNodeDatum & {
  id: string;
  label: string;
  kind: "evidence" | "case";
  credibility: number;
  archiveStatus?: string;
  platform?: string;
  tags: string[];
};

type BoardLink = d3.SimulationLinkDatum<BoardNode> & {
  id: string;
  source: string | BoardNode;
  target: string | BoardNode;
  weight: number;
  type: string;
  reason: string;
};

export function RedStringBoard({
  evidences,
  conspiracies,
  connections,
  selectedEvidenceId,
  onSelectEvidence
}: RedStringBoardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 960, height: 620 });

  useEffect(() => {
    if (!wrapRef.current) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      setSize({
        width: Math.max(320, entry.contentRect.width),
        height: Math.max(420, entry.contentRect.height)
      });
    });
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);

  const nodes = useMemo<BoardNode[]>(() => {
    const caseNodes = conspiracies.map((item) => ({
      id: item.id,
      label: item.title,
      kind: "case" as const,
      credibility: item.credibility_avg,
      tags: item.tags
    }));

    const evidenceNodes = evidences.map((item) => ({
      id: item.id,
      label: item.title,
      kind: "evidence" as const,
      credibility: item.credibility_score,
      archiveStatus: item.archive_status,
      platform: item.platform,
      tags: item.tags
    }));

    return [...caseNodes, ...evidenceNodes];
  }, [conspiracies, evidences]);

  const links = useMemo<BoardLink[]>(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    const explicitLinks = connections
      .filter((connection) => nodeIds.has(connection.from) && nodeIds.has(connection.to))
      .map((connection) => ({
        id: connection.id,
        source: connection.from,
        target: connection.to,
        weight: connection.weight,
        type: connection.type,
        reason: connection.ai_reason
      }));

    const evidenceCaseLinks = evidences.flatMap((evidence) =>
      evidence.linked_conspiracy_ids
        .filter((caseId) => nodeIds.has(caseId))
        .map((caseId) => ({
          id: `${evidence.id}-${caseId}`,
          source: evidence.id,
          target: caseId,
          weight: Math.max(0.2, evidence.credibility_score / 100),
          type: "correlates",
          reason: "Evidence record lists this case as a linked conspiracy."
        }))
    );

    const deduped = new Map<string, BoardLink>();
    [...explicitLinks, ...evidenceCaseLinks].forEach((link) => deduped.set(link.id, link));
    return Array.from(deduped.values());
  }, [connections, evidences, nodes]);

  useEffect(() => {
    if (!svgRef.current) {
      return;
    }

    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current);
    svg.selectAll("*").remove();

    const width = size.width;
    const height = size.height;
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const defs = svg.append("defs");
    const glow = defs.append("filter").attr("id", "red-glow");
    glow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur");
    const merge = glow.append("feMerge");
    merge.append("feMergeNode").attr("in", "coloredBlur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    const paper = defs
      .append("linearGradient")
      .attr("id", "paper-gradient")
      .attr("x1", "0%")
      .attr("x2", "100%");
    paper.append("stop").attr("offset", "0%").attr("stop-color", "#f6ead2");
    paper.append("stop").attr("offset", "100%").attr("stop-color", "#d5c29f");

    const zoomLayer = svg.append("g").attr("class", "zoom-layer");
    const grid = zoomLayer.append("g").attr("class", "board-grid");
    const linkLayer = zoomLayer.append("g").attr("class", "string-layer");
    const nodeLayer = zoomLayer.append("g").attr("class", "node-layer");

    const gridStep = 42;
    for (let x = -width; x <= width * 2; x += gridStep) {
      grid
        .append("line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", -height)
        .attr("y2", height * 2);
    }
    for (let y = -height; y <= height * 2; y += gridStep) {
      grid
        .append("line")
        .attr("x1", -width)
        .attr("x2", width * 2)
        .attr("y1", y)
        .attr("y2", y);
    }

    const localNodes: BoardNode[] = nodes.map((node, index) => ({
      ...node,
      x: width / 2 + Math.cos(index) * Math.min(width, height) * 0.22,
      y: height / 2 + Math.sin(index) * Math.min(width, height) * 0.22
    }));
    const localLinks = links.map((link) => ({ ...link }));

    const linkSelection = linkLayer
      .selectAll<SVGPathElement, BoardLink>("path")
      .data(localLinks, (d) => d.id)
      .join("path")
      .attr("class", (d) => `red-string ${d.type}`)
      .attr("stroke-width", (d) => 0.8 + d.weight * 4.2)
      .attr("opacity", (d) => 0.25 + d.weight * 0.65)
      .attr("filter", (d) => (d.weight > 0.65 ? "url(#red-glow)" : null));

    const nodeSelection = nodeLayer
      .selectAll<SVGGElement, BoardNode>("g")
      .data(localNodes, (d) => d.id)
      .join("g")
      .attr("class", (d) => `board-node ${d.kind} ${d.id === selectedEvidenceId ? "selected" : ""}`)
      .style("cursor", "grab")
      .on("click", (_, d) => {
        if (d.kind === "evidence") {
          onSelectEvidence(d.id);
        }
      });

    nodeSelection
      .filter((d) => d.kind === "case")
      .append("circle")
      .attr("r", (d) => 28 + d.credibility / 10)
      .attr("class", "case-core")
      .attr("filter", "url(#red-glow)");

    nodeSelection
      .filter((d) => d.kind === "case")
      .append("text")
      .attr("class", "case-label")
      .attr("text-anchor", "middle")
      .attr("dy", 54)
      .text((d) => d.label);

    const evidenceNodes = nodeSelection.filter((d) => d.kind === "evidence");
    evidenceNodes
      .append("rect")
      .attr("x", -54)
      .attr("y", -39)
      .attr("width", 108)
      .attr("height", 78)
      .attr("rx", 4)
      .attr("class", "evidence-card-svg");

    evidenceNodes
      .append("circle")
      .attr("r", 9)
      .attr("cy", -40)
      .attr("class", "node-pin");

    evidenceNodes
      .append("text")
      .attr("class", "platform-label")
      .attr("x", -44)
      .attr("y", -18)
      .text((d) => d.platform ?? "web");

    evidenceNodes
      .append("text")
      .attr("class", "evidence-label")
      .attr("x", -44)
      .attr("y", 4)
      .text((d) => d.label.slice(0, 23));

    evidenceNodes
      .append("text")
      .attr("class", "cred-label")
      .attr("x", -44)
      .attr("y", 26)
      .text((d) => `${Math.round(d.credibility)}/100`);

    const simulation = d3
      .forceSimulation<BoardNode>(localNodes)
      .force(
        "link",
        d3
          .forceLink<BoardNode, BoardLink>(localLinks)
          .id((d) => d.id)
          .distance((d) => 160 - d.weight * 56)
          .strength((d) => 0.12 + d.weight * 0.3)
      )
      .force("charge", d3.forceManyBody().strength(-420))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<BoardNode>().radius((d) => (d.kind === "case" ? 72 : 70)))
      .alpha(0.92);

    function dragstarted(event: d3.D3DragEvent<SVGGElement, BoardNode, BoardNode>) {
      if (!event.active) {
        simulation.alphaTarget(0.25).restart();
      }
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, BoardNode, BoardNode>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, BoardNode, BoardNode>) {
      if (!event.active) {
        simulation.alphaTarget(0);
      }
      event.subject.fx = null;
      event.subject.fy = null;
    }

    nodeSelection.call(
      d3
        .drag<SVGGElement, BoardNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    );

    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.45, 2.3])
        .on("zoom", (event) => {
          zoomLayer.attr("transform", event.transform.toString());
        })
    );

    simulation.on("tick", () => {
      linkSelection.attr("d", (d) => {
        const source = d.source as BoardNode;
        const target = d.target as BoardNode;
        const sx = source.x ?? width / 2;
        const sy = source.y ?? height / 2;
        const tx = target.x ?? width / 2;
        const ty = target.y ?? height / 2;
        const dx = tx - sx;
        const dy = ty - sy;
        const curve = Math.sqrt(dx * dx + dy * dy) * 0.22;
        return `M${sx},${sy} C${sx + dx * 0.48},${sy - curve} ${tx - dx * 0.48},${ty + curve} ${tx},${ty}`;
      });

      nodeSelection.attr("transform", (d) => `translate(${d.x ?? width / 2},${d.y ?? height / 2})`);
    });

    return () => {
      simulation.stop();
    };
  }, [links, nodes, onSelectEvidence, selectedEvidenceId, size.height, size.width]);

  return (
    <div className="board-wrap" ref={wrapRef}>
      <svg ref={svgRef} className="red-string-board" role="img" aria-label="Interactive red string evidence board" />
      <div className="board-hud">
        <span>{evidences.length} evidence nodes</span>
        <span>{connections.length} saved strings</span>
        <span>{conspiracies.length} case clusters</span>
      </div>
    </div>
  );
}
