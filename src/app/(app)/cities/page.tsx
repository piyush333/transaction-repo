import { Badge } from "@/components/ui/badge";
import { Card, InteractiveCard } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { formatCompactMoney } from "@/lib/format";
import { getCities, getCityBalances, getCityReceivablePayable } from "@/lib/queries";
import Link from "next/link";

export default async function CitiesPage() {
  const [cities, balances, rp] = await Promise.all([
    getCities(),
    getCityBalances(),
    getCityReceivablePayable(),
  ]);

  // A city can hold several currencies, so group rather than index by id.
  const balancesByCity = new Map<string, typeof balances>();
  for (const b of balances) balancesByCity.set(b.city_id, [...(balancesByCity.get(b.city_id) ?? []), b]);
  const rpById = new Map(rp.map((r) => [`${r.city_id}|${r.currency}`, r]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Cities</h1>
          <p className="text-sm text-muted">
            Every transaction belongs to a city. Balances are computed from the ledger.
          </p>
        </div>
        <LinkButton href="/cities/new">Add City</LinkButton>
      </div>

      {cities.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          No cities yet. Add your first city to start recording transactions.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((c) => {
            // Show the city's own currency first; any foreign holdings follow.
            const rows = (balancesByCity.get(c.id) ?? []).sort((x, y) =>
              x.currency === c.currency ? -1 : y.currency === c.currency ? 1 : 0
            );
            const primary = rows[0];
            const extra = rows.slice(1).filter((r2) => r2.balance !== 0);
            const r = rpById.get(`${c.id}|${primary?.currency ?? c.currency}`);
            return (
              <Link key={c.id} href={`/cities/${c.id}`}>
                <InteractiveCard className="h-full p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-muted">
                        {c.code} · {c.state || c.country}
                      </p>
                    </div>
                    {!c.active && <Badge tone="neutral">Inactive</Badge>}
                  </div>
                  <p className="mt-3 text-lg font-semibold tabular-nums">
                    {formatCompactMoney(primary?.balance ?? 0, primary?.currency ?? c.currency)}
                  </p>
                  <p className="text-xs text-muted">Current balance</p>
                  {extra.length > 0 && (
                    <p className="mt-1 text-xs text-muted">
                      also holds{" "}
                      {extra
                        .map((e) => formatCompactMoney(e.balance, e.currency))
                        .join(", ")}
                    </p>
                  )}
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Receivable{" "}
                      {formatCompactMoney(r?.receivable ?? 0, primary?.currency ?? c.currency)}
                    </span>
                    <span className="text-rose-600 dark:text-rose-400">
                      Payable{" "}
                      {formatCompactMoney(r?.payable ?? 0, primary?.currency ?? c.currency)}
                    </span>
                  </div>
                </InteractiveCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
