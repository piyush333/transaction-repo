import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCompactMoney, formatDateTime } from "@/lib/format";
import { getCities, getReconciliationFlags } from "@/lib/queries";
import Link from "next/link";

const RECON_TONE: Record<string, "positive" | "warning" | "negative"> = {
  matched: "positive",
  pending: "warning",
  discrepancy: "negative",
};

const RECON_ICON: Record<string, string> = {
  matched: "🟢",
  pending: "🟡",
  discrepancy: "🔴",
};

export default async function ReconciliationPage() {
  const [flags, cities] = await Promise.all([getReconciliationFlags(), getCities()]);
  const cityById = new Map(cities.map((c) => [c.id, c]));

  const byStatus = {
    discrepancy: flags.filter((f) => f.reconciliation_status === "discrepancy"),
    pending: flags.filter((f) => f.reconciliation_status === "pending"),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Reconciliation</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Unmatched transactions, pending settlements, and discrepancies — surfaced automatically.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl">🔴</p>
          <p className="mt-1 text-lg font-semibold">{byStatus.discrepancy.length}</p>
          <p className="text-xs text-zinc-500">Discrepancies</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl">🟡</p>
          <p className="mt-1 text-lg font-semibold">{byStatus.pending.length}</p>
          <p className="text-xs text-zinc-500">Pending</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl">🟢</p>
          <p className="mt-1 text-lg font-semibold">
            {flags.length - byStatus.discrepancy.length - byStatus.pending.length}
          </p>
          <p className="text-xs text-zinc-500">Matched</p>
        </Card>
      </div>

      {flags.length === 0 ? (
        <Card className="p-10 text-center text-sm text-zinc-500">
          Nothing needs reconciliation right now.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 text-left text-xs uppercase text-zinc-500 dark:border-white/10">
              <tr>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr
                  key={f.transaction_id}
                  className="border-b border-black/5 last:border-0 hover:bg-zinc-50 dark:border-white/5 dark:hover:bg-zinc-800/40"
                >
                  <td className="px-4 py-3">
                    <Badge tone={RECON_TONE[f.reconciliation_status]}>
                      {RECON_ICON[f.reconciliation_status]} {f.reconciliation_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/transactions/${f.token}`} className="font-mono text-xs hover:underline">
                      {f.token}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {cityById.get(f.origin_city_id)?.code ?? "—"}
                    {f.destination_city_id ? ` → ${cityById.get(f.destination_city_id)?.code ?? ""}` : ""}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatCompactMoney(f.amount)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{formatDateTime(f.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
