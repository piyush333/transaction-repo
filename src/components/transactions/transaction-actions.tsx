"use client";

import { Button } from "@/components/ui/button";
import { updateTransactionStatusAction } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function TransactionActions({
  transactionId,
  status,
  canManage,
}: {
  transactionId: string;
  status: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return null;

  function run(next: string) {
    setError(null);
    startTransition(async () => {
      const res = await updateTransactionStatusAction(transactionId, next);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "pending" && (
          <>
            <Button size="sm" disabled={isPending} onClick={() => run("confirmed")}>
              Confirm
            </Button>
            <Button size="sm" variant="secondary" disabled={isPending} onClick={() => run("cancelled")}>
              Cancel
            </Button>
          </>
        )}
        {status === "confirmed" && (
          <Button size="sm" disabled={isPending} onClick={() => run("settled")}>
            Mark Settled
          </Button>
        )}
        {/*
          Not offered on `pending`: disputed entries count toward balances
          (see the confirmed_entries view), so disputing something never
          confirmed would post it into the books instead of holding it out.
          Cancel is the correct action there.
        */}
        {(status === "confirmed" || status === "settled") && (
          <Button size="sm" variant="destructive" disabled={isPending} onClick={() => run("disputed")}>
            Mark Disputed
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
