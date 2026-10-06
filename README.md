# Family Splitter

A mobile-first browser website for five family members sharing travel and property expenses. Phases 0 and 1 provide the development foundation and tested money, splitting, and balance functions. Authentication, database access, and expense/payment screens are not implemented yet. No PWA, service worker, or manifest is included. Hosting remains undecided.

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
```

`npm run test:watch` runs unit tests interactively. `npm run format` formats the project. `npm run preview` serves the production build locally. GitHub Actions runs all checks plus Chromium smoke tests at desktop and mobile sizes. CI results become available after you push this branch and open a PR.

## Structure

- `src/lib/`: pure split, balance, and money modules; Supabase access comes later.
- `src/i18n/`: English dictionary consumed by components; Spanish can be added later.
- `src/components/` and `src/pages/`: future shared UI and application pages.
- `supabase/migrations/` and `supabase/seed.sql`: database work begins in Phase 2.
- `tests/unit/` and `tests/e2e/`: Vitest and Playwright checks.

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

## Review workflow

One branch and PR per phase. Run lint, type-check, tests, and build; commit; then stop for review before starting the next phase. Phase 0 is on `phase-0-setup`; Phase 1 is on `phase-1-core-logic`. You will push the local code to https://github.com/CesarNPadilla/FamilySplitter and open each phase's PR. If Phase 0 has not merged, use it as the Phase 1 PR base; otherwise use the branch containing the merged setup. Local checks do not establish GitHub CI status.

## Dependency purposes

- React and React DOM: component rendering.
- Vite and its React plugin: development server and production bundling.
- TypeScript and Node/React type packages: static checks for application and tool configuration.
- Tailwind CSS and its Vite plugin: requested responsive styling.
- ESLint, its JS configuration, TypeScript integration, React hooks/refresh plugins, and globals: linting TypeScript, React, and tooling.
- Prettier: consistent source formatting.
- Vitest: unit tests.
- Playwright: desktop and mobile browser tests.
