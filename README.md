# Settlement Ledger

A private double-entry accounting and settlement-management application:
cities, parties, token-based transactions, and a balance engine that
computes every number from the ledger — never from a manually-edited
"current balance" field.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind) — deployed on **Netlify**
  (auto-deploys on every push once the repo is connected — see Deployment
  below).
- **Supabase** (Postgres) — the database, auth, and the entire ledger/balance
  engine live here as SQL (tables, views, functions), not in application
  code. Project: `transaction-repo` (ref `bvkpylpqdsdqnwunpaxy`, region
  `ap-south-1`).

## Two private books, one platform

This is **not** a shared organization ledger. Each person who signs up gets
their own completely private book: their own cities, parties, and
transactions, invisible to anyone else. That isolation is enforced by
Postgres Row-Level Security on `owner_id`, so it holds even against direct
API calls — not just hidden in the UI.

The two books connect in exactly two places:

1. **Linked contacts.** You can mark a party as *being* the other real user
   (`parties.linked_profile_id`). Both people must add each other.
2. **Shared transactions.** A transaction against a linked contact can be
   shared: it posts as `confirmed` in your book and auto-creates a matching
   **`pending`** counter-entry in theirs (your `payment` becomes their
   `receipt`), which they confirm. Only one person types the numbers, so
   the two books can never disagree on an amount. Both people can see that
   specific linked pair — and nothing else in each other's book.

Chat (`/chat`) is shared between everyone with an account.

### Deleting

Transactions are **permanently deleted**, at the client's explicit request
(this deliberately overrides the append-only default a ledger would
normally have — deleting a posted transaction retroactively changes
historical balances, and cannot be undone):

- **Your own, unlinked** → deleted immediately.
- **Shared/linked** → you request, the other person approves, then it is
  removed from *both* books. The requester cannot approve their own request.

In both cases a snapshot (who, when, why, and the full prior row) is written
to `audit_logs` first. **`audit_logs` itself remains undeletable** — a
delete attempt raises at the trigger level — so there is always a permanent
record that a deletion happened, even though the transaction is gone.

## Architecture: the four core objects

```
CITY → PARTY → TOKEN (transaction) → LEDGER ENTRIES → BALANCES
```

Every transaction posts a **balanced pair of double-entry ledger legs** to
`transaction_entries`. Nothing displayed in the UI is stored as an editable
number — city balances, party balances, receivable/payable, and city-to-city
obligations are all SQL views computed live from `transaction_entries` /
`transactions`. See `supabase/migrations/03_balance_views.sql` for the full
accounting convention (mirrors the worked example in the original product
spec):

- `party balance = opening_balance + SUM(debit) - SUM(credit)`
  - `balance > 0` → the party owes the owner → **Receivable**
  - `balance < 0` → the owner owes the party → **Payable**
- `city balance = opening_balance + SUM(debit) - SUM(credit)` on that city's
  cash entries.

Corrections never delete history: `reverse_transaction()` posts an
equal-and-opposite transaction and links the two together. Hard deletes are
blocked at the trigger level on `transactions`, `transaction_entries`, and
`audit_logs`.

## What's built (Phase 1 MVP)

- Email/password auth (Supabase Auth). Every signup becomes the Owner of
  their own private book — see "Two private books" above.
- Cities, Parties (with opening balances, phone, type, notes), plus linked
  contacts and shared transactions between the two books.
- Token-based transactions (`CITY-DATE-SEQUENCE` / `CITY-DEST-DATE-SEQUENCE`,
  e.g. `NMC-260814-000001`), covering receipts, payments, city transfers,
  party-to-party transfers, and reconciliation adjustments.
- Automatic double-entry ledger + balance engine (cities, parties, city ×
  party, city-to-city obligations).
