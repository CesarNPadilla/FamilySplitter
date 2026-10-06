# Family Splitter

A mobile-first browser website for five family members sharing travel and property expenses. Phases 0–2 provide the development foundation, tested core logic, and database migrations/security. Authentication and expense/payment screens are not implemented yet. No PWA, service worker, or manifest is included. Hosting remains undecided.

## Local setup

Install Node.js 24 LTS and npm, then run:

```sh
npm ci
cp .env.example .env
npm run dev
```

On PowerShell use `Copy-Item .env.example .env` instead of `cp`. Open the URL printed by Vite. The setup page works without Supabase configuration. Later phases will use the project URL and public anon key; never commit secrets or expose a service-role key in frontend variables.

## Checks

```sh
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:db
```

`npm run test:watch` runs unit tests interactively. `npm run format` formats the project. `npm run preview` serves the production build locally. GitHub Actions runs all checks plus Chromium smoke tests at desktop and mobile sizes. CI results become available after you push this branch and open a PR.

`npm run test:db` requires a running Docker engine with Linux containers. It creates a fresh PostgreSQL 17 container without a published port, applies a minimal test-only Auth contract, the migrations, and demo seed, then runs SQL assertions and removes the container. It does not use or modify a Supabase project. PostgreSQL/Docker are database test runtimes; no npm dependencies were added for Phase 2. CI has a separate database job running this same command.

## Structure

- `src/lib/`: pure split, balance, and money modules; Supabase access comes later.
- `src/i18n/`: English dictionary consumed by components; Spanish can be added later.
- `src/components/` and `src/pages/`: future shared UI and application pages.
- `supabase/migrations/` and `supabase/seed.sql`: schema, security RPCs, and local demo data.
- `tests/unit/`, `tests/e2e/`, and `tests/database/`: Vitest, Playwright, and SQL checks.

## Core logic (Phase 1)

Money uses integer cents, with independent USD and MXN balances and no conversion. For equal splits, divide into base shares using integer arithmetic. If the payee participates, assign the entire remainder to their share. Otherwise, sort participants by member ID and assign one extra cent to each of the first remainder participants. Never force payee participation. The live preview will show exact amounts. Custom amounts must sum to the total; percentages must sum to 100.

Equal splitting is the primary mode. Percentage splitting uses largest remainder rounding: allocate whole cents, then distribute leftover cents by descending fractional remainder, breaking ties by member ID. The payee has no rounding preference in percentage mode. All split results are sorted lexically by member ID, independent of selection order, and input arrays remain unchanged. A participating payee's own share starts with both payment flags true; other shares start with both false.

### API

- `splitEqual(totalCents, memberIds, payeeId)` returns shares containing `memberId`, `amountCents`, `payorMarkedPaid`, and `payeeConfirmed`.
- `splitCustom(totalCents, [{ memberId, amountCents }], payeeId)` validates the exact sum.
- `splitPercentages(totalCents, [{ memberId, percentage: '33.34' }], payeeId)` accepts nonnegative decimal strings, with no floating-point percentage conversion or fixed precision limit.
- `parseCents('2000.00')` returns `200000`. Inputs are ungrouped, nonnegative decimals with up to two fractional digits; surrounding whitespace is accepted. Currency symbols, comma grouping, exponent notation, and excess precision are rejected.
- `formatCents(200000, 'USD')` returns `USD 2,000.00`; `formatCents(300000, 'MXN')` returns `MXN 3,000.00`. The English formatter includes an explicit currency code.
- `computeBalances(expenses, shares)` accepts expenses `{ id, paidBy, currency }` and split shares extended with `expenseId`. It returns a record by member ID with separate `USD` and `MXN` entries, each containing `amountOwedCents` and `amountOwedToThemCents`. It reports outstanding obligations in both directions without cancelling them. Members present as payees or share participants receive entries, including zero balances; unrelated members require the later members-table integration.
- `shareStatus(share)` returns `to-be-paid`, `awaiting-confirmation`, or `settled`. Both flags must be true to settle. Self obligations are excluded from balances.

