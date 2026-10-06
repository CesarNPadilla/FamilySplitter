import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { messages } from '../../src/i18n';

async function inboxLink(
  request: APIRequestContext,
  email: string,
  after: number,
): Promise<string> {
  const root = process.env.TEST_MAIL_URL!;
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${root}api/v1/search`, {
          params: { query: `to:${email}` },
        });
        if (!response.ok()) return false;
        const result = (await response.json()) as {
          messages: { ID: string; Created: string }[];
        };
        const latest = result.messages.find(
          (item) => Date.parse(item.Created) >= after - 1000,
        );
        if (!latest) return false;
        const detail = await request.get(`${root}api/v1/message/${latest.ID}`);
        const message = (await detail.json()) as { HTML: string; Text: string };
        link = (message.HTML || message.Text)
          .match(/https?:\/\/[^\s"<>]*\/auth\/v1\/verify\?[^\s"<>]+/)?.[0]
          ?.replaceAll('&amp;', '&');
        return Boolean(link);
      },
      { timeout: 15000, message: 'Expected a captured local magic-link email' },
    )
    .toBe(true);
  return link!;
}

async function requestAndFollow(
  page: Page,
  request: APIRequestContext,
  email: string,
) {
  const after = Date.now();
  await page.getByLabel(messages.auth.emailLabel).fill(email);
  await page.getByRole('button', { name: messages.auth.sendLink }).click();
  await expect(page.getByRole('status')).toHaveText(
    messages.auth.genericResponse,
  );
  const link = await inboxLink(request, email, after);
  // Keep token-bearing URLs out of assertions and traces.
  const response = await request.get(link, { maxRedirects: 0 });
  const destination = response.headers().location;
  if (!destination) throw new Error('Local magic link did not redirect.');
  await page.goto(destination);
}

test('real magic link, linking, persistence, sign-out, and outsider denial', async ({
  page,
  request,
}, testInfo) => {
  if (!process.env.TEST_RUN_ID)
    throw new Error('Run through npm run test:auth:local.');
  const email =
    testInfo.project.name === 'mobile'
      ? 'member2@example.invalid'
      : 'member1@example.invalid';
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { name: messages.auth.loginTitle }),
  ).toBeVisible();
  await page
    .getByLabel(messages.auth.emailLabel)
    .fill(
      `phase3-${process.env.TEST_RUN_ID}-unknown-${testInfo.project.name}@example.invalid`,
    );
  await page.getByRole('button', { name: messages.auth.sendLink }).click();
  await expect(page.getByRole('status')).toHaveText(
    messages.auth.genericResponse,
  );
  await requestAndFollow(page, request, email);
  await expect(
    page.getByRole('heading', { name: messages.dashboard.title }),
  ).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: messages.dashboard.title }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: messages.auth.signOut, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: messages.auth.loginTitle }),
  ).toBeVisible();
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { name: messages.auth.loginTitle }),
  ).toBeVisible();
  const outsider =
    testInfo.project.name === 'mobile'
      ? process.env.TEST_OUTSIDER_MOBILE!
      : process.env.TEST_OUTSIDER_DESKTOP!;
  await requestAndFollow(page, request, outsider);
  await expect(page.getByRole('alert')).toHaveText(messages.auth.denied);
  await expect(
    page.getByRole('heading', { name: messages.dashboard.title }),
  ).toHaveCount(0);
  const noRows = await page.evaluate(
    async ({ api, anon }) => {
      const stored = JSON.parse(
        localStorage.getItem('family-splitter-auth') ?? '{}',
      ) as { access_token?: string };
      const response = await fetch(`${api}/rest/v1/expenses?select=id`, {
        headers: {
          apikey: anon,
          Authorization: `Bearer ${stored.access_token}`,
        },
      });
      const data: unknown = await response.json();
      return response.ok && Array.isArray(data) && data.length === 0;
    },
    {
      api: process.env.VITE_SUPABASE_URL!,
      anon: process.env.VITE_SUPABASE_ANON_KEY!,
    },
  );
  expect(noRows).toBe(true);
  await page
    .getByRole('button', { name: messages.auth.signOut, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: messages.auth.loginTitle }),
  ).toBeVisible();
});
