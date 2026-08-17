"use client";

import { formatCompactMoney } from "@/lib/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const GRID = "rgba(120,120,120,0.15)";
const AXIS = "currentColor";

type TooltipPayloadEntry = {
  dataKey?: string | number;
  name?: string | number;
  value?: number;
  color?: string;
};

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {formatCompactMoney(p.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

export function BalanceByCityChart({ data }: { data: { name: string; balance: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={AXIS} className="text-muted" />
        <YAxis
          tickFormatter={(v) => formatCompactMoney(v)}
          tick={{ fontSize: 11 }}
          stroke={AXIS}
          className="text-muted"
          width={60}
        />
        <Tooltip content={<MoneyTooltip />} />
        <Bar dataKey="balance" name="Balance" fill="#6366f1" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ReceivablePayableChart({
  data,
}: {
  data: { name: string; receivable: number; payable: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={AXIS} className="text-muted" />
        <YAxis
          tickFormatter={(v) => formatCompactMoney(v)}
          tick={{ fontSize: 11 }}
          stroke={AXIS}
          className="text-muted"
          width={60}
        />
        <Tooltip content={<MoneyTooltip />} />
        <Bar dataKey="receivable" name="Receivable" fill="#10b981" radius={[4, 4, 0, 0]} />
        <Bar dataKey="payable" name="Payable" fill="#f43f5e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VolumeChart({ data }: { data: { day: string; volume: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke={AXIS} className="text-muted" />
        <YAxis
          tickFormatter={(v) => formatCompactMoney(v)}
          tick={{ fontSize: 11 }}
          stroke={AXIS}
          className="text-muted"
          width={60}
        />
        <Tooltip content={<MoneyTooltip />} />
        <Line type="monotone" dataKey="volume" name="Volume" stroke="#6366f1" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PartyExposureChart({
  data,
}: {
  data: { name: string; exposure: number; status: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => formatCompactMoney(v)}
          tick={{ fontSize: 11 }}
          stroke={AXIS}
          className="text-muted"
        />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} stroke={AXIS} className="text-muted" />
        <Tooltip content={<MoneyTooltip />} />
        <Bar dataKey="exposure" name="Exposure" fill="#f59e0b" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