Zero totals and zero shares are supported. Negative, fractional, non-finite, or unsafe cent values are rejected. Public cent values use safe integers; intermediate arithmetic uses BigInt to avoid rounding or overflow. Aggregated balances exceeding the safe integer limit throw rather than silently losing cents. Empty participant selections, duplicate members per expense, duplicate expense IDs, and orphan shares are rejected. These are pure TypeScript interfaces, not a database schema; persistence and security remain Phase 2 work. Validation errors are internal developer messages; future UI screens should map them to dictionary text.

Unit tests cover the requested travel/property examples, rounding with and without payee participation, a one-cent total, single participants, invalid custom sums, duplicates, percentage rounding, money parsing/formatting, and two-step settlement. A conservation check covers totals from 0 through 101 cents with one through five participants and every payee position.

## Database and security (Phase 2)

### Schema and access

The migration defines `members`, `expense_tabs`, `expenses`, and `expense_shares`, all with RLS enabled. UUID member IDs are stable identifiers, separate from Auth user IDs. Money is `bigint` cents bounded to JavaScript's safe integer range. USD and MXN remain separate. Percentage inputs use exact PostgreSQL `numeric`; unlike TypeScript strings, PostgreSQL has platform limits on numeric precision/scale, so excessively long inputs may be rejected.

Every linked family member can read all four tables. Anonymous requests have no table grants; authenticated non-members receive zero rows. A private security-definer membership helper avoids recursive RLS on `members`. All definer functions use an empty search path and qualified application tables; execution grants are explicit. This follows Supabase's [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [function security guidance](https://supabase.com/docs/guides/database/functions).

Browser roles have **no direct insert, update, or delete privileges** on these tables. Member administration is a trusted admin operation. Tabs can be created by any linked member through `create_expense_tab`; tab rename/delete APIs are outside this phase. Expense writes use `save_expense`/`delete_expense`, which check membership and allow edits/deletes only for the original creator or current payee. The creator cannot be rewritten. Share uniqueness is enforced by `(expense_id, member_id)`. Foreign keys, amount/currency constraints, and deferred integrity triggers require at least one share, an exact total, valid percentages for the split mode, and a settled payee own share. Expense deletion cascades its shares.

### RPC contract

| Function              | Arguments                                                                                                                    | Result and permission                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `link_current_member` | None                                                                                                                         | Returns the matching member UUID after verifying the current Auth user's confirmed email.                      |
| `create_expense_tab`  | `p_name`                                                                                                                     | Returns a new tab UUID; linked member required.                                                                |
| `save_expense`        | `p_tab_id`, `p_description`, `p_total_cents`, `p_currency`, `p_paid_by`, `p_split_mode`, `p_shares`, optional `p_expense_id` | Creates an expense if ID is omitted/null; otherwise edits after creator/payee authorization. Returns its UUID. |
| `delete_expense`      | `p_expense_id`                                                                                                               | Deletes after creator/payee authorization.                                                                     |
| `mark_paid`           | `share_id`                                                                                                                   | Only the share's member may set `payor_marked_paid`.                                                           |
| `confirm_received`    | `share_id`                                                                                                                   | Only the expense payee may set `payee_confirmed`, after the payor has marked payment.                          |

`p_split_mode` is `equal` (primary mode), `custom`, or `percentage`. `p_shares` is a JSON array with one entry per participant:

```json
[{ "member_id": "00000000-0000-0000-0000-000000000002" }]
```

Custom entries also contain integer `amount_cents`; percentage entries contain a decimal-string `percentage`. The server derives equal and percentage amounts using the agreed rounding rules. Any client-supplied payment flags are ignored. SQL column names use snake_case; a future Supabase adapter will map them to the Phase 1 camelCase types.

Changing the amount, participant set, custom allocation, percentage weights, split mode, currency, or payee recreates the shares with fresh IDs and resets payment flags. A participating payee's own share is recreated as settled. Description/tab-only edits and reordering unchanged participants preserve existing shares/confirmations. Stale share IDs cannot mark or confirm the new split. Payment, edit, and delete RPCs lock the expense before changing shares to serialize competing operations.

`expense_shares.status` is generated: `to-be-paid` when unmarked, `awaiting-confirmation` when marked but unconfirmed, and `settled` when both flags are true. Payment RPCs are idempotent. Confirmation before a payment mark is rejected. There is no direct client path to reset confirmations or bypass the two-step flow.

### Apply and provision

