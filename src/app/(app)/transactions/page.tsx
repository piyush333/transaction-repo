import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import {
  formatCompactMoney,
  formatDateTime,
  STATUS_LABELS,
  STATUS_TONE,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/format";
import { getCities, getTransactions } from "@/lib/queries";
import Link from "next/link";
import { cn } from "@/lib/cn";

const STATUSES = ["pending", "confirmed", "settled", "disputed", "reversed", "cancelled"];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; city?: string }>;
}) {
  const params = await searchParams;
  const [transactions, cities] = await Promise.all([
    getTransactions({ status: params.status, cityId: params.city }),
    getCities(),
  ]);
  const cityById = new Map(cities.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Transactions</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Every token, from draft to settled.
          </p>
        </div>
        <LinkButton href="/transactions/new">New Transaction</LinkButton>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterLink label="All" active={!params.status} href="/transactions" />
        {STATUSES.map((s) => (
          <FilterLink
            key={s}
            label={STATUS_LABELS[s]}
            active={params.status === s}
            href={`/transactions?status=${s}`}
          />
        ))}
      </div>

      {transactions.length === 0 ? (
        <Card className="p-10 text-center text-sm text-zinc-500">No transactions found.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 text-left text-xs uppercase text-zinc-500 dark:border-white/10">
              <tr>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-black/5 last:border-0 hover:bg-zinc-50 dark:border-white/5 dark:hover:bg-zinc-800/40"
                >
                  <td className="px-4 py-3">
                    <Link href={`/transactions/${t.token}`} className="font-mono text-xs hover:underline">
                      {t.token}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {TRANSACTION_TYPE_LABELS[t.transaction_type]}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {cityById.get(t.origin_city_id)?.code ?? "—"}
                    {t.destination_city_id ? ` → ${cityById.get(t.destination_city_id)?.code ?? ""}` : ""}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatCompactMoney(t.amount)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{formatDateTime(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function FilterLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium",
        active
          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
      )}
    >
      {label}
    </Link>
  );
}
