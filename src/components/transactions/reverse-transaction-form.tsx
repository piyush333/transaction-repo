"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { reverseTransactionAction, type ActionState } from "@/lib/actions";
import { useActionState, useState } from "react";

export function ReverseTransactionForm({ transactionId }: { transactionId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    reverseTransactionAction,
    { error: null }
  );

  if (!open) {
    return (
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
        Reverse Transaction
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
      <input type="hidden" name="transaction_id" value={transactionId} />
      <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
        This posts an equal-and-opposite correcting entry. The original token is never deleted.
      </p>
      <Textarea name="reason" placeholder="Reason for reversal (required)" required rows={2} />
      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pending}>
          {pending ? "Reversing..." : "Confirm Reversal"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
