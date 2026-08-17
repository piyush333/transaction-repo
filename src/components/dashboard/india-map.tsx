"use client";

import { cn } from "@/lib/cn";
import { formatCompactMoney } from "@/lib/format";
import { INDIA_LOCATIONS, INDIA_VIEWBOX, stateIdForName } from "@/lib/india-map-data";
import { Minus, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

export type MapCity = {
  id: string;
  name: string;
  code: string;
  state: string | null;
  balance: number;
  receivable: number;
  payable: number;
  volume: number;
};

export type MapEdge = {
  fromId: string;
  toId: string;
  amount: number;
};

type Rect = { cx: number; cy: number; w: number; h: number };

// Deterministic hash so repeat renders place the same city at the same spot.
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

const [VB_X, VB_Y, VB_W, VB_H] = INDIA_VIEWBOX.split(" ").map(Number);
const MIN_SCALE = 1;
const MAX_SCALE = 6;

export function IndiaMap({ cities, edges }: { cities: MapCity[]; edges: MapEdge[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [stateRects, setStateRects] = useState<Record<string, Rect>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  // Real geometry: read each rendered state path's actual bounding box once
  // mounted, so city markers land inside their true state boundary instead
  // of a hand-guessed pixel position.
  useLayoutEffect(() => {
    if (!svgRef.current) return;
    const rects: Record<string, Rect> = {};
    svgRef.current.querySelectorAll<SVGPathElement>("path[data-state-id]").forEach((el) => {
      const id = el.getAttribute("data-state-id");
      if (!id) return;
      const b = el.getBBox();
      rects[id] = { cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height };
    });
    setStateRects(rects);
  }, []);

  const fallbackRect: Rect = { cx: VB_X + VB_W / 2, cy: VB_Y + VB_H / 2, w: VB_W, h: VB_H };

  const positioned = useMemo(() => {
    // Group cities by matched state so multiple cities in one state spread
    // out on a deterministic golden-angle spiral instead of colliding at
    // the same centroid (or, for unmatched states, the same map-wide hash).
    const groups = new Map<string, typeof cities>();
    for (const c of cities) {
      const key = stateIdForName(c.state) ?? `__unmatched_${hash(c.id) % 7}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }

    const result = new Map<string, { x: number; y: number }>();
    for (const [key, group] of groups) {
      const stateId = key.startsWith("__unmatched_") ? null : key;
      const rect = (stateId && stateRects[stateId]) || fallbackRect;
      const maxRadius = Math.min(rect.w, rect.h) * 0.32;
      const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
      sorted.forEach((c, i) => {
        if (i === 0) {
          result.set(c.id, { x: rect.cx, y: rect.cy });
          return;
        }
        const angle = i * 137.5 * (Math.PI / 180);
        const radius = maxRadius * Math.sqrt(i / sorted.length);
        result.set(c.id, { x: rect.cx + Math.cos(angle) * radius, y: rect.cy + Math.sin(angle) * radius });
      });
    }

    return cities.map((c) => ({ ...c, ...(result.get(c.id) ?? { x: fallbackRect.cx, y: fallbackRect.cy }) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, stateRects]);

  const byId = useMemo(() => new Map(positioned.map((c) => [c.id, c])), [positioned]);
  const maxVolume = Math.max(1, ...positioned.map((c) => c.volume));
  const activeStateIds = useMemo(
    () => new Set(cities.map((c) => stateIdForName(c.state)).filter(Boolean)),
    [cities]
  );

  function clampTransform(next: { x: number; y: number; k: number }) {
    const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.k));
    const maxX = (VB_W * (k - 1)) / 2;
    const maxY = (VB_H * (k - 1)) / 2;
    return { k, x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  }

  function zoomBy(factor: number) {
    setTransform((t) => clampTransform({ ...t, k: t.k * factor }));
  }

  // Converts a mouse/pointer event to a point in the SVG's own viewBox
  // coordinate space (upstream of the pan/zoom <g> transform), so we can
  // keep that exact map point fixed under the cursor while scaling —
  // otherwise every scroll would re-center on the map's middle instead of
  // wherever the user is actually looking.
  function svgPointFromEvent(e: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  }

  function zoomAt(factor: number, cursor: { x: number; y: number } | null) {
    setTransform((t) => {
      const cx = VB_X + VB_W / 2;
      const cy = VB_Y + VB_H / 2;
      const kNew = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.k * factor));
      if (!cursor) return clampTransform({ ...t, k: kNew });
      const origX = (cursor.x - cx) / t.k + cx + t.x;
      const origY = (cursor.y - cy) / t.k + cy + t.y;
      const txNew = origX - cx - (cursor.x - cx) / kNew;
      const tyNew = origY - cy - (cursor.y - cy) / kNew;
      return clampTransform({ k: kNew, x: txNew, y: tyNew });
    });
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, svgPointFromEvent(e));
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    dragRef.current = { x: transform.x, y: transform.y, startX: e.clientX, startY: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const scale = VB_W / svg.clientWidth;
    const dx = (e.clientX - dragRef.current.startX) * scale;
    const dy = (e.clientY - dragRef.current.startY) * scale;
    setTransform((t) => clampTransform({ ...t, x: dragRef.current!.x - dx, y: dragRef.current!.y - dy }));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={INDIA_VIEWBOX}
        className="mx-auto h-[440px] w-full max-w-md cursor-grab touch-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <g
          transform={`translate(${VB_X + VB_W / 2}, ${VB_Y + VB_H / 2}) scale(${transform.k}) translate(${-(VB_X + VB_W / 2) - transform.x}, ${-(VB_Y + VB_H / 2) - transform.y})`}
        >
          {INDIA_LOCATIONS.map((loc) => (
            <path
              key={loc.id}
              data-state-id={loc.id}
              d={loc.path}
              className={cn(
                "stroke-border transition-colors duration-150",
                activeStateIds.has(loc.id) ? "fill-accent/[0.08]" : "fill-foreground/[0.035]"
              )}
              strokeWidth={0.6}
            />
          ))}

          {edges.map((e, i) => {
            const from = byId.get(e.fromId);
            const to = byId.get(e.toId);
            if (!from || !to) return null;
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            return (
              <g key={i}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className="stroke-amber-500"
                  strokeWidth={1.2 / transform.k}
                  strokeDasharray={`${5 / transform.k} ${3 / transform.k}`}
                  markerEnd="url(#arrow)"
                  opacity={0.8}
                />
                <text
                  x={midX}
                  y={midY - 3 / transform.k}
                  textAnchor="middle"
                  className="fill-amber-600 font-medium dark:fill-amber-400"
                  fontSize={7 / transform.k}
                >
                  {formatCompactMoney(e.amount)}
                </text>
              </g>
            );
          })}

          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="fill-amber-500" />
            </marker>
          </defs>

          {positioned.map((c) => {
            const r = (4 + (c.volume / maxVolume) * 7) / transform.k;
            const tone = c.balance >= 0 ? "fill-emerald-500" : "fill-rose-500";
            return (
              <g key={c.id} onMouseEnter={() => setHovered(c.id)} onMouseLeave={() => setHovered(null)}>
                <Link href={`/cities/${c.id}`}>
                  {hovered === c.id && (
                    <circle cx={c.x} cy={c.y} r={r * 2.2} className={cn(tone, "animate-ping opacity-30")} />
                  )}
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={r}
                    className={cn(tone, "cursor-pointer opacity-90 transition-opacity hover:opacity-100")}
                    stroke="var(--surface)"
                    strokeWidth={1.5 / transform.k}
                  />
                  <text
                    x={c.x}
                    y={c.y + r + 9 / transform.k}
                    textAnchor="middle"
                    className="fill-foreground font-semibold"
                    fontSize={8 / transform.k}
                  >
                    {c.code}
                  </text>
                </Link>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button
          onClick={() => zoomBy(1.4)}
          aria-label="Zoom in"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-muted shadow-sm transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => zoomBy(1 / 1.4)}
          aria-label="Zoom out"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-muted shadow-sm transition-colors hover:text-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
          aria-label="Reset view"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-muted shadow-sm transition-colors hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {hovered && byId.has(hovered) && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
          {(() => {
            const c = byId.get(hovered)!;
            return (
              <div className="space-y-0.5">
                <p className="font-semibold">{c.name}</p>
                <p>Net Position: {formatCompactMoney(c.balance)}</p>
                <p>Receivable: {formatCompactMoney(c.receivable)}</p>
                <p>Payable: {formatCompactMoney(c.payable)}</p>
              </div>
            );
          })()}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Net positive
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Net negative
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-px bg-amber-500" /> Inter-city obligation
        </span>
        <span className="text-muted/70">Scroll or drag to explore</span>
      </div>
    </div>
  );
}
