"use client";
// Cytoscape view of GraphView. Owned wallets sit in the middle, the services and exchanges they paid
// around them, the crowd on the outside. SAME_OWNER edges are the thick dashed ones; hover (or tap)
// an edge to see its evidence. Docs: https://js.cytoscape.org (cytoscape 3.34.4).
import { useEffect, useRef, useState } from "react";
import type { Core, ElementDefinition } from "cytoscape";
import type { GraphView } from "@glasshouse/engine";
import type { Mode } from "./data";

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function elements(graph: GraphView): ElementDefinition[] {
  return [
    ...graph.nodes.map((n) => ({
      data: { id: n.id, label: n.owned || n.kind === "service" || n.kind === "exchange" || n.kind === "pool" ? n.label : "", kind: n.kind, owned: n.owned },
    })),
    ...graph.edges.map((e, i) => ({ data: { id: `e${i}`, source: e.source, target: e.target, type: e.type, label: e.label } })),
  ];
}

// Three fixed rings: the person in the middle, what they paid around them, the crowd outside.
function rings(graph: GraphView): Record<string, { x: number; y: number }> {
  const inner = graph.nodes.filter((n) => n.owned);
  const middle = graph.nodes.filter((n) => !n.owned && n.kind !== "" && n.kind !== "one-time");
  const outer = graph.nodes.filter((n) => !n.owned && (n.kind === "" || n.kind === "one-time"));
  const pos: Record<string, { x: number; y: number }> = {};
  const place = (nodes: typeof graph.nodes, r: number, turn = 0) =>
    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * 2 * Math.PI + turn;
      pos[n.id] = nodes.length === 1 && r < 100 ? { x: 0, y: 0 } : { x: r * Math.cos(a), y: r * Math.sin(a) };
    });
  place(inner, 70, -Math.PI / 2);
  place(middle, 190, -Math.PI / 2);
  place(outer, 300);
  return pos;
}

export function Graph({ graph, mode, height = "h-[380px] sm:h-[460px]" }: { graph: GraphView; mode: Mode; height?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    let disposed = false;
    import("cytoscape").then(({ default: cytoscape }) => {
      if (disposed || !box.current) return;
      const exposed = cssVar("--exposed"), safe = cssVar("--safe"), ink = cssVar("--ink"), ink2 = cssVar("--ink-2");
      const crowd = cssVar("--crowd"), line = cssVar("--line"), surface = cssVar("--surface"), accent = cssVar("--accent");
      cy.current?.destroy();
      delete box.current.dataset.ready;
      const instance = cytoscape({
        container: box.current,
        elements: elements(graph),
        minZoom: 0.2,
        maxZoom: 3,
        wheelSensitivity: 0.2,
        style: [
          { selector: "node", style: { width: 7, height: 7, "background-color": crowd, "border-width": 0, label: "data(label)", color: ink2, "font-size": 10, "text-valign": "bottom", "text-margin-y": 3 } },
          { selector: "node[kind = 'one-time']", style: { "background-opacity": 0, "border-width": 1.5, "border-color": crowd } },
          { selector: "node[kind = 'service']", style: { shape: "round-rectangle", width: 14, height: 14, "background-color": surface, "border-width": 2, "border-color": ink2, "font-size": 11, color: ink } },
          { selector: "node[kind = 'exchange'], node[kind = 'pool']", style: { shape: "diamond", width: 20, height: 20, "background-color": accent, "font-size": 12, "font-weight": "bold", color: ink } },
          { selector: "node[?owned]", style: { width: 26, height: 26, "background-color": mode === "open" ? exposed : safe, "border-width": 3, "border-color": surface, "font-size": 14, "font-weight": "bold", color: ink, "z-index": 10 } },
          { selector: "edge", style: { width: 0.6, "line-color": line, opacity: 0.55, "curve-style": "haystack" } },
          { selector: "edge[type = 'SAME_OWNER']", style: { width: 5, "line-color": exposed, "line-style": "dashed", opacity: 1, "curve-style": "bezier", "z-index": 9 } },
        ],
        layout: { name: "preset", positions: rings(graph), fit: true, padding: 16 },
      });
      box.current.dataset.ready = mode;
      const show = (evt: cytoscape.EventObject) => {
        const p = evt.renderedPosition ?? evt.target.renderedMidpoint?.();
        setTip({ x: p.x, y: p.y, text: evt.target.data("label") as string });
      };
      instance.on("mouseover tap", "edge", show);
      instance.on("mouseout", "edge", () => setTip(null));
      instance.on("tap", (evt) => evt.target === instance && setTip(null));
      cy.current = instance;
    });
    return () => {
      disposed = true;
    };
  }, [graph, mode]);

  useEffect(() => () => cy.current?.destroy(), []);

  const owned = graph.nodes.filter((n) => n.owned).length;
  const links = graph.edges.filter((e) => e.type === "SAME_OWNER").length;
  return (
    <div className="relative">
      <div ref={box} data-testid="graph" className={`${height} w-full`} role="img"
        aria-label={`Payment graph: ${graph.nodes.length} wallets; ${owned} linked to you; ${links} same-owner links`} />
      {tip && (
        <div className="pointer-events-none absolute z-10 max-w-[240px] -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2 py-1 text-sm text-bg shadow"
          style={{ left: tip.x, top: tip.y - 8 }}>
          {tip.text}
        </div>
      )}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
        <li><span className={`mr-1.5 inline-block size-3 rounded-full align-middle ${mode === "open" ? "bg-exposed" : "bg-safe"}`} />Your wallets</li>
        <li><span className="mr-1.5 inline-block size-3 rotate-45 bg-accent align-middle" />Exchange / rail</li>
        <li><span className="mr-1.5 inline-block size-3 rounded-sm border-2 border-ink-2 align-middle" />Paid service</li>
        <li><span className="mr-1.5 inline-block size-2.5 rounded-full bg-crowd align-middle" />Other people</li>
        {mode === "open" && <li><span className="mr-1.5 inline-block w-6 border-t-4 border-dashed border-exposed align-middle" />Same owner (hover for evidence)</li>}
      </ul>
    </div>
  );
}
