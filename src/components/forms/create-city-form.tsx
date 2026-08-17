"use client";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { createCityAction, type ActionState } from "@/lib/actions";
import { useActionState } from "react";

export function CreateCityForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCityAction, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="code">City Code</Label>
          <Input id="code" name="code" placeholder="NMC" maxLength={6} required />
        </div>
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" name="currency" defaultValue="INR" required />
        </div>
      </div>
      <div>
        <Label htmlFor="name">City Name</Label>
        <Input id="name" name="name" placeholder="Neemuch" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="state">State / Region</Label>
          <Input id="state" name="state" placeholder="Madhya Pradesh" />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" defaultValue="India" />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted">
        Indian states are placed on the dashboard map automatically; cities outside India still
        appear everywhere else in the ledger.
      </p>
      <div>
        <Label htmlFor="opening_balance">Opening Balance</Label>
        <Input id="opening_balance" name="opening_balance" type="number" step="0.01" defaultValue={0} />
      </div>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving..." : "Create City"}
      </Button>
    </form>
  );
}
