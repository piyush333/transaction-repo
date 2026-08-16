# Settlement Ledger

A private double-entry accounting and settlement-management app: cities,
parties, token-based transactions, and a balance engine that computes every
figure from the ledger — never from a manually-edited number.

Stack: **Next.js (App Router, TypeScript, Tailwind) + Supabase (Postgres,
Auth, Row-Level Security)**. This was chosen so the whole app deploys with
zero servers to manage and — once connected to Vercel — **every push to
`main` auto-deploys with no manual steps**.

## Architecture

```
Owner → Cities → Parties → Tokens/Transactions → Ledger Entries → Balances
```

- **`supabase/migrations/`** — the entire schema, RLS policies, and the
  ledger engine, as plain SQL migrations (applied in filename order).
- **`src/app/`** — Next.js App Router pages (dashboard, cities, parties,
  transactions, search, reconciliation, audit log).
- **`src/lib/queries.ts`** / **`src/lib/actions.ts`** — all reads and writes
  go through these; there is no other place data is fetched or mutated.

### The Balance Engine

Every transaction posts a **balanced pair of ledger legs**
(`transaction_entries`) via the `create_transaction()` Postgres function —
never a bare balance update. Balances are Postgres **views**
(`party_balances`, `city_balances`, `city_to_city_obligations`,
`dashboard_kpis`, etc.) that sum ledger entries live. Nothing in the schema
lets a balance be edited directly.

Accounting convention (see `supabase/migrations/20260816120000_core_tables.sql`
for the full comment):

- `party balance = opening_balance + SUM(debit) − SUM(credit)`
- **balance > 0** → the party owes the owner → **Receivable**
- **balance < 0** → the owner owes the party → **Payable**
- City cash balances follow the same debit-increases convention.

Corrections never delete history: `reverse_transaction()` posts an
equal-and-opposite transaction and links the two records together. Triggers
block hard deletes on `transactions`, `transaction_entries`, and
`audit_logs` outright.

### Roles (enforced at the database layer via RLS, not just in the UI)

| Role | Access |
|---|---|
| `owner` | Full access everywhere |
| `city_manager` | Read everything; create/confirm/reverse transactions and parties only in their assigned city |
| `operator` | Create transactions in their assigned city (posted as `pending`, needs manager/owner confirmation) |
| `viewer` | Read-only, everywhere |
| `auditor` | Read-only, plus the audit log |

The **first person to sign up automatically becomes `owner`** (see
`handle_new_user()`). Change anyone else's role directly in Supabase Studio →
Table Editor → `profiles` (a dedicated admin UI for this is a good Phase 2
addition).

## What's built (Phase 1 MVP)

Login/signup, Cities, Parties, token-based transaction creation
(`CITY-DATE-SEQUENCE` / `CITY-DESTCITY-DATE-SEQUENCE`), the ledger engine,
automatic city/party/city-to-city balances, global search, transaction
history with full drill-down, dashboard KPIs, receivable/payable framing,
append-only audit log — plus, ahead of schedule, a stylized India map,
balance/volume/exposure graphs, and a reconciliation screen (originally
scoped for Phase 2 in the product spec).

Not built yet (see the original spec's Phase 2/3 lists): MFA, settlement
linking UI (the DB tracks `settles_transaction_id` already), PDF/export
reports, notifications/alerts delivery, party KYC document upload UI,
mobile app, multi-currency, anomaly detection.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

## Deployment (Vercel, auto-deploy on every push)

This is the **one manual step** — after this, every push to your branch
redeploys automatically with no further action:

1. Go to [vercel.com/new](https://vercel.com/new) and import this GitHub repo.
2. Set these two environment variables in the Vercel project settings
   (same values as `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy. Vercel's GitHub integration will now auto-build and auto-deploy
   on every push — no further manual steps.

The Supabase project itself needs no ongoing maintenance beyond applying new
migrations (see below) — there's no server to manage or restart.

### Supabase project

- Project ref: `bvkpylpqdsdqnwunpaxy` (region `ap-south-1`)
- To apply a new migration: add a timestamped `.sql` file to
  `supabase/migrations/` and apply it (via the Supabase MCP tools, the
  Supabase CLI, or pasting it into the SQL editor in Supabase Studio).
- Auth → Providers: email/password is enabled by default. Email
  confirmation is on by default; disable it in Supabase Studio → Authentication
  → Providers → Email if you want instant sign-in without a confirmation
  email during initial setup.

## Handoff notes

- All schema/business logic lives in SQL (`supabase/migrations/`), not in
  application code — anyone with Postgres experience can read the full
  accounting model in `20260816120000_core_tables.sql` and
  `20260816120100_token_and_posting.sql` without needing to read the
  frontend at all.
- RLS policies are the actual security boundary — the frontend has no
  special privileges beyond what any authenticated user's role grants.
- `src/lib/types.ts` is hand-written to mirror the schema. If you use the
  Supabase CLI locally, `npx supabase gen types typescript` will generate a
  fully accurate version from the live schema.
