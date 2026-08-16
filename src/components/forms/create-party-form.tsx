"use client";

import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { createPartyAction, type ActionState } from "@/lib/actions";
import type { City } from "@/lib/types";
import { useActionState } from "react";

export function CreatePartyForm({ cities }: { cities: City[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPartyAction, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" placeholder="Ahmed" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" placeholder="+91 90000 00000" />
        </div>
        <div>
          <Label htmlFor="party_type">Type</Label>
          <Select id="party_type" name="party_type" defaultValue="person">
            <option value="person">Person</option>
            <option value="business">Business</option>
            <option value="agent">Agent</option>
            <option value="internal">Internal account</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="primary_city_id">Primary City</Label>
        <Select id="primary_city_id" name="primary_city_id" required defaultValue="">
          <option value="" disabled>
            Select a city
          </option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="opening_balance">Opening Balance</Label>
        <Input id="opening_balance" name="opening_balance" type="number" step="0.01" defaultValue={0} />
        <p className="mt-1 text-xs text-zinc-500">
          Positive = party already owes you. Negative = you already owe the party.
        </p>
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} />
      </div>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving..." : "Create Party"}
      </Button>
    </form>
  );
}
