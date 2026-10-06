# Family Splitter

A mobile-first browser website for five family members sharing travel and property expenses. Phase 0 provides the development foundation only. Authentication, database access, expense logic, and payment flows are not implemented yet. No PWA, service worker, or manifest is included. Hosting remains undecided.

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

- `src/lib/`: future pure split, balance, money, and Supabase modules.
- `src/i18n/`: English dictionary consumed by components; Spanish can be added later.
- `src/components/` and `src/pages/`: future shared UI and application pages.
- `supabase/migrations/` and `supabase/seed.sql`: database work begins in Phase 2.
- `tests/unit/` and `tests/e2e/`: Vitest and Playwright checks.

## Agreed financial rules for later phases

Money uses integer cents, with independent USD and MXN balances and no conversion. For equal splits, divide into base shares using integer arithmetic. If the payee participates, assign the entire remainder to their share. Otherwise, sort participants by member ID and assign one extra cent to each of the first remainder participants. Never force payee participation. The live preview will show exact amounts. Custom amounts must sum to the total; percentages must sum to 100.

## Review workflow

One branch and PR per phase. Run lint, type-check, tests, and build; commit; then stop for review before starting the next phase. Phase 0 is on `phase-0-setup`. You will push the local code to https://github.com/CesarNPadilla/FamilySplitter and open the Phase 0 PR.

## Dependency purposes

- React and React DOM: component rendering.
- Vite and its React plugin: development server and production bundling.
- TypeScript and Node/React type packages: static checks for application and tool configuration.
- Tailwind CSS and its Vite plugin: requested responsive styling.
- ESLint, its JS configuration, TypeScript integration, React hooks/refresh plugins, and globals: linting TypeScript, React, and tooling.
- Prettier: consistent source formatting.
- Vitest: unit tests.
- Playwright: desktop and mobile browser tests.
