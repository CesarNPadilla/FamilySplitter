# Family Splitter

A mobile-first browser website for five family members sharing travel and property expenses. Phases 0–4 provide the development foundation, core logic, database security, magic-link authentication, expense tabs/forms, and two-step payment confirmation with per-currency balances. No PWA, service worker, or manifest is included. Hosting remains undecided.

## Local setup

Install Node.js 24 LTS and npm, then run:

```sh
npm ci
cp .env.example .env
npm run dev
```

On PowerShell use `Copy-Item .env.example .env` instead of `cp`, only when `.env` does not already exist. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the project URL and **public anon key**. Without configuration, the app shows an unavailable setup state. Never commit secrets or expose a service-role key in frontend variables. Open the URL printed by Vite.

For the local demo, Docker Desktop must be running with Linux containers:

```powershell
Set-Location C:\dev\FamilySplitter
npx supabase start
npm run auth:provision:local
npm run dev
```

The Supabase CLI is already a dev dependency. On a new local installation, `npx supabase start` applies the checked-in migrations and seed. If rebuilding an existing disposable local database is needed, `npx supabase db reset --local` erases it and reloads the migrations/seed. Then provision the demo accounts again. `auth:provision:local` creates the five demo Auth users without passwords; it accepts only loopback services and the seed's `member1@example.invalid` through `member5@example.invalid` addresses. It creates no hosted accounts and sends no email.

Get local connection details with `npx supabase status`: copy only the API URL and anon key into `.env`, and restart Vite after configuration changes. At `http://localhost:5173`, request a magic link for `member1@example.invalid`, open the captured message in the local mail inbox at `http://127.0.0.1:54324`, and follow the link. Local emails are captured, not delivered to the reserved demo addresses. Hosted real accounts still require trusted admin provisioning.

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

`npm run test:e2e` uses mocked Auth/database responses at port 5175, independent of your `.env` or local database. `npm run test:auth:local` is the optional real integration check: it requires the running local Supabase stack, demo seed, Mailpit inbox, and an available Vite port 5173. It verifies captured magic links, member linking, persisted sessions, sign-out, RLS for a pre-existing outsider account, disabled public sign-ups, and no Auth account creation for unknown emails in desktop and mobile Chromium. Phase 4 extends it with real tab creation, expense add/edit/delete, both spreadsheet examples, payer-excluded rounding, custom amounts, and exact percentage edit prefills. It provisions temporary fixtures and deletes only accounts it created plus expense/tab fixtures with this run's unique prefix; existing local data is preserved. Only the public URL/key reach Vite. Real auth traces, screenshots, and video are disabled. CI runs the mocked browser suite and SQL suite; the real local integration suite was verified locally and is not a GitHub CI job yet. Stop any preview server using port 5173 before running it. Repeated login requests for the same demo email are subject to the local Auth cooldown; wait at least 60 seconds before immediate reruns.

## Structure

- `src/lib/`: pure split/balance/money modules, the Supabase client, and auth helpers/context.
- `src/i18n/`: English dictionary consumed by components; the app title and introduction use the requested Spanish wording. Full Spanish translation can be added later.
- `src/components/` and `src/pages/`: auth provider, login, dashboard, tab view, and shared expense editor/cards.
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

