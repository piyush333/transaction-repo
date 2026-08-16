import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import {
  balanceLabel,
  formatCompactMoney,
  formatDateTime,
  STATUS_LABELS,
  STATUS_TONE,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/format";
import {
  getCityBalances,
  getCityById,
  getCityPartyBalances,
  getCityReceivablePayable,
  getTransactions,
} from "@/lib/queries";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function CityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [city, balances, rp, partyBalances, transactions] = await Promise.all([
    getCityById(id),
    getCityBalances(),
    getCityReceivablePayable(),
    getCityPartyBalances(id),
    getTransactions({ cityId: id }),
  ]);

  if (!city) notFound();

  const balance = balances.find((b) => b.city_id === id);
  const cityRp = rp.find((r) => r.city_id === id);

  const today = new Date().toDateString();
  const todaysTxns = transactions.filter((t) => new Date(t.created_at).toDateString() === today);
  const pending = transactions.filter((t) => t.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {city.name} <span className="text-zinc-400">({city.code})</span>
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {city.state ? `${city.state}, ` : ""}
            {city.country} · {city.currency}
          </p>
        </div>
        {!city.active && <Badge tone="neutral">Inactive</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Current Balance" value={formatCompactMoney(balance?.balance ?? 0)} />
        <StatCard
          label="Receivable"
          value={formatCompactMoney(cityRp?.receivable ?? 0)}
          tone="positive"
        />
        <StatCard
          label="Payable"
          value={formatCompactMoney(cityRp?.payable ?? 0)}
          tone="negative"
        />
        <StatCard
          label="Net Position"
          value={formatCompactMoney(balance?.balance ?? 0)}
          tone={(balance?.balance ?? 0) >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Transactions ({todaysTxns.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {todaysTxns.length === 0 && (
              <p className="py-4 text-center text-sm text-zinc-500">No transactions today.</p>
            )}
            {todaysTxns.map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending Settlements ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.length === 0 && (
              <p className="py-4 text-center text-sm text-zinc-500">Nothing pending.</p>
            )}
            {pending.map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Parties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {partyBalances.length === 0 && (
              <p className="py-4 text-center text-sm text-zinc-500">No party activity yet.</p>
            )}
            {partyBalances.slice(0, 10).map((pb) => {
              const bl = balanceLabel(pb.balance);
              return (
                <Link
                  key={pb.party_id}
                  href={`/parties/${pb.party_id}`}
                  className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <span className="text-sm font-medium">{pb.party!.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm tabular-nums">{formatCompactMoney(bl.amount)}</span>
                    <Badge tone={bl.tone}>{bl.label}</Badge>
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Tokens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {transactions.length === 0 && (
              <p className="py-4 text-center text-sm text-zinc-500">No transactions yet.</p>
            )}
            {transactions.slice(0, 10).map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TxnRow({
  t,
}: {
  t: { id: string; token: string; transaction_type: string; amount: number; status: string; created_at: string };
}) {
  return (
    <Link
      href={`/transactions/${t.token}`}
      className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
    >
      <span>
        <span className="block font-mono text-xs">{t.token}</span>
        <span className="text-xs text-zinc-500">
          {TRANSACTION_TYPE_LABELS[t.transaction_type]} · {formatDateTime(t.created_at)}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="text-sm tabular-nums">{formatCompactMoney(t.amount)}</span>
        <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABELS[t.status]}</Badge>
      </span>
    </Link>
  );
}
