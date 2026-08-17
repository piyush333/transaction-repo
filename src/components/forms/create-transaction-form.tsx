"use client";

import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { createTransactionAction, type ActionState } from "@/lib/actions";
import { TRANSACTION_TYPE_LABELS } from "@/lib/format";
import type { City, Party } from "@/lib/types";
import { useActionState, useMemo, useState } from "react";

const TYPE_GROUPS = [
  {
    label: "Money In",
    options: ["receipt", "collection", "settlement_received", "transfer_received", "adjustment_credit"],
  },
  {
    label: "Money Out",
    options: ["payment", "settlement_paid", "transfer_sent", "adjustment_debit"],
  },
  {
    label: "Internal",
    options: ["city_transfer", "party_transfer", "reconciliation_adjustment"],
  },
];

const NEEDS_PARTY = new Set([
  "receipt",
  "collection",
  "settlement_received",
  "transfer_received",
  "adjustment_credit",
  "payment",
  "settlement_paid",
  "transfer_sent",
  "adjustment_debit",
  "party_transfer",
  "reconciliation_adjustment",
]);
const NEEDS_DESTINATION_CITY = new Set(["city_transfer", "transfer_sent", "transfer_received"]);
const NEEDS_COUNTERPARTY = new Set(["party_transfer"]);

export function CreateTransactionForm({ cities, parties }: { cities: City[]; parties: Party[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createTransactionAction,
    { error: null }
  );
  const [transactionType, setTransactionType] = useState("receipt");
  const [originCityId, setOriginCityId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [currency, setCurrency] = useState("");

  // The transaction takes the city's currency unless deliberately overridden
  // — needed when money physically moves across a border (e.g. carrying INR
  // into Dubai). The app never converts; it records what actually happened.
  const originCity = cities.find((c) => c.id === originCityId);
  const effectiveCurrency = currency || originCity?.currency || "INR";
  const currencyOptions = [...new Set([...cities.map((c) => c.currency), "INR"])].sort();

  const needsParty = NEEDS_PARTY.has(transactionType);
  const needsDestination = NEEDS_DESTINATION_CITY.has(transactionType);
  const needsCounterparty = NEEDS_COUNTERPARTY.has(transactionType);

  const partiesInOriginCity = useMemo(
    () => (originCityId ? parties.filter((p) => p.primary_city_id === originCityId) : parties),
    [parties, originCityId]
  );

  // Sharing only makes sense for a plain money-in/money-out against someone
  // who is actually another user of the app.
  const selectedParty = parties.find((p) => p.id === partyId);
  const canShare =
    Boolean(selectedParty?.linked_profile_id) &&
    !needsDestination &&
    !needsCounterparty &&
    transactionType !== "reconciliation_adjustment";

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <Label>Step 1 — City</Label>
        <Select
          name="origin_city_id"
          required
          value={originCityId}
          onChange={(e) => {
            setOriginCityId(e.target.value);
            setCurrency("");
          }}
        >
          <option value="" disabled>
            Select origin city
          </option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label>Step 2 — Transaction Type</Label>
        <Select
          name="transaction_type"
          value={transactionType}
          onChange={(e) => setTransactionType(e.target.value)}
        >
          {TYPE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((opt) => (
                <option key={opt} value={opt}>
                  {TRANSACTION_TYPE_LABELS[opt]}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      {needsParty && (
        <div>
          <Label>Step 3 — Party</Label>
          <Select
            name="party_id"
            required={needsParty}
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
          >
            <option value="" disabled>
              Select party
            </option>
            {partiesInOriginCity.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.linked_profile_id ? " — linked contact" : ""}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div>
        <Label>Step 4 — Amount</Label>
        <div className="flex gap-2">
          <Input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="500000"
            className="flex-1"
          />
          <Select
            name="currency"
            value={effectiveCurrency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-28"
            aria-label="Currency"
          >
            {currencyOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        {originCity && effectiveCurrency !== originCity.currency && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {originCity.name} is a {originCity.currency} city — this will be recorded as a
            separate {effectiveCurrency} balance there. No conversion is applied.
          </p>
        )}
      </div>

      {canShare && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-accent/30 bg-accent/[0.06] p-4">
          <input
            type="checkbox"
            name="share_with_linked"
            defaultChecked
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-sm font-medium">Share with {selectedParty?.name}</span>
            <span className="mt-0.5 block text-xs text-muted">
              Posts a matching entry in their book as <strong>pending</strong> until they confirm
              it, so both sides always agree on the amount. Uncheck to keep this private to your
              own book.
            </span>
          </span>
        </label>
      )}

      {(needsDestination || needsCounterparty) && (
        <div className="space-y-4 rounded-lg border border-dashed border-border p-4">
          <p className="text-xs font-medium uppercase text-muted">Optional / Cross-City Details</p>

          {needsDestination && (
            <div>
              <Label>Destination City</Label>
              <Select name="destination_city_id" required={needsDestination}>
                <option value="" disabled defaultValue="">
                  Select destination city
                </option>
                {cities
                  .filter((c) => c.id !== originCityId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
              </Select>
            </div>
          )}

          {needsCounterparty && (
            <div>
              <Label>Receiving Party (counterparty)</Label>
              <Select name="counterparty_id" required={needsCounterparty}>
                <option value="" disabled defaultValue="">
                  Select receiving party
                </option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Reference</Label>
          <Input name="reference" placeholder="Optional external reference" />
        </div>
        <div>
          <Label>Description</Label>
          <Input name="description" placeholder="Optional note" />
        </div>
      </div>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating..." : "Generate Token & Create Transaction"}
      </Button>
    </form>
  );
}