1. For a **local Supabase stack**, use the project's CLI dependency with `npx supabase start` from this folder. To rebuild disposable local data, run `npx supabase db reset --local`. Reset recreates the local database and loads demo seed; use it only for disposable local data. The CLI is not required for `npm run test:db`.
2. For a **hosted project**, apply `supabase/migrations/20261006000100_family_expenses.sql` as the migration owner using your chosen migration process or the SQL editor. Do not run `tests/database/bootstrap.sql` on Supabase: it is exclusively a disposable PostgreSQL test fixture. Do not apply the demo seed to production.
3. Insert the five real member names/emails using trusted admin SQL. Store emails lowercase and trimmed. Do not expose an allowlist query on the login screen. `supabase/seed.sql` uses reserved `example.invalid` emails and creates no Auth users.
4. Disable public sign-ups and anonymous sign-ins in hosted Auth settings, keep the email provider enabled, and leave email confirmation enabled. Locally, `auth.enable_signup = false` blocks public sign-ups. **Keep `auth.email.enable_signup = true`**: the installed CLI maps this field to `GOTRUE_EXTERNAL_EMAIL_ENABLED`; setting it false disables email OTP sign-in as well. The local integration test verifies that `/signup` is rejected while magic links work. SMS and anonymous sign-ins are disabled. `supabase/config.toml` does **not** configure hosted settings. See [Supabase configuration](https://supabase.com/docs/guides/local-development/cli/config). If changing local Auth settings, stop/start the stack to apply them without resetting its data.
5. Pre-provision only the allowlisted emails through a trusted server/admin operation, such as [`auth.admin.createUser`](https://supabase.com/docs/reference/javascript/auth-admin-createuser) with the email, no password, and `email_confirm: true` after checking the administrator-provided address. Use an admin credential only outside the browser. The first magic link will prove email access before the browser receives a session. A `members` row alone is insufficient for `shouldCreateUser: false` to sign in.
6. The Phase 3 app calls `signInWithOtp` with `shouldCreateUser: false`, shows a generic login response, then calls `link_current_member` after verifying the session. This function only binds an unlinked member row whose email matches the confirmed email in `auth.users`; it never trusts submitted emails, JWT email claims, or editable user metadata. Until linking succeeds, the session cannot read app data. Repeat linking is harmless; an email already linked to another Auth ID is rejected. Account removal clears its member link through the FK; reassignment of an existing identity must be an intentional admin operation.

Redirect URLs, custom SMTP, and deployment remain later-phase work. No hosted project settings or data were changed during Phase 2.

### Verified security boundaries

Run `npm run test:db`. The executable assertions in `tests/database/security.sql` run actual SQL as `anon`, `authenticated` non-members, three linked members, an unverified allowlisted account, and a competing Auth identity. Fixtures simulate JWT claims at the trusted database boundary; they do not bypass or test HTTP token verification. Test-only Auth accounts and temporary helper functions are rolled back.

The tests prove: no anonymous/non-member reads; member access only after verified linking; no allowlist mutation or identity takeover; payors cannot confirm for payees; payees cannot mark for another payor; unrelated members cannot edit/delete or confirm; direct share and flag mutations fail; both confirmations are required; each financial edit condition resets flags; metadata-only edits preserve them; old IDs fail; creator/payee deletion works and cascades; duplicate shares and invalid amounts/sums/currencies fail; and both rounding rules reproduce the examples. Deferred constraints are explicitly flushed before rollback. The harness also simulates permissive default API-role grants to ensure the migration closes them.

These policies/RPCs are verified locally on PostgreSQL 17 and against the local Supabase Auth/PostgREST stack in Phase 3. Hosted Auth settings, real email delivery, and hosted integration remain unverified. Neither local suite establishes GitHub CI status.

## Authentication (Phase 3)

The only login form is email magic link; there are no password or public registration screens. Email input is trimmed/lowercased and sent through [`signInWithOtp`](https://supabase.com/docs/reference/javascript/auth-signinwithotp) with `shouldCreateUser: false`. Known/unknown emails, provider errors, and transport failures receive the same generic response. The login page never queries the members table or discloses registration status.

The SDK persists sessions and refreshes tokens. It processes the standard SPA magic-link URL response; the requested redirect is the current site origin. Configure that exact origin in the Supabase redirect allowlist for each environment. Session restoration and every new token first call `getUser` for server verification, then link the member and read their matching row. Only a verified member renders protected pages; anonymous and denied sessions resolve to `/login`. Root and callback visits follow the same guard.

Auth-state callbacks schedule database requests outside the SDK Auth lock, following [Supabase callback guidance](https://supabase.com/docs/reference/javascript/auth-onauthstatechange). Request generations prevent late membership results from restoring protected content after sign-out or a session change. Invalid links get a dictionary-based recovery message, transient membership errors get retry, and sign-out clears this browser's SDK session (including its other tabs). It does not sign out other devices. No privileged key enters the frontend. Backend RLS/RPC checks remain authoritative even if a browser manipulates local storage or the URL.

The real local test deliberately provisions outsider Auth fixtures through the admin API to prove they still cannot enter the app or read expense rows. Normal provisioning must create only allowlisted family accounts. All visible component text comes from the English dictionary. Hosting and custom SMTP remain Phase 6 decisions/work.

## Tabs and expenses (Phase 4)

After signing in, the dashboard lists shared tabs and lets members create a tab. Open a tab to see its expenses and each participant's exact share in that expense's currency. Add an expense with a description, decimal amount, USD/MXN currency, and the member who paid. Equal splitting is the default; select participants using large checkbox labels. A participant appears only once, and selecting the person who paid is optional. The live preview shows exact per-person amounts and the total before saving. Invalid amounts, missing participants, non-matching custom totals, and percentage totals other than 100 disable saving with English dictionary guidance.

Custom amounts are entered as decimal currency values and parsed to integer cents. Percentages remain decimal strings. Saved percentages are selected using PostgREST's [`percentage::text` column cast](https://postgrest.org/en/stable/references/api/tables_views.html#casting-columns), preserving long fractional inputs when reopening an editor; no schema change was needed. Expense/share rows are read with a single embedded query so one response contains the expense and its shares from the same database snapshot. Writes use only `create_expense_tab`, `save_expense`, and `delete_expense`; payment flags are never submitted by the form.

Edit/delete controls are shown only to the creator or the member who paid, and manually opening an unauthorized edit URL displays a denial. RPCs recheck permissions if the record changes while a form is open. Edit forms prefill all selected participants and stored allocations, and warn that financial changes restart confirmation under the Phase 2 rules. Deleting requires an explicit inline confirmation. Failed saves preserve inputs for retry; list failures have retry controls, and empty tabs explain how to add the first expense.

Protected routes are `/dashboard`, `/tabs/:tabId`, `/tabs/:tabId/new`, and `/tabs/:tabId/expenses/:expenseId/edit`. Navigation uses browser history with real link URLs, including back/forward, deep links, and reloads. Auth restoration retains the requested protected path after member verification. No routing or other dependency was added.

Verified examples: `Disney universal`, USD 2,000.00 split between two members produces USD 1,000.00 each; `House title`, MXN 3,000.00 split between three members produces MXN 1,000.00 each. USD 100.00 among three participants with the payer excluded yields USD 33.34 / 33.33 / 33.33 in stable member-ID order. The local desktop/mobile suite adds these examples through the real form, reloads saved data, edits splits, and deletes its fixtures. The mocked suite also checks duplicate selection prevention, invalid custom/percentage inputs, denied edits, changed permissions at save time, deletion cancellation, error retry, and mobile overflow/touch-target sizes. Phase 5 adds the payment buttons, status pills, and balance/settle screens.

## Payment confirmation (Phase 5)

The main page and browser title now say **Cuentas Claras - Familia Nieto**, with the requested Spanish introduction and tagline. Action buttons and navigation labels are in Spanish; the remaining UI text stays in English. All visible component text continues to come from the dictionary. Backend identifiers, RPCs, and schema remain in English.

Each saved share displays To be paid, Awaiting confirmation, or Settled. Only that share's payor sees **I paid** for an unmarked external obligation; only the expense payee sees **Received** after it is marked. The payee's own participating share is already settled and has no payment action. Buttons call the existing `mark_paid` and `confirm_received` RPCs with the share ID; database authorization remains authoritative. No schema changes or new dependencies were needed.

Tab pages show your outstanding balances for that tab, separately in USD and MXN. **Settle up** from the dashboard or a tab opens `/settle`, showing your balances across all tabs plus each outstanding share owed by you or to you, its recipient, currency, expense, status, and permitted action. These are gross obligations, without cancellation or currency conversion. Awaiting payments count until both flags are true. Zero balances display explicitly. Expense/share reads use one embedded query, and unsafe balance aggregates fail through the page's retryable error state.

After a successful action the current page reloads its balances and statuses. **Refresh payments** or a browser reload fetches changes made by another member; live subscriptions are outside this phase. Failed actions retain a retryable button and show a message. Permission/stale-share failures advise reloading the latest shares. Financial edits still recreate shares and reset confirmations through the existing expense RPC.

The desktop/mobile mocked suite checks action permissions, errors, status transitions, self shares, reloads, currency separation, and removal of settled items. `npm run test:auth:local` also signs in two distinct members in separate browser contexts on each viewport: one creates and marks a USD 12.34 obligation, the recipient signs in by magic link and confirms it from Settle up, and the payor refreshes to see Settled. It deletes only its uniquely named expense afterward. The test runner provisions demo members 1�4 if missing and removes only accounts it created.

## Review workflow

One branch and PR per phase. Run lint, type-check, tests, and build; commit; then stop for review before starting the next phase. Phase 0 is on `phase-0-setup`, Phase 1 on `phase-1-core-logic`, Phase 2 on `phase-2-database-security`, Phase 3 on `phase-3-auth`, Phase 4 on `phase-4-tabs-expenses`, and Phase 5 on `phase-5-payment-confirmation`. You will push the local code to https://github.com/CesarNPadilla/FamilySplitter and open each phase's PR. If the preceding phase has not merged, use it as the PR base; otherwise use the branch containing the merged work. Local checks do not establish GitHub CI status.

## Dependency purposes

- React and React DOM: component rendering.
- `@supabase/supabase-js`: magic-link authentication, session persistence/refresh, and member RPC access.
- Supabase CLI (dev only): local service management and migrations; added during local setup after Phase 2.
- Vite and its React plugin: development server and production bundling.
- TypeScript and Node/React type packages: static checks for application and tool configuration.
- Tailwind CSS and its Vite plugin: requested responsive styling.
- ESLint, its JS configuration, TypeScript integration, React hooks/refresh plugins, and globals: linting TypeScript, React, and tooling.
- Prettier: consistent source formatting.
- Vitest: unit tests.
- Playwright: desktop and mobile browser tests.
