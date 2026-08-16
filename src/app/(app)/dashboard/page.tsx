import { IndiaMap, type MapCity, type MapEdge } from "@/components/dashboard/india-map";
import { BalanceByCityChart, ReceivablePayableChart } from "@/components/dashboard/charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { balanceLabel, formatCompactMoney, formatDateTime, STATUS_LABELS, STATUS_TONE, TRANSACTION_TYPE_LABELS } from "@/lib/format";
import {
  getCities,
  getCityBalances,
  getCityReceivablePayable,
  getCityToCityObligations,
  getDashboardKpis,
  getPartyExposure,
  getRecentTransactions,
} from "@/lib/queries";
import { LinkButton } from "@/components/ui/button";
import Link from "next/link";

export default async function DashboardPage() {
  const [kpis, cities, cityBalances, cityRP, obligations, recentTxns, topParties] = await Promise.all([
    getDashboardKpis(),
    getCities(),
    getCityBalances(),
    getCityReceivablePayable(),
    getCityToCityObligations(),
    getRecentTransactions(8),
    getPartyExposure(8),
  ]);

  const rpByCity = new Map(cityRP.map((r) => [r.city_id, r]));
  const mapCities: MapCity[] = cityBalances.map((c) => {
    const rp = rpByCity.get(c.city_id);
    return {
      id: c.city_id,
      name: c.name,
      code: c.code,
      balance: c.balance,
      receivable: rp?.receivable ?? 0,
      payable: rp?.payable ?? 0,
      volume: c.total_incoming + c.total_outgoing,
    };
  });
  const mapEdges: MapEdge[] = obligations.map((o) => ({
    fromId: o.origin_city_id,
    toId: o.destination_city_id,
    amount: o.amount,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Where is my money, and who owes whom.
          </p>
        </div>
        <LinkButton href="/transactions/new">New Transaction</LinkButton>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Position" value={formatCompactMoney(kpis?.total_position ?? 0)} />
        <StatCard
          label="Receivable"
          value={formatCompactMoney(kpis?.total_receivable ?? 0)}
          tone="positive"
        />
        <StatCard
          label="Payable"
          value={formatCompactMoney(kpis?.total_payable ?? 0)}
          tone="negative"
        />
        <StatCard
          label="Net Position"
          value={formatCompactMoney(kpis?.net_position ?? 0)}
          tone={(kpis?.net_position ?? 0) >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Today's Volume" value={formatCompactMoney(kpis?.todays_volume ?? 0)} />
        <StatCard label="Pending" value={String(kpis?.pending_count ?? 0)} />
        <StatCard label="Cities" value={String(kpis?.active_cities ?? 0)} />
        <StatCard label="Active Parties" value={String(kpis?.active_parties ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>India Map</CardTitle>
          </CardHeader>
          <CardContent>
            {cities.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                Add a city to see it here.
              </p>
            ) : (
              <IndiaMap cities={mapCities} edges={mapEdges} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Balance by City</CardTitle>
          </CardHeader>
          <CardContent>
            {cityBalances.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">No cities yet.</p>
            ) : (
              <BalanceByCityChart
                data={cityBalances.map((c) => ({ name: c.code, balance: c.balance }))}
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Receivable vs Payable</CardTitle>
          </CardHeader>
          <CardContent>
            {cityBalances.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">No cities yet.</p>
            ) : (
              <ReceivablePayableChart
                data={cityBalances.map((c) => {
                  const rp = rpByCity.get(c.city_id);
                  return { name: c.code, receivable: rp?.receivable ?? 0, payable: rp?.payable ?? 0 };
                })}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Top Outstanding Parties</CardTitle>
            <Link href="/parties" className="text-xs font-medium text-zinc-500 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {topParties.length === 0 && (
              <p className="py-6 text-center text-sm text-zinc-500">No parties yet.</p>
            )}
            {topParties.map((p) => {
              const bl = balanceLabel(p.balance);
              return (
                <Link
                  key={p.party_id}
                  href={`/parties/${p.party_id}`}
                  className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <span className="text-sm font-medium">{p.name}</span>
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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Tokens</CardTitle>
            <Link href="/transactions" className="text-xs font-medium text-zinc-500 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentTxns.length === 0 && (
              <p className="py-6 text-center text-sm text-zinc-500">No transactions yet.</p>
            )}
            {recentTxns.map((t) => (
              <Link
                key={t.id}
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
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
