import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteTransaction } from "@/components/transactions/delete-transaction";
import { ReverseTransactionForm } from "@/components/transactions/reverse-transaction-form";
import { SettleTransfer } from "@/components/transactions/settle-transfer";
import { TransactionActions } from "@/components/transactions/transaction-actions";
import {
  formatCompactMoney,
  formatDateTime,
  STATUS_LABELS,
  STATUS_TONE,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/format";
import {
  getAuditLogsForEntity,
  getCityById,
  getCurrentProfile,
  getLinkedTransactionCities,
  getPartyById,
  getProfilesByIds,
  getSettlementsOf,
  getTransactionByToken,
  getTransactionEntries,
} from "@/lib/queries";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const transaction = await getTransactionByToken(token);
  if (!transaction) notFound();

  const [
    entries,
    auditLogs,
    originCity,
    destinationCity,
    party,
    counterparty,
    profile,
    actors,
    settlements,
    linkedCities,
  ] = await Promise.all([
    getTransactionEntries(transaction.id),
    getAuditLogsForEntity("transaction", transaction.id),
    getCityById(transaction.origin_city_id),
    transaction.destination_city_id ? getCityById(transaction.destination_city_id) : null,
    transaction.party_id ? getPartyById(transaction.party_id) : null,
    transaction.counterparty_id ? getPartyById(transaction.counterparty_id) : null,
    getCurrentProfile(),
    getProfilesByIds(
      [transaction.created_by, transaction.approved_by].filter((x): x is string => Boolean(x))
    ),
    getSettlementsOf(transaction.id),
    getLinkedTransactionCities([transaction.linked_transaction_id]),
  ]);

  // Where this transaction landed in the OTHER person's book. Always their
  // city, never yours — a mirror can't post at your own city, since cities
  // are never shared. See getLinkedTransactionCities.
  const linkedCity = transaction.linked_transaction_id
    ? linkedCities.get(transaction.linked_transaction_id) ?? null
    : null;

  const actorById = new Map(actors.map((a) => [a.id, a]));
  // Each person owns their own book, so managing simply means it's yours.
  // A mirrored counter-entry is owned by the recipient, so they can confirm
  // or dispute it independently.
  const canManage = !!profile && profile.id === transaction.owner_id;
  const isLinked = Boolean(transaction.linked_transaction_id);

  // A city_transfer posts both legs at once, so it is never outstanding.
  // A transfer_sent/received posts only at the origin — the destination
  // city's cash does not move until the money lands, which is what
  // settlement records. See the settle_transfer migration.
  const settledAmount = settlements.reduce((sum, s) => sum + Number(s.amount), 0);
  const outstanding = Number(transaction.amount) - settledAmount;
  const isSettleable =
    canManage &&
    (transaction.transaction_type === "transfer_sent" ||
      transaction.transaction_type === "transfer_received") &&
    Boolean(transaction.destination_city_id) &&
    Boolean(transaction.party_id) &&
    ["confirmed", "settled"].includes(transaction.status) &&
    outstanding > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold">{transaction.token}</h1>
          <p className="text-sm text-muted">
            {TRANSACTION_TYPE_LABELS[transaction.transaction_type]} ·{" "}
            {formatDateTime(transaction.created_at)}
          </p>
        </div>
        <Badge tone={STATUS_TONE[transaction.status]} className="text-sm">
          {STATUS_LABELS[transaction.status]}
        </Badge>
      </div>

      <Card className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Amount</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {formatCompactMoney(transaction.amount, transaction.currency)}
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Detail label="Origin City">
              {originCity ? (
                <Link href={`/cities/${originCity.id}`} className="hover:underline">
                  {originCity.name} ({originCity.code})
                </Link>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label="Destination City">
              {destinationCity ? (
                <Link href={`/cities/${destinationCity.id}`} className="hover:underline">
                  {destinationCity.name} ({destinationCity.code})
                </Link>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label="Party">
              {party ? (
                <Link href={`/parties/${party.id}`} className="hover:underline">
                  {party.name}
                </Link>
              ) : (
                "—"
              )}
            </Detail>
            {transaction.linked_transaction_id && (
              <Detail label="Their City">
                {linkedCity ? (
                  <span>
                    {linkedCity.name} ({linkedCity.code})
                    <span className="text-muted"> — their book</span>
                  </span>
                ) : (
                  "—"
                )}
              </Detail>
            )}
            <Detail label="Counterparty">
              {counterparty ? (
                <Link href={`/parties/${counterparty.id}`} className="hover:underline">
                  {counterparty.name}
                </Link>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label="Reference">{transaction.reference || "—"}</Detail>
            <Detail label="Description">{transaction.description || "—"}</Detail>
            <Detail label="Created By">
              {actorById.get(transaction.created_by ?? "")?.full_name ??
                actorById.get(transaction.created_by ?? "")?.email ??
                "—"}
            </Detail>
            <Detail label="Approved By">
              {actorById.get(transaction.approved_by ?? "")?.full_name ??
                actorById.get(transaction.approved_by ?? "")?.email ??
                "—"}
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ledger Entries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-sm">
              <span className="text-muted">
                {e.entry_type === "city_cash" ? "City Cash" : "Party"} · {e.direction}
              </span>
              <span className="tabular-nums">{formatCompactMoney(e.amount, e.currency)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {(transaction.reversed_transaction_id ||
        transaction.settles_transaction_id ||
        transaction.linked_transaction_id ||
        settlements.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Related Transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {transaction.linked_transaction_id && (
              <p>
                Shared transaction — the matching entry in the other person&apos;s book is{" "}
                <RelatedLink id={transaction.linked_transaction_id} />
                {linkedCity && (
                  <>
                    , booked at {linkedCity.name} ({linkedCity.code})
                  </>
                )}
              </p>
            )}
            {transaction.reversed_transaction_id && (
              <p>
                Reversed by a correcting entry — see{" "}
                <RelatedLink id={transaction.reversed_transaction_id} />
              </p>
            )}
            {transaction.settles_transaction_id && (
              <p>
                {transaction.transaction_type === "transfer_sent" ||
                transaction.transaction_type === "transfer_received"
                  ? "Records the arrival of "
                  : "This is a correction of "}
                <RelatedLink id={transaction.settles_transaction_id} />
              </p>
            )}
            {settlements.length > 0 && (
              <div>
                <p className="mb-1">
                  Settled {formatCompactMoney(settledAmount, transaction.currency)} of{" "}
                  {formatCompactMoney(transaction.amount, transaction.currency)}
                  {outstanding > 0
                    ? ` — ${formatCompactMoney(outstanding, transaction.currency)} still in transit`
                    : " — fully arrived"}
                </p>
                <ul className="space-y-0.5">
                  {settlements.map((s) => (
                    <li key={s.id} className="text-xs text-muted">
                      <Link
                        href={`/transactions/${s.token}`}
                        className="font-mono hover:underline"
                      >
                        {s.token}
                      </Link>{" "}
                      · {formatCompactMoney(s.amount, s.currency)} ·{" "}
                      {formatDateTime(s.created_at)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TransactionActions
            transactionId={transaction.id}
            status={transaction.status}
            canManage={canManage}
          />
          {isSettleable && (
            <SettleTransfer
              transactionId={transaction.id}
              outstanding={outstanding}
              currency={transaction.currency}
              destinationCityName={destinationCity?.name ?? "the destination city"}
              partyName={party?.name ?? "the party"}
            />
          )}
          {canManage && transaction.status !== "reversed" && (
            <ReverseTransactionForm transactionId={transaction.id} />
          )}
          {canManage && (
            <DeleteTransaction
              transactionId={transaction.id}
              isLinked={isLinked}
              deleteRequestedByMe={transaction.delete_requested_by === profile?.id}
              deletePending={Boolean(transaction.delete_requested_by)}
              deleteReason={transaction.delete_reason}
            />
          )}
          {!canManage && (
            <p className="text-sm text-muted">
              This is the other person&apos;s side of a shared transaction — they manage it from
              their own book.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modification History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {auditLogs.length === 0 && <p className="text-sm text-muted">No history recorded.</p>}
          {auditLogs.map((log) => (
            <div key={log.id} className="border-l-2 border-border pl-3 text-sm">
              <p className="font-medium">{log.action}</p>
              <p className="text-xs text-muted">{formatDateTime(log.created_at)}</p>
              {log.reason && <p className="mt-1 text-xs text-muted">{log.reason}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

async function RelatedLink({ id }: { id: string }) {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase.from("transactions").select("token").eq("id", id).single();
  if (!data) return <span>—</span>;
  return (
    <Link href={`/transactions/${data.token}`} className="font-mono text-xs hover:underline">
      {data.token}
    </Link>
  );
}