- Dashboard: KPI cards, an interactive India map (real state boundaries via
  `@svg-maps/india`, not a hand-drawn outline — pan/drag, scroll-to-zoom
  anchored under the cursor, +/- controls, clickable city markers sized by
  volume and colored by balance) with obligation lines between cities,
  balance/receivable-payable/volume/exposure graphs, top outstanding
  parties, recent tokens.
- Internal chat (`/chat`) — one shared channel for everyone with an
  account, live via Supabase Realtime. Deliberately minimal: no threads,
  groups, attachments, or edit/delete; built for the two people actually
  running this ledger to coordinate, not as a general messaging platform.
- Dark-first UI (toggle to light in the sidebar; preference persists per
  browser) with a small token-based design system
  (`src/app/globals.css` → `--background`, `--surface`, `--accent`, etc.)
  so every component stays consistent instead of hardcoded colors.
- Full token drill-down (ledger entries, related transactions, modification
  history) and global search (token, party, city, phone, amount).
- Reconciliation view (🟢 matched / 🟡 pending / 🔴 discrepancy).
- Append-only audit log (Owner/Auditor only).

**Not built yet** (Phase 2/3 in the original spec — mobile app, automated
anomaly detection, forecasting, multi-currency, attachments/KYC upload,
notifications delivery, PDF/report exports). The schema already has the
tables/columns these will need (`party_documents`, `notifications`,
`alert_settings`).

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in your Supabase project URL +
anon/publishable key (Project Settings → API in the Supabase dashboard).

## Database migrations

All schema changes live as SQL files in `supabase/migrations/`, applied in
order. To link a local Supabase CLI to this project (optional, only needed
if you want to run migrations from your machine instead of the dashboard's
SQL editor):

```bash
npx supabase login
npx supabase link --project-ref bvkpylpqdsdqnwunpaxy
npx supabase db push
```

## Deployment (Netlify — auto-deploy, no manual steps after setup)

1. In Netlify: **Add new site → Import an existing project**, pick this
   repo/branch.
2. Netlify auto-detects `netlify.toml` (Next.js Runtime via
   `@netlify/plugin-nextjs`) — no build settings to change.
3. Add the two environment variables from `.env.example` under **Site
   settings → Environment variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. From then on, every push to this branch redeploys automatically
   — no further manual steps.

## Security notes for whoever takes this over

- Row-Level Security is enabled on every table and scopes all financial data
  to `owner_id`, so one person's book is unreachable from the other's
  account even via direct API calls. This was verified by impersonating both
  real accounts at the database level, not just by checking the UI.
- Financial data is never exposed to the `anon` (unauthenticated) role —
  every table explicitly revokes `anon` access.
- The functions that deliberately cross the book boundary
  (`create_linked_transaction`, `confirm_delete_transaction`) are
  `SECURITY DEFINER` and gated on a **mutual** linked-contact relationship.
  They are the only sanctioned way one account can write into the other's
  book.
- Two things are **dashboard-only settings**, not doable via migration —
  worth turning on before this goes into real use:
  - **Authentication → Policies**: enable "Leaked password protection" and
    consider requiring MFA.
  - **Database → Backups**: the free tier has limited backup retention.
    Especially important now that transactions can be permanently deleted —
    without point-in-time recovery, an approved deletion is unrecoverable.

## Roles

There is effectively **one role**: each person is the Owner of their own
book, with full access to it and no access to anyone else's. The earlier
City Manager / Operator / Viewer / Auditor model was removed when the app
moved to separate private books — a delegated-permission hierarchy doesn't
apply when each book has exactly one person.

The `profiles.role` column is retained (always `'owner'`) so per-book
delegation could be reintroduced later without another migration.

## Setting up the two users

1. Each person signs up at `/login` → "First time here? Create an account".
   That automatically creates their own empty private book.
2. Each adds the other as a **linked contact**: Parties → Add Party → set
   "Link to a person on this platform" to the other user. **Both** must do
   this before shared transactions will work — the database rejects a share
   if the link isn't mutual.
3. From then on, creating a transaction against that linked party shows a
   "Share with …" checkbox.
