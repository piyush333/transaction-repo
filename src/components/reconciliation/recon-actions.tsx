"use client";

import { Button } from "@/components/ui/button";
import {
  cancelDeleteRequestAction,
  confirmDeleteTransactionAction,
  updateTransactionStatusAction,
} from "@/lib/actions";
import type { ReconciliationCategory } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Inline resolution for one reconciliation row. Only categories with a
 * single unambiguous next step get buttons here — `broken_pair` and
 * `disputed` need a human to decide what actually happened, so those rows
 * just link through to the transaction.
 */
export function ReconActions({
  transactionId,
  category,
}: {
  transactionId: string;
  category: ReconciliationCategory;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      // Stay on the page — the row should just disappear from its section.
      else router.refresh();
    });
  }

  const buttons = (() => {
    switch (category) {
      // Reject, not dispute. `disputed` counts toward balances (see
      // confirmed_entries) because a disputed transaction still happened —
      // that is right for something already confirmed, and wrong for a
      // mirrored entry you never accepted. `cancelled` keeps it out.
      case "awaiting_you":
        return (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => updateTransactionStatusAction(transactionId, "confirmed"))}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => updateTransactionStatusAction(transactionId, "cancelled"))}
            >
              Reject
            </Button>
          </>
        );
      case "delete_awaiting_you":
        return (
          <>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => confirmDeleteTransactionAction(transactionId))}
            >
              Approve deletion
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => cancelDeleteRequestAction(transactionId))}
            >
              Reject
            </Button>
          </>
        );
      case "delete_awaiting_them":
        return (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => cancelDeleteRequestAction(transactionId))}
          >
            Withdraw request
          </Button>
        );
      case "stale_pending":
        return (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => updateTransactionStatusAction(transactionId, "confirmed"))}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => updateTransactionStatusAction(transactionId, "cancelled"))}
            >
              Cancel it
            </Button>
          </>
        );
      default:
        return null;
    }
  })();

  if (!buttons) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {buttons}
      {error && <p className="w-full text-right text-xs text-rose-600">{error}</p>}
    </div>
  );
}
