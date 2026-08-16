"use client";

import { formatCompactMoney } from "@/lib/format";
import { cityMapPosition, INDIA_OUTLINE_PATH } from "@/lib/india-geo";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useMemo, useState } from "react";

export type MapCity = {
  id: string;
  name: string;
  code: string;
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

export function IndiaMap({ cities, edges }: { cities: MapCity[]; edges: MapEdge[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const positioned = useMemo(
    () =>
      cities.map((c) => {
        const [x, y] = cityMapPosition(c.name);
        return { ...c, x, y };
      }),
    [cities]
  );

  const byId = useMemo(() => new Map(positioned.map((c) => [c.id, c])), [positioned]);
  const maxVolume = Math.max(1, ...positioned.map((c) => c.volume));

  return (
    <div className="relative">
      <svg viewBox="0 0 400 450" className="mx-auto h-[420px] w-full max-w-sm">
        <path
          d={INDIA_OUTLINE_PATH}
          className="fill-zinc-100 stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-700"
          strokeWidth={1.5}
        />

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
                className="stroke-amber-500/70 dark:stroke-amber-400/70"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                markerEnd="url(#arrow)"
              />
              <text
                x={midX}
                y={midY - 3}
                textAnchor="middle"
                className="fill-amber-700 text-[7px] font-medium dark:fill-amber-300"
              >
                {formatCompactMoney(e.amount)}
              </text>
            </g>
          );
        })}

        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" className="fill-amber-500 dark:fill-amber-400" />
          </marker>
        </defs>

        {positioned.map((c) => {
          const r = 5 + (c.volume / maxVolume) * 9;
          const tone = c.balance >= 0 ? "fill-emerald-500" : "fill-rose-500";
          return (
            <g
              key={c.id}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <Link href={`/cities/${c.id}`}>
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={r}
                  className={cn(tone, "cursor-pointer opacity-80 transition-opacity hover:opacity-100")}
                  stroke="white"
                  strokeWidth={1.5}
                />
                <text
                  x={c.x}
                  y={c.y + r + 10}
                  textAnchor="middle"
                  className="fill-zinc-700 text-[8px] font-semibold dark:fill-zinc-200"
                >
                  {c.code}
                </text>
              </Link>
            </g>
          );
        })}
      </svg>

      {hovered && byId.has(hovered) && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-zinc-900">
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

      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Net positive
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Net negative
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-px bg-amber-500" /> Inter-city obligation
        </span>
      </div>
    </div>
  );
}
