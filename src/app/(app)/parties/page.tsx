import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { balanceLabel, formatCompactMoney, formatDateTime } from "@/lib/format";
import { getCities, getPartyBalances, getParties } from "@/lib/queries";
import Link from "next/link";

export default async function PartiesPage() {
  const [parties, balances, cities] = await Promise.all([
    getParties(),
    getPartyBalances(),
    getCities(),
  ]);

  const balanceById = new Map(balances.map((b) => [b.party_id, b]));
  const cityById = new Map(cities.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Parties</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Every person, business, or agent has an individual ledger.
          </p>
        </div>
        <LinkButton href="/parties/new">Add Party</LinkButton>
      </div>

      {parties.length === 0 ? (
        <Card className="p-10 text-center text-sm text-zinc-500">
          No parties yet. Add your first party to start recording transactions.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 text-left text-xs uppercase text-zinc-500 dark:border-white/10">
              <tr>
                <th className="px-4 py-3 font-medium">Party</th>
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium">Balance</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last Transaction</th>
              </tr>
            </thead>
            <tbody>
              {parties.map((p) => {
                const bal = balanceById.get(p.id);
                const bl = balanceLabel(bal?.balance ?? 0);
                const city = cityById.get(p.primary_city_id);
                return (
                  <tr
                    key={p.id}
                    className="border-b border-black/5 last:border-0 hover:bg-zinc-50 dark:border-white/5 dark:hover:bg-zinc-800/40"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/parties/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-xs text-zinc-500">{p.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {city?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatCompactMoney(bl.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={bl.tone}>{bl.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {bal?.last_transaction_at ? formatDateTime(bal.last_transaction_at) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
