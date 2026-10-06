# GitHub Pages deployment

The intended production address is `https://cesarnpadilla.github.io/FamilySplitter/`. It is not verified live yet. The production Supabase URL is `https://sopiqxvciwjdjapilhec.supabase.co`. Real member accounts have not been configured yet. Public key configuration, account provisioning, SMTP verification, and a successful GitHub Actions deployment are still required.

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

Apply the checked-in migration to the production project. Do not use the local demo seed or test Auth bootstrap. Add the five real member names and normalized emails through trusted admin access and pre-provision those Auth accounts without passwords, following the README's provisioning instructions. Disable public signup and anonymous signin, keep email signin enabled, and keep email confirmation enabled. The browser continues to use `shouldCreateUser: false` and the existing membership/RLS checks.

In **Authentication → URL Configuration**, set both the **Site URL** and an exact **Redirect URL** to:

```text
https://cesarnpadilla.github.io/FamilySplitter/
```

The trailing slash and project path matter: the app requests that project-root URL. Keep development URLs separate if needed. The app processes the SDK's standard magic-link response; a `{{ .ConfirmationURL }}` link in the magic-link email template keeps that verification flow. Do not substitute a token-hash confirmation endpoint that this app does not implement. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Email delivery

Choose an SMTP provider, verify its sending domain, and configure its recommended SPF/DKIM records. In Supabase Auth's custom SMTP settings, enter the host, port, username, password, sender address, and sender name. Credentials stay in Supabase/provider settings, outside this repository and frontend. Check the provider's delivery logs and Supabase Auth rate limits when testing.

Supabase's built-in mail service restricts recipients to project-team addresses and has low limits; it is unsuitable for production family signins. See [Supabase custom SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp). Provider selection and credentials remain pending.

## Verify the live release

After the workflow succeeds, open its reported Pages URL on desktop and a physical phone. Request a magic link with a real allowlisted email, verify actual delivery, follow it, reload a nested tab URL, and confirm session persistence. Add a small uniquely named test expense, mark it as paid with one member, sign in as the recipient to confirm it, and verify the settled status and separate currency balances. Delete only that test expense afterward. An unknown email must get the generic response without account creation. Sign out and verify protected routes return to login.

Phase 6 is complete only after GitHub CI is green and this live verification succeeds. No production deployment or hosted account/email configuration has been performed yet.
