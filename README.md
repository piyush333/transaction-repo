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

- Email/password auth (Supabase Auth). The **first person to sign up
  becomes Owner** automatically; everyone after that is a Viewer until the
  Owner changes their role from the `profiles` table.
- Role-based access control enforced at the database layer via Postgres RLS
  (Owner / City Manager / Operator / Viewer / Auditor — see
  `supabase/migrations/04_rls_policies.sql`), not just hidden in the UI.
- Cities, Parties (with opening balances, phone, type, notes).
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

- Row-Level Security is enabled on every table; policies are reviewed
  against Supabase's security advisor (no unresolved errors/warnings beyond
  two intentional, low-risk exceptions documented at the top of
  `04_rls_policies.sql`).
- Two things are **dashboard-only settings**, not doable via migration —
  worth turning on before this goes into real use:
  - **Authentication → Policies**: enable "Leaked password protection" and
    consider requiring MFA for the Owner role.
  - **Database → Backups**: the free tier has limited backup retention. For
    real financial data, upgrade to a plan with point-in-time recovery.
- Financial data is never exposed to the `anon` (unauthenticated) role —
  every table explicitly revokes `anon` access.

## Roles

| Role | Access |
|---|---|
| Owner | Full access everywhere |
| City Manager | Create/confirm transactions and parties in their assigned city |
| Operator | Create transactions in their assigned city (enter as `pending`, needs Manager/Owner confirmation) |
| Viewer | Read-only, everywhere |
| Auditor | Read-only + audit log access |

Assign a role/city by editing a user's row in the `profiles` table (Owner
only, or directly in the Supabase dashboard).
