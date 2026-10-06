import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Browser,
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

test('real auth, expense CRUD, exact splits, persistence, and outsider denial', async ({
  page,
  request,
  browser,
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
  // Exercise real expense reads/writes before signing out (Phase 4).
  await verifyPayments(page, request, browser, testInfo.project.name);
  await verifyExpenses(page, testInfo.project.name);
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

async function verifyExpenses(page: Page, project: string) {
  const travelId = '00000000-0000-0000-0000-000000000101';
  const propertyId = '00000000-0000-0000-0000-000000000102';
  const cases = [
    {
      tabId: travelId,
      title: 'Disney universal',
      amount: '2000.00',
      currency: 'USD',
      count: 2,
    },
    {
      tabId: propertyId,
      title: 'House title',
      amount: '3000.00',
      currency: 'MXN',
      count: 3,
    },
  ];
  for (const example of cases) {
    const title = `phase4-${process.env.TEST_RUN_ID}-${project}-${example.title}`;
    await page.goto(`/tabs/${example.tabId}/new`);
    await page
      .getByLabel(messages.expenses.description, { exact: true })
      .fill(title);
    await page
      .getByLabel(messages.expenses.amount, { exact: true })
      .fill(example.amount);
    await page
      .getByLabel(messages.expenses.currency, { exact: true })
      .selectOption(example.currency);
    await page
      .getByLabel(messages.expenses.paidBy, { exact: true })
      .selectOption('00000000-0000-0000-0000-000000000001');
    for (let index = 1; index <= 5; index++)
      await page
        .getByRole('checkbox', { name: `Member ${index}`, exact: true })
        .setChecked(index <= example.count);
    await expect(
      page
        .getByRole('list', { name: messages.expenses.preview })
        .getByText(`${example.currency} 1,000.00`, { exact: true }),
    ).toHaveCount(example.count);
    await page
      .getByRole('button', { name: messages.expenses.save, exact: true })
      .click();
    const card = page.getByRole('article', { name: title });
    await expect(card).toBeVisible();
    await expect(
      card
        .getByRole('list', { name: messages.expenses.shares })
        .getByText(`${example.currency} 1,000.00`, { exact: true }),
    ).toHaveCount(example.count);
    await page.reload();
    await expect(card).toBeVisible();
    if (example.currency === 'USD') {
      await card.getByRole('link', { name: messages.expenses.edit }).click();
      await page
        .getByLabel(messages.expenses.amount, { exact: true })
        .fill('100.00');
      await page
        .getByRole('checkbox', { name: 'Member 1', exact: true })
        .uncheck();
      await page
        .getByRole('checkbox', { name: 'Member 3', exact: true })
        .check();
      await page
        .getByRole('checkbox', { name: 'Member 4', exact: true })
        .check();
      await expect(
        page
          .getByRole('list', { name: messages.expenses.preview })
          .getByText('USD 33.34'),
      ).toHaveCount(1);
      await expect(
        page
          .getByRole('list', { name: messages.expenses.preview })
          .getByText('USD 33.33'),
      ).toHaveCount(2);
      await page
        .getByRole('button', { name: messages.expenses.saveChanges })
        .click();
      await expect(
        card
          .getByRole('list', { name: messages.expenses.shares })
          .getByText('USD 33.34'),
      ).toHaveCount(1);
      await expect(
        card
          .getByRole('list', { name: messages.expenses.shares })
          .getByText('USD 33.33'),
      ).toHaveCount(2);
    }
    await card
      .getByRole('button', { name: messages.expenses.delete, exact: true })
      .click();
    await card
      .getByRole('button', { name: messages.expenses.confirmDelete })
      .click();
    await expect(card).toHaveCount(0);
  }
  // High-precision percentage strings survive PostgREST reads and edit prefills.
  const title = `phase4-${process.env.TEST_RUN_ID}-${project}-precision`;
  await page.goto(`/tabs/${travelId}/new`);
  await page
    .getByLabel(messages.expenses.description, { exact: true })
    .fill(title);
  await page
    .getByLabel(messages.expenses.amount, { exact: true })
    .fill('100.00');
  await page.getByLabel(messages.expenses.splitMode).selectOption('percentage');
  await page.getByRole('checkbox', { name: 'Member 1', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Member 2', exact: true }).check();
  await page
    .getByLabel('Member 1 percentage (%)', { exact: true })
    .fill('99.999999999999999999');
  await page
    .getByLabel('Member 2 percentage (%)', { exact: true })
    .fill('0.000000000000000001');
  await page
    .getByRole('button', { name: messages.expenses.save, exact: true })
    .click();
  const card = page.getByRole('article', { name: title });
  await card.getByRole('link', { name: messages.expenses.edit }).click();
  await expect(
    page.getByLabel('Member 1 percentage (%)', { exact: true }),
  ).toHaveValue('99.999999999999999999');
  await expect(
    page.getByLabel('Member 2 percentage (%)', { exact: true }),
  ).toHaveValue('0.000000000000000001');
  await page.getByLabel(messages.expenses.splitMode).selectOption('custom');
  await page.getByLabel('Member 1 amount', { exact: true }).fill('75.00');
  await page.getByLabel('Member 2 amount', { exact: true }).fill('25.00');
  await expect(
    page.getByRole('list', { name: messages.expenses.preview }),
  ).toContainText('USD 75.00');
  await page
    .getByRole('button', { name: messages.expenses.saveChanges })
    .click();
  await expect(
    card.getByRole('list', { name: messages.expenses.shares }),
  ).toContainText('USD 75.00');
  await expect(
    card.getByRole('list', { name: messages.expenses.shares }),
  ).toContainText('USD 25.00');
  await card.getByRole('link', { name: messages.expenses.edit }).click();
  await expect(page.getByLabel('Member 1 amount', { exact: true })).toHaveValue(
    '75.00',
  );
  await expect(page.getByLabel('Member 2 amount', { exact: true })).toHaveValue(
    '25.00',
  );
  await page.getByRole('link', { name: messages.expenses.cancel }).click();
  await card
    .getByRole('button', { name: messages.expenses.delete, exact: true })
    .click();
  await card
    .getByRole('button', { name: messages.expenses.confirmDelete })
    .click();
  await expect(card).toHaveCount(0);
  // New tabs use the existing membership-checked RPC.
  await page.getByRole('link', { name: messages.expenses.backToTabs }).click();
  const tabName = `phase4-${process.env.TEST_RUN_ID}-${project}-tab`;
  await page.getByLabel(messages.dashboard.newTab).fill(tabName);
  await page
    .getByRole('button', { name: messages.dashboard.createTab })
    .click();
  await expect(
    page.getByRole('heading', { name: tabName, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(messages.expenses.empty)).toBeVisible();
  await page.getByRole('link', { name: messages.expenses.backToTabs }).click();
  await expect(
    page.getByRole('heading', { name: messages.dashboard.title }),
  ).toBeVisible();
}

async function verifyPayments(
  page: Page,
  request: APIRequestContext,
  browser: Browser,
  project: string,
) {
  const actor = project === 'mobile' ? 2 : 1;
  const recipient = project === 'mobile' ? 4 : 3;
  const tabId = '00000000-0000-0000-0000-000000000101';
  const title = `phase4-${process.env.TEST_RUN_ID}-${project}-two-step`;
  await page.goto(`/tabs/${tabId}/new`);
  await page
    .getByLabel(messages.expenses.description, { exact: true })
    .fill(title);
  await page
    .getByLabel(messages.expenses.amount, { exact: true })
    .fill('12.34');
  await page
    .getByLabel(messages.expenses.paidBy, { exact: true })
    .selectOption(`00000000-0000-0000-0000-00000000000${recipient}`);
  await page
    .getByRole('button', { name: messages.expenses.save, exact: true })
    .click();
  const card = page.getByRole('article', { name: title });
  await expect(
    card.getByText(messages.payments.statuses['to-be-paid']),
  ).toBeVisible();
  await card
    .getByRole('button', { name: messages.payments.mark, exact: true })
    .click();
  await expect(
    card.getByText(messages.payments.statuses['awaiting-confirmation']),
  ).toBeVisible();
  await page.reload();
  await expect(
    card.getByText(messages.payments.statuses['awaiting-confirmation']),
  ).toBeVisible();
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5173',
    ...(project === 'mobile'
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        }
      : {}),
  });
  try {
    const other = await context.newPage();
    await other.goto('/login');
    await requestAndFollow(
      other,
      request,
      `member${recipient}@example.invalid`,
    );
    await expect(
      other.getByRole('heading', { name: messages.dashboard.title }),
    ).toBeVisible();
    await other.goto('/settle');
    const pending = other.getByRole('article', {
      name: `${title}: Member ${actor}`,
    });
    await expect(pending.getByText('USD 12.34', { exact: true })).toBeVisible();
    await expect(
      pending.getByRole('button', {
        name: messages.payments.mark,
        exact: true,
      }),
    ).toHaveCount(0);
    await pending
      .getByRole('button', { name: messages.payments.confirm, exact: true })
      .click();
    await expect(pending).toHaveCount(0);
    await other.reload();
    await expect(pending).toHaveCount(0);
    await page.getByRole('button', { name: messages.payments.refresh }).click();
    await expect(
      card.getByText(messages.payments.statuses.settled),
    ).toBeVisible();
    await expect(
      card.getByRole('button', { name: messages.payments.mark, exact: true }),
    ).toHaveCount(0);
    await card
      .getByRole('button', { name: messages.expenses.delete, exact: true })
      .click();
    await card
      .getByRole('button', { name: messages.expenses.confirmDelete })
      .click();
    await expect(card).toHaveCount(0);
    await other
      .getByRole('button', { name: messages.auth.signOut, exact: true })
      .click();
  } finally {
    await context.close();
  }
}
