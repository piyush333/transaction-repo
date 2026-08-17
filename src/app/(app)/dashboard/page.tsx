import { IndiaMap, type MapCity, type MapEdge } from "@/components/dashboard/india-map";
import { BalanceByCityChart, ReceivablePayableChart } from "@/components/dashboard/charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { balanceLabel, formatCompactMoney, formatDateTime, STATUS_LABELS, STATUS_TONE, TRANSACTION_TYPE_LABELS } from "@/lib/format";
import { getDashboardSnapshot, getPendingLinkedTransactions } from "@/lib/queries";
import { LinkButton } from "@/components/ui/button";
import Link from "next/link";

export default async function DashboardPage() {
  const [snapshot, pendingShared] = await Promise.all([
    getDashboardSnapshot(),
    getPendingLinkedTransactions(),
  ]);

  const {
    kpis,
    counts,
    cities,
    city_balances: cityBalances,
    city_receivable_payable: cityRP,
    obligations,
    recent_transactions: recentTxns,
    top_parties: topParties,
  } = snapshot;

  // Charts and the map can only show one currency at a time. Default to the
  // one with the most cities — in practice the home currency.
  const currencyCounts = new Map<string, number>();
  for (const c of cities) currencyCounts.set(c.currency, (currencyCounts.get(c.currency) ?? 0) + 1);
  const primaryCurrency =
    [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "INR";
  const chartCityBalances = cityBalances.filter((c) => c.currency === primaryCurrency);
  const multiCurrency = currencyCounts.size > 1;

  // keyed by city+currency, since a city can hold several currencies
  const rpByCity = new Map(cityRP.map((r) => [`${r.city_id}|${r.currency}`, r]));
  const stateByCity = new Map(cities.map((c) => [c.id, c.state]));
  const currencyByCity = new Map(cities.map((c) => [c.id, c.currency]));
  // The map shows each city once, in its OWN currency — a city holding a
  // foreign balance too would otherwise appear twice with mismatched figures.
  const mapCities: MapCity[] = cityBalances
    .filter((c) => c.currency === (currencyByCity.get(c.city_id) ?? c.currency))
    .map((c) => {
      const rp = rpByCity.get(`${c.city_id}|${c.currency}`);
      return {
        id: c.city_id,
        name: c.name,
        code: c.code,
        state: stateByCity.get(c.city_id) ?? null,
        currency: c.currency,
        balance: c.balance,
        receivable: rp?.receivable ?? 0,
        payable: rp?.payable ?? 0,
        volume: c.total_incoming + c.total_outgoing,
      };
    });
  const mapEdges: MapEdge[] = obligations.map((o) => ({
    fromId: o.origin_city_id,
    toId: o.destination_city_id,
    currency: o.currency,
    amount: o.amount,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted">
            Where is my money, and who owes whom.
          </p>
        </div>
        <LinkButton href="/transactions/new">New Transaction</LinkButton>
      </div>

      {pendingShared.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/[0.06] p-4">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {pendingShared.length} shared transaction{pendingShared.length > 1 ? "s" : ""} waiting
            for your confirmation
          </p>
          <div className="mt-2 space-y-1">
            {pendingShared.map((t) => (
              <Link
                key={t.id}
                href={`/transactions/${t.token}`}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-foreground/[0.04]"
              >
                <span className="font-mono text-xs">{t.token}</span>
                <span className="tabular-nums">{formatCompactMoney(t.amount, t.currency)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* One block per currency. Figures are never summed across currencies —
          the app holds no exchange rates, so a combined total would be a
          number we invented. */}
      {kpis.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total Position" value="—" />
          <StatCard label="Receivable" value="—" tone="positive" />
          <StatCard label="Payable" value="—" tone="negative" />
          <StatCard label="Net Position" value="—" />
        </div>
      ) : (
        kpis.map((k) => (
          <div key={k.currency} className="space-y-2">
            {kpis.length > 1 && (
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {k.currency}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatCard
                label="Total Position"
                value={formatCompactMoney(k.total_position, k.currency)}
              />
              <StatCard
                label="Receivable"
                value={formatCompactMoney(k.total_receivable, k.currency)}
                tone="positive"
              />
              <StatCard
                label="Payable"
                value={formatCompactMoney(k.total_payable, k.currency)}
                tone="negative"
              />
              <StatCard
                label="Net Position"
                value={formatCompactMoney(k.net_position, k.currency)}
                tone={k.net_position >= 0 ? "positive" : "negative"}
              />
              <StatCard
                label="Today's Volume"
                value={formatCompactMoney(k.todays_volume, k.currency)}
              />
            </div>
          </div>
        ))
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Pending" value={String(counts?.pending_count ?? 0)} />
        <StatCard label="Cities" value={String(counts?.active_cities ?? 0)} />
        <StatCard label="Active Parties" value={String(counts?.active_parties ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>India Map</CardTitle>
          </CardHeader>
          <CardContent>
            {cities.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                Add a city to see it here.
              </p>
            ) : (
              <IndiaMap cities={mapCities} edges={mapEdges} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="justify-between">
            <CardTitle>Balance by City</CardTitle>
            {multiCurrency && <span className="text-xs text-muted">{primaryCurrency} only</span>}
          </CardHeader>
          <CardContent>
            {chartCityBalances.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No cities yet.</p>
            ) : (
              <BalanceByCityChart
                currency={primaryCurrency}
                data={chartCityBalances.map((c) => ({ name: c.code, balance: c.balance }))}
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="justify-between">
            <CardTitle>Receivable vs Payable</CardTitle>
            {multiCurrency && <span className="text-xs text-muted">{primaryCurrency} only</span>}
          </CardHeader>
          <CardContent>
            {chartCityBalances.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">No cities yet.</p>
            ) : (
              <ReceivablePayableChart
                currency={primaryCurrency}
                data={chartCityBalances.map((c) => {
                  const rp = rpByCity.get(`${c.city_id}|${c.currency}`);
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
            <Link href="/parties" className="text-xs font-medium text-muted hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {topParties.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">No parties yet.</p>
            )}
            {topParties.map((p) => {
              const bl = balanceLabel(p.balance);
              return (
                <Link
                  key={p.party_id}
                  href={`/parties/${p.party_id}`}
                  className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-foreground/[0.04]"
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm tabular-nums">{formatCompactMoney(bl.amount, p.currency)}</span>
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
            <Link href="/transactions" className="text-xs font-medium text-muted hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentTxns.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">No transactions yet.</p>
            )}
            {recentTxns.map((t) => (
              <Link
                key={t.id}
                href={`/transactions/${t.token}`}
                className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-foreground/[0.04]"
              >
                <span>
                  <span className="block font-mono text-xs">{t.token}</span>
                  <span className="text-xs text-muted">
                    {TRANSACTION_TYPE_LABELS[t.transaction_type]} · {formatDateTime(t.created_at)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm tabular-nums">{formatCompactMoney(t.amount, t.currency)}</span>
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
