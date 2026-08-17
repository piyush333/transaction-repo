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
          <p className="text-sm text-muted">
            Every person, business, or agent has an individual ledger.
          </p>
        </div>
        <LinkButton href="/parties/new">Add Party</LinkButton>
      </div>

      {parties.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          No parties yet. Add your first party to start recording transactions.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted">
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
                    className="border-b border-border/70 last:border-0 hover:bg-foreground/[0.03] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/parties/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-xs text-muted">{p.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-foreground/80">
                      {city?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatCompactMoney(bl.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={bl.tone}>{bl.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
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
