import { ReconActions } from "@/components/reconciliation/recon-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCompactMoney, formatDateTime } from "@/lib/format";
import { getCities, getParties, getReconciliationFlags } from "@/lib/queries";
import type { ReconciliationCategory, ReconciliationFlag } from "@/lib/types";
import Link from "next/link";

const CATEGORY_META: Record<
  ReconciliationCategory,
  { label: string; tone: "positive" | "warning" | "negative" | "neutral"; hint: string }
> = {
  delete_awaiting_you: {
    label: "Delete requested",
    tone: "negative",
    hint: "They want this removed from both books. Approving is permanent.",
  },
  awaiting_you: {
    label: "Confirm this",
    tone: "warning",
    hint: "They recorded this against you. It stays out of your balances until you confirm — rejecting keeps it out for good.",
  },
  disputed: {
    label: "Disputed",
    tone: "negative",
    hint: "One side flagged this. Sort it out, then re-confirm or reverse it.",
  },
  broken_pair: {
    label: "Books disagree",
    tone: "negative",
    hint: "One side was reversed or cancelled and the other was not — the two books no longer match on this amount.",
  },
  delete_awaiting_them: {
    label: "Delete pending",
    tone: "warning",
    hint: "You asked for this to be deleted. Waiting on their approval.",
  },
  awaiting_them: {
    label: "Waiting on them",
    tone: "warning",
    hint: "Your side is confirmed. Theirs is still pending, so their balance has not moved yet.",
  },
  stale_pending: {
    label: "Pending 7+ days",
    tone: "warning",
    hint: "A private transaction that has sat unconfirmed for over a week.",
  },
  unsettled_transfer: {
    label: "Unsettled transfer",
    tone: "warning",
    hint: "Cash left the origin city. The destination city's books do not move until you record it arriving.",
  },
  matched: {
    label: "Matched",
    tone: "positive",
    hint: "Both books agree.",
  },
};

const SECTIONS: {
  key: string;
  title: string;
  blurb: string;
  categories: ReconciliationCategory[];
  emptyText: string;
}[] = [
  {
    key: "you",
    title: "Needs your action",
    blurb: "Nothing here moves until you decide.",
    categories: ["delete_awaiting_you", "awaiting_you"],
    emptyText: "Nothing is waiting on you.",
  },
  {
    key: "mismatch",
    title: "Mismatches",
    blurb: "The two books do not agree. These need a conversation, not a button.",
    categories: ["disputed", "broken_pair"],
    emptyText: "Both books agree on everything shared.",
  },
  {
    key: "them",
    title: "Waiting on the other side",
    blurb: "Your side is done. Nudge them if it has been a while.",
    categories: ["awaiting_them", "delete_awaiting_them"],
    emptyText: "Nothing is waiting on them.",
  },
  {
    key: "housekeeping",
    title: "Housekeeping",
    blurb: "Your own book only — these never touched anyone else.",
    categories: ["stale_pending", "unsettled_transfer"],
    emptyText: "Your own book is tidy.",
  },
];

