import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

  const balanceById = new Map(balances.map((b) => [b.city_id, b]));
  const rpById = new Map(rp.map((r) => [r.city_id, r]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Cities</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Every transaction belongs to a city. Balances are computed from the ledger.
          </p>
        </div>
        <LinkButton href="/cities/new">Add City</LinkButton>
      </div>

      {cities.length === 0 ? (
        <Card className="p-10 text-center text-sm text-zinc-500">
          No cities yet. Add your first city to start recording transactions.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((c) => {
            const b = balanceById.get(c.id);
            const r = rpById.get(c.id);
            return (
              <Link key={c.id} href={`/cities/${c.id}`}>
                <Card className="h-full p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {c.code} · {c.state || c.country}
                      </p>
                    </div>
                    {!c.active && <Badge tone="neutral">Inactive</Badge>}
                  </div>
                  <p className="mt-3 text-lg font-semibold tabular-nums">
                    {formatCompactMoney(b?.balance ?? 0)}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Current balance</p>
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Receivable {formatCompactMoney(r?.receivable ?? 0)}
                    </span>
                    <span className="text-rose-600 dark:text-rose-400">
                      Payable {formatCompactMoney(r?.payable ?? 0)}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
