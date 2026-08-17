"use client";

import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { updatePartyAction, type ActionState } from "@/lib/actions";
import type { Party, Profile } from "@/lib/types";
import { useActionState } from "react";

export function EditPartyForm({
  party,
  otherProfiles = [],
}: {
  party: Party;
  otherProfiles?: Profile[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updatePartyAction, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={party.id} />

      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={party.name} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={party.phone ?? ""} />
        </div>
        <div>
          <Label htmlFor="party_type">Type</Label>
          <Select id="party_type" name="party_type" defaultValue={party.party_type}>
            <option value="person">Person</option>
            <option value="business">Business</option>
            <option value="agent">Agent</option>
            <option value="internal">Internal account</option>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="opening_balance">Opening Balance</Label>
        <Input
          id="opening_balance"
          name="opening_balance"
          type="number"
          step="0.01"
          defaultValue={party.opening_balance}
        />
        <p className="mt-1 text-xs text-muted">
          Positive = party already owes you. Negative = you already owe the party.
        </p>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={party.notes ?? ""} />
      </div>

      {otherProfiles.length > 0 && (
        <div className="rounded-lg border border-dashed border-border p-4">
          <Label htmlFor="linked_profile_id">Link to a person on this platform</Label>
          <Select
            id="linked_profile_id"
            name="linked_profile_id"
            defaultValue={party.linked_profile_id ?? ""}
          >
            <option value="">Not linked — an ordinary party</option>
            {otherProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-muted">
            Linking lets you share transactions with them. They must add you as a linked contact
            too. Unlinking won&apos;t undo transactions already shared.
          </p>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          name="active"
          defaultChecked={party.active}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        <span className="text-sm">Active</span>
      </label>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