export default async function ReconciliationPage() {
  const [flags, cities, parties] = await Promise.all([
    getReconciliationFlags(),
    getCities(),
    getParties(),
  ]);

  const cityById = new Map(cities.map((c) => [c.id, c]));
  const partyById = new Map(parties.map((p) => [p.id, p]));

  const byCategory = (cats: ReconciliationCategory[]) =>
    flags.filter((f) => cats.includes(f.category));

  // Counts only, never a summed amount: these rows mix currencies and the
  // app does not convert, so "total at risk" would be a meaningless number.
  const needsYou = byCategory(["delete_awaiting_you", "awaiting_you"]).length;
  const mismatches = byCategory(["disputed", "broken_pair"]).length;
  const waitingThem = byCategory(["awaiting_them", "delete_awaiting_them"]).length;
  const matched = flags.filter((f) => f.category === "matched").length;

  const tiles = [
    { label: "Needs you", value: needsYou, tone: needsYou > 0 ? "warning" : "neutral" },
    { label: "Mismatches", value: mismatches, tone: mismatches > 0 ? "negative" : "neutral" },
    { label: "Waiting on them", value: waitingThem, tone: "neutral" },
    { label: "Matched", value: matched, tone: matched > 0 ? "positive" : "neutral" },
  ] as const;

  const TILE_COLOR: Record<string, string> = {
    warning: "text-amber-600 dark:text-amber-400",
    negative: "text-rose-600 dark:text-rose-400",
    positive: "text-emerald-600 dark:text-emerald-400",
    neutral: "text-foreground",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Reconciliation</h1>
        <p className="text-sm text-muted">
          Everything where the two books do not yet agree, grouped by who has to act.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <p className={`text-2xl font-semibold tabular-nums ${TILE_COLOR[t.tone]}`}>{t.value}</p>
            <p className="mt-0.5 text-xs text-muted">{t.label}</p>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted">
        Counts, not totals — these rows mix currencies and nothing is ever converted. Matched
        transactions are counted but not listed; there is nothing to do with them.
      </p>

      {SECTIONS.map((section) => {
        const rows = byCategory(section.categories);
        return (
          <div key={section.key} className="space-y-2">
            <div>
              <h2 className="text-sm font-semibold">
                {section.title}
                {rows.length > 0 && <span className="ml-2 text-muted">({rows.length})</span>}
              </h2>
              <p className="text-xs text-muted">{section.blurb}</p>
            </div>

            {rows.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted">{section.emptyText}</Card>
            ) : (
              <Card className="divide-y divide-border">
                {rows.map((f) => (
                  <ReconRow
                    key={f.transaction_id}
                    flag={f}
                    cityCode={cityById.get(f.origin_city_id)?.code ?? "—"}
                    destinationCode={
                      f.destination_city_id
                        ? cityById.get(f.destination_city_id)?.code ?? null
                        : null
                    }
                    partyName={f.party_id ? partyById.get(f.party_id)?.name ?? null : null}
                  />
                ))}
              </Card>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReconRow({
  flag,
  cityCode,
  destinationCode,
  partyName,
}: {
  flag: ReconciliationFlag;
  cityCode: string;
  destinationCode: string | null;
  partyName: string | null;
}) {
  const meta = CATEGORY_META[flag.category];
  const settled = Number(flag.settled_amount ?? 0);
  const outstanding = Number(flag.amount) - settled;

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <Link
            href={`/transactions/${flag.token}`}
            className="font-mono text-xs text-muted hover:text-foreground hover:underline"
          >
            {flag.token}
          </Link>
        </div>

        <p className="text-sm">
          <span className="font-semibold tabular-nums">
            {formatCompactMoney(flag.amount, flag.currency)}
          </span>
          <span className="text-muted">
            {" · "}
            {cityCode}
            {destinationCode ? ` → ${destinationCode}` : ""}
            {partyName ? ` · ${partyName}` : ""}
          </span>
        </p>

        <p className="text-xs text-muted">{meta.hint}</p>
        {flag.category === "unsettled_transfer" && settled > 0 && (
          <p className="text-xs text-muted">
            {formatCompactMoney(settled, flag.currency)} already arrived ·{" "}
            {formatCompactMoney(outstanding, flag.currency)} still in transit
          </p>
        )}
        {flag.delete_reason && (
          <p className="text-xs text-muted">Reason given: {flag.delete_reason}</p>
        )}
        <p className="text-xs text-muted">{formatDateTime(flag.created_at)}</p>
      </div>

      <div className="shrink-0 sm:pl-4">
        <ReconActions
          transactionId={flag.transaction_id}
          category={flag.category}
          token={flag.token}
          outstanding={outstanding}
          currency={flag.currency}
        />
      </div>
    </div>
  );
}
