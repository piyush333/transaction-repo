"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import {
  cancelDeleteRequestAction,
  confirmDeleteTransactionAction,
  requestDeleteTransactionAction,
  type ActionState,
} from "@/lib/actions";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

export function DeleteTransaction({
  transactionId,
  isLinked,
  deleteRequestedByMe,
  deletePending,
  deleteReason,
}: {
  transactionId: string;
  isLinked: boolean;
  deleteRequestedByMe: boolean;
  deletePending: boolean;
  deleteReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [state, formAction, submitting] = useActionState<ActionState, FormData>(
    requestDeleteTransactionAction,
    { error: null }
  );

  function run(fn: () => Promise<{ error: string | null }>) {
    setActionError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setActionError(res.error);
      else router.push("/transactions");
    });
  }

  if (deletePending) {
    return (
      <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] p-4">
        <div>
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {deleteRequestedByMe
              ? "You requested this transaction be deleted."
              : "The other person has requested this transaction be deleted."}
          </p>
          {deleteReason && <p className="mt-1 text-xs text-muted">Reason: {deleteReason}</p>}
          <p className="mt-1 text-xs text-muted">
            {deleteRequestedByMe
              ? "Waiting for them to approve. Deleting removes it permanently from both books."
              : "Approving removes it permanently from both books and changes both balances."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!deleteRequestedByMe && (
            <Button
              size="sm"
              variant="destructive"
              disabled={isPending}
              onClick={() => run(() => confirmDeleteTransactionAction(transactionId))}
            >
              Approve deletion
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => run(() => cancelDeleteRequestAction(transactionId))}
          >
            Cancel request
          </Button>
        </div>
        {actionError && <p className="text-sm text-rose-600">{actionError}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        Delete Transaction
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.08] p-4"
    >
      <input type="hidden" name="transaction_id" value={transactionId} />
      <p className="text-sm font-medium text-rose-700 dark:text-rose-400">
        {isLinked
          ? "This is a shared transaction — the other person must approve before it is removed from both books."
          : "This permanently removes the transaction and its ledger entries. Balances will change and it cannot be undone."}
      </p>
      <Textarea name="reason" placeholder="Reason for deleting (required)" required rows={2} />
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={submitting}>
          {submitting ? "Working..." : isLinked ? "Request Deletion" : "Delete Permanently"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
