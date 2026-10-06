# GitHub Pages deployment

The intended production address is `https://cesarnpadilla.github.io/FamilySplitter/`. It is not verified live yet. The production Supabase URL is `https://sopiqxvciwjdjapilhec.supabase.co`. The schema and three-member allowlist have been applied, with RLS on all app tables. The three passwordless Auth accounts have been provisioned. Public signup is disabled; anonymous signin is disabled; email signin and confirmation are enabled. The production Site URL and exact Pages redirect are saved. Custom SMTP is enabled through Resend, and public production configuration is saved in a Git-ignored local environment file. Login email delivery has been confirmed by the user. The repository is public after removing historical Supabase runtime files, Pages uses GitHub Actions, and the production repository variables are configured. A successful GitHub Actions deployment and live signin verification are still required.

## GitHub setup

Merge the approved phases into the repository's default branch. The deployment workflow uses the repository's actual default branch rather than assuming `main`. You can also dispatch **Deploy GitHub Pages** manually on that branch. Runs from other branches skip deployment.

In the repository's **Settings → Pages**, select **GitHub Actions** as the source. Under **Settings → Secrets and variables → Actions → Variables**, add:

| Repository variable      | Value                                      |
| ------------------------ | ------------------------------------------ |
| `VITE_SUPABASE_URL`      | `https://sopiqxvciwjdjapilhec.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Its public anon JWT or publishable key     |

These values are public browser configuration, baked into the build. Service-role/secret keys and SMTP credentials never belong here. Changing variables requires a new deployment. The workflow rejects missing configuration, loopback URLs, and privileged key formats before building.

The workflow runs lint, typecheck, formatting, unit tests, mocked browser tests, database security tests, and the built Pages tests before publishing `dist`. It uses a `github-pages` environment and deployment permissions only where required. If GitHub requests environment approval, complete it in the Actions run. GitHub CI status and deployment success must be checked there; passing local tests does not establish either.

See [GitHub's custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite's Pages deployment guide](https://vite.dev/guide/static-deploy.html#github-pages).

## Paths and static fallback

`npm run build:pages` builds with `/FamilySplitter/` as the Vite base, then creates `dist/404.html` and `.nojekyll`. App links, history navigation, and email redirects use that base. Local development still uses `/`.

GitHub Pages does not provide a server-side SPA rewrite. A direct nested URL such as `/FamilySplitter/settle` receives the custom 404 document with HTTP 404, then renders the app normally. No redirect shim touches the URL or Auth fragment. In-app navigation and the project root load normally; the HTTP 404 on direct nested requests is a hosting limitation. A future custom-domain/root deployment needs an updated base and redirect configuration.

`npm run test:pages` builds with fake public test configuration and serves the exact output through a local server that returns this same 404 fallback. It checks desktop/mobile nested links, reloads, history, assets, and the project-root sign-in redirect. It overwrites local `dist` with a test build; run `npm run build:pages` with real public configuration before uploading a build manually. It does not deploy or contact a hosted project.

## Production Supabase

Apply the checked-in migration to the production project. Do not use the local demo seed or test Auth bootstrap. Start with three members: Cesar Nieto, Ivan Nieto, and Alejandro Nieto. Cesar is the primary contact only; all three have identical permissions. No admin role or schema change is needed. Participant choices come from the members table, so the UI supports three without code changes.

The private local file `supabase/production-members.local.sql` contains the approved names/emails. It is Git-ignored so personal email addresses are not published with the code. Run it as the project owner in this production project's SQL editor after the migration. It inserts missing members by email, preserves existing IDs/Auth links, and stops without changes if unrelated members or demo rows already exist. Do not run it against the local five-member test fixtures.

The dashboard's Create user form requires a password, so use the trusted admin script instead. After `npx supabase login`, run `npm run auth:provision:production`. The private `supabase/production-members.local.json` holds the approved names/emails; keep it outside Git. The script checks the exact production project and allowlist before creating missing accounts with no password or invitation email. Existing accounts are preserved. It captures the existing service-role key from the CLI in Node memory only. First magic-link signin still proves email ownership and links the member.

These three Auth accounts must be pre-provisioned before the family can sign in. The allowlist SQL alone does not create Auth users or send email. Disable public signup and anonymous signin, keep email signin enabled, and keep email confirmation enabled. The browser continues to use `shouldCreateUser: false` and the existing membership/RLS checks.

In **Authentication → URL Configuration**, set both the **Site URL** and an exact **Redirect URL** to:

```text
https://cesarnpadilla.github.io/FamilySplitter/
```

The trailing slash and project path matter: the app requests that project-root URL. Keep development URLs separate if needed. The app processes the SDK's standard magic-link response; a `{{ .ConfirmationURL }}` link in the magic-link email template keeps that verification flow. Do not substitute a token-hash confirmation endpoint that this app does not implement. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Email delivery

Choose an SMTP provider, verify its sending domain, and configure its recommended SPF/DKIM records. In Supabase Auth's custom SMTP settings, enter the host, port, username, password, sender address, and sender name. Credentials stay in Supabase/provider settings, outside this repository and frontend. Check the provider's delivery logs and Supabase Auth rate limits when testing.

Supabase's built-in mail service restricts recipients to project-team addresses and has low limits; it is unsuitable for production family signins. See [Supabase custom SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp). Resend is configured with the verified sending domain `auth.cesarnieto.me`, host `smtp.resend.com`, port `465`, and sender name `Cuentas Claras - Familia Nieto`. The user saved the SMTP credentials directly in Supabase. The user confirmed receipt of a test login email.

## Verify the live release

After the workflow succeeds, open its reported Pages URL on desktop and a physical phone. Request a magic link with a real allowlisted email, verify actual delivery, follow it, reload a nested tab URL, and confirm session persistence. Add a small uniquely named test expense, mark it as paid with one member, sign in as the recipient to confirm it, and verify the settled status and separate currency balances. Delete only that test expense afterward. An unknown email must get the generic response without account creation. Sign out and verify protected routes return to login.

Phase 6 is complete only after GitHub CI is green and this live verification succeeds. The production database and Auth access/redirect settings are configured. The three passwordless Auth accounts and custom SMTP are configured. Email delivery is confirmed. Pages publishing and live verification remain pending.
