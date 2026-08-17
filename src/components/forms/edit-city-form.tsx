"use client";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { updateCityAction, type ActionState } from "@/lib/actions";
import type { City } from "@/lib/types";
import { useActionState } from "react";

export function EditCityForm({ city }: { city: City }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateCityAction, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={city.id} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="code">City Code</Label>
          <Input id="code" name="code" defaultValue={city.code} maxLength={6} required />
        </div>
        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" name="currency" defaultValue={city.currency} required />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted">
        Changing the code only affects tokens generated from now on — tokens already issued keep
        the code they were created with.
      </p>

      <div>
        <Label htmlFor="name">City Name</Label>
        <Input id="name" name="name" defaultValue={city.name} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="state">State / Region</Label>
          <Input id="state" name="state" defaultValue={city.state ?? ""} />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" defaultValue={city.country} />
        </div>
      </div>

      <div>
        <Label htmlFor="opening_balance">Opening Balance</Label>
        <Input
          id="opening_balance"
          name="opening_balance"
          type="number"
          step="0.01"
          defaultValue={city.opening_balance}
        />
        <p className="mt-1 text-xs text-muted">
          Changing this shifts the city&apos;s current balance by the same amount.
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          name="active"
          defaultChecked={city.active}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        <span className="text-sm">Active — inactive cities can&apos;t take new transactions</span>
      </label>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
