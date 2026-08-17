import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import {
  balanceLabel,
  formatCompactMoney,
  formatDate,
  formatDateTime,
  STATUS_LABELS,
  STATUS_TONE,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/format";
import {
  getCityById,
  getPartyBalance,
  getPartyById,
  getTransactionsForParty,
} from "@/lib/queries";
import Link from "next/link";
import { notFound } from "next/navigation";

const PARTY_TYPE_LABELS: Record<string, string> = {
  person: "Person",
  business: "Business",
  agent: "Agent",
  internal: "Internal account",
};

export default async function PartyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [party, balance, transactions] = await Promise.all([
    getPartyById(id),
    getPartyBalance(id),
    getTransactionsForParty(id),
  ]);

  if (!party) notFound();

  const city = await getCityById(party.primary_city_id);
  const bl = balanceLabel(balance?.balance ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {party.name} <span className="text-muted">— {city?.name ?? "Unknown city"}</span>
          </h1>
          <p className="text-sm text-muted">
            {PARTY_TYPE_LABELS[party.party_type]}
            {party.phone ? ` · ${party.phone}` : ""}
          </p>
        </div>
        {!party.active && <Badge tone="neutral">Inactive</Badge>}
      </div>

      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Net {bl.label}
        </p>
        <p
          className={
            "mt-1 text-3xl font-bold tabular-nums " +
            (bl.tone === "positive"
              ? "text-emerald-600 dark:text-emerald-400"
              : bl.tone === "negative"
                ? "text-rose-600 dark:text-rose-400"
                : "")
          }
        >
          {formatCompactMoney(bl.amount)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {bl.label === "Receivable" && `${party.name} owes you ${formatCompactMoney(bl.amount)}.`}
          {bl.label === "Payable" && `You owe ${party.name} ${formatCompactMoney(bl.amount)}.`}
          {bl.label === "Settled" && "Fully settled — no outstanding balance."}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Total Received" value={formatCompactMoney(balance?.total_received ?? 0)} />
        <StatCard label="Total Paid" value={formatCompactMoney(balance?.total_paid ?? 0)} />
        <StatCard label="Opening Balance" value={formatCompactMoney(party.opening_balance)} />
      </div>

      {party.notes && (
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-muted">Notes</p>
          <p className="mt-1 text-sm">{party.notes}</p>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transactions ({transactions.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {transactions.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">No transactions yet.</p>
          )}
          {transactions.map((t) => (
            <Link
              key={t.id}
              href={`/transactions/${t.token}`}
              className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-foreground/[0.04]"
            >
              <span>
                <span className="block font-mono text-xs">
                  Token #{t.token} — {formatDate(t.created_at)}
                </span>
                <span className="text-xs text-muted">
                  {TRANSACTION_TYPE_LABELS[t.transaction_type]} · {formatDateTime(t.created_at)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-sm tabular-nums">{formatCompactMoney(t.amount)}</span>
                <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABELS[t.status]}</Badge>
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