1. For a **local Supabase stack**, install the Supabase CLI using its documented platform instructions, then run `supabase start` and `supabase db reset` from this folder. Reset recreates the local database and loads demo seed; use it only for disposable local data. The optional CLI is not required for `npm run test:db`.
2. For a **hosted project**, apply `supabase/migrations/20261006000100_family_expenses.sql` as the migration owner using your chosen migration process or the SQL editor. Do not run `tests/database/bootstrap.sql` on Supabase: it is exclusively a disposable PostgreSQL test fixture. Do not apply the demo seed to production.
3. Insert the five real member names/emails using trusted admin SQL. Store emails lowercase and trimmed. Do not expose an allowlist query on the login screen. `supabase/seed.sql` uses reserved `example.invalid` emails and creates no Auth users.
4. Disable public sign-ups and anonymous sign-ins in hosted Auth settings, and leave email confirmation enabled. The checked-in `supabase/config.toml` disables local general/email/SMS sign-ups and anonymous sign-ins; it does **not** configure a hosted project. See [Supabase configuration](https://supabase.com/docs/guides/local-development/cli/config).
5. Pre-provision only the allowlisted emails through a trusted server/admin operation, such as [`auth.admin.createUser`](https://supabase.com/docs/reference/javascript/auth-admin-createuser) with the email, no password, and `email_confirm: true` after checking the administrator-provided address. Use an admin credential only outside the browser. The first magic link will prove email access before the browser receives a session. A `members` row alone is insufficient for `shouldCreateUser: false` to sign in.
6. In Phase 3, call `signInWithOtp` with `shouldCreateUser: false`, show a generic login response, then call `link_current_member` after receiving the session. This function only binds an unlinked member row whose email matches the confirmed email in `auth.users`; it never trusts submitted emails, JWT email claims, or editable user metadata. Until linking succeeds, the session cannot read app data. Repeat linking is harmless; an email already linked to another Auth ID is rejected. Account removal clears its member link through the FK; reassignment of an existing identity must be an intentional admin operation.

Redirect URLs, custom SMTP, and deployment remain later-phase work. No hosted project settings or data were changed during Phase 2.

### Verified security boundaries

Run `npm run test:db`. The executable assertions in `tests/database/security.sql` run actual SQL as `anon`, `authenticated` non-members, three linked members, an unverified allowlisted account, and a competing Auth identity. Fixtures simulate JWT claims at the trusted database boundary; they do not bypass or test HTTP token verification. Test-only Auth accounts and temporary helper functions are rolled back.

The tests prove: no anonymous/non-member reads; member access only after verified linking; no allowlist mutation or identity takeover; payors cannot confirm for payees; payees cannot mark for another payor; unrelated members cannot edit/delete or confirm; direct share and flag mutations fail; both confirmations are required; each financial edit condition resets flags; metadata-only edits preserve them; old IDs fail; creator/payee deletion works and cascades; duplicate shares and invalid amounts/sums/currencies fail; and both rounding rules reproduce the examples. Deferred constraints are explicitly flushed before rollback. The harness also simulates permissive default API-role grants to ensure the migration closes them.

These policies/RPCs are verified locally on PostgreSQL 17. A full hosted Supabase Auth/PostgREST smoke test and real magic-link delivery remain Phase 3/integration validation; the local SQL harness does not establish hosted configuration or GitHub CI status.

## Review workflow

One branch and PR per phase. Run lint, type-check, tests, and build; commit; then stop for review before starting the next phase. Phase 0 is on `phase-0-setup`, Phase 1 on `phase-1-core-logic`, and Phase 2 on `phase-2-database-security`. You will push the local code to https://github.com/CesarNPadilla/FamilySplitter and open each phase's PR. If the preceding phase has not merged, use it as the PR base; otherwise use the branch containing the merged work. Local checks do not establish GitHub CI status.

## Dependency purposes

- React and React DOM: component rendering.
- Vite and its React plugin: development server and production bundling.
- TypeScript and Node/React type packages: static checks for application and tool configuration.
- Tailwind CSS and its Vite plugin: requested responsive styling.
- ESLint, its JS configuration, TypeScript integration, React hooks/refresh plugins, and globals: linting TypeScript, React, and tooling.
- Prettier: consistent source formatting.
- Vitest: unit tests.
- Playwright: desktop and mobile browser tests.
