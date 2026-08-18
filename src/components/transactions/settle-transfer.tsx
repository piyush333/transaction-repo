"use client";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { settleTransferAction } from "@/lib/actions";
import { formatCompactMoney } from "@/lib/format";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * A transfer_sent only posts at the origin — the destination city's cash
 * does not move until the money actually lands. This records the landing.
 * Cash of this kind often travels in tranches, so partial settlement is
 * supported and `outstanding` is what is still in transit.
 */
export function SettleTransfer({
  transactionId,
  outstanding,
  currency,
  destinationCityName,
  partyName,
}: {
  transactionId: string;
  outstanding: number;
  currency: string;
  destinationCityName: string;
  partyName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  function settle(value?: number) {
    setError(null);
    startTransition(async () => {
      const res = await settleTransferAction(transactionId, value, description || undefined);
      if (res.error) setError(res.error);
      else {
        setOpen(false);
        setAmount("");
        setDescription("");
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => settle()}>
            Mark {formatCompactMoney(outstanding, currency)} as arrived
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setOpen(true)}>
            Part of it arrived
          </Button>
        </div>
        <p className="text-xs text-muted">
          Posts the arrival at {destinationCityName} against {partyName}, in {currency}. Nothing is
          converted.
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    );
  }

  const parsed = Number(amount);
  const invalid = !amount || Number.isNaN(parsed) || parsed <= 0 || parsed > outstanding;

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <Label>How much arrived at {destinationCityName}?</Label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          max={outstanding}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={String(outstanding)}
        />
        <p className="mt-1 text-xs text-muted">
          {formatCompactMoney(outstanding, currency)} still in transit. Recorded in {currency} — the
          app never converts.
        </p>
      </div>
      <div>
        <Label>Note (optional)</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. first tranche, collected by hand"
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || invalid} onClick={() => settle(parsed)}>
          {pending ? "Recording..." : "Record arrival"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
