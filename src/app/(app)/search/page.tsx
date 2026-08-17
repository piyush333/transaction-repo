import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { balanceLabel, formatCompactMoney, formatDateTime, STATUS_LABELS, STATUS_TONE, TRANSACTION_TYPE_LABELS } from "@/lib/format";
import { getPartyBalances, searchAll } from "@/lib/queries";
import Link from "next/link";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  if (!q) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-bold">Search</h1>
        <p className="text-sm text-muted">
          Use the search bar above to find a token, party, city, phone number, or amount.
        </p>
      </div>
    );
  }

  const [results, partyBalances] = await Promise.all([searchAll(q), getPartyBalances()]);
  const balanceById = new Map(partyBalances.map((b) => [b.party_id, b]));
  const totalResults = results.transactions.length + results.parties.length + results.cities.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Search results for &ldquo;{q}&rdquo;</h1>
        <p className="text-sm text-muted">{totalResults} result(s)</p>
      </div>

      {results.transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tokens & Transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.transactions.map((t) => (
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
                  <span className="text-sm tabular-nums">{formatCompactMoney(t.amount)}</span>
                  <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {results.parties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Parties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.parties.map((p) => {
              const bl = balanceLabel(balanceById.get(p.id)?.balance ?? 0);
              return (
                <Link
                  key={p.id}
                  href={`/parties/${p.id}`}
                  className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-foreground/[0.04]"
                >
                  <span>
                    <span className="block text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-muted">{p.phone}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm tabular-nums">{formatCompactMoney(bl.amount)}</span>
                    <Badge tone={bl.tone}>{bl.label}</Badge>
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      {results.cities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.cities.map((c) => (
              <Link
                key={c.id}
                href={`/cities/${c.id}`}
                className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-foreground/[0.04]"
              >
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted">{c.code}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {totalResults === 0 && (
        <Card className="p-10 text-center text-sm text-muted">
          Nothing matched &ldquo;{q}&rdquo;.
        </Card>
      )}
    </div>
  );
}
