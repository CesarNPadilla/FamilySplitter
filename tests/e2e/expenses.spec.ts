import { expect, test, type Page } from '@playwright/test';
import { messages } from '../../src/i18n';
import { splitEqual } from '../../src/lib/split';

const ids = Array.from(
  { length: 5 },
  (_, index) => `00000000-0000-0000-0000-00000000000${index + 1}`,
);
const tabs = [
  { id: '00000000-0000-0000-0000-000000000101', name: 'Travel to California' },
  { id: '00000000-0000-0000-0000-000000000102', name: 'Property Expenses' },
];
const members = ids.map((id, index) => ({ id, name: `Member ${index + 1}` }));
interface Row {
  id: string;
  tab_id: string;
  description: string;
  total_cents: number;
  currency: string;
  paid_by: string;
  created_by: string;
  split_mode: string;
  expense_shares: {
    id: string;
    member_id: string;
    amount_cents: number;
    percentage: string | null;
    payor_marked_paid: boolean;
    payee_confirmed: boolean;
  }[];
}
const seed = (
  tab: number,
  total: number,
  participants: string[],
  description: string,
): Row => ({
  id: `00000000-0000-0000-0000-00000000020${tab + 1}`,
  tab_id: tabs[tab].id,
  description,
  total_cents: total,
  currency: tab === 0 ? 'USD' : 'MXN',
  paid_by: ids[0],
  created_by: ids[0],
  split_mode: 'equal',
  expense_shares: splitEqual(total, participants, ids[0]).map(
    (share, index) => ({
      id: `share-${tab}-${index}`,
      member_id: share.memberId,
      amount_cents: share.amountCents,
      percentage: null,
      payor_marked_paid: share.payorMarkedPaid,
      payee_confirmed: share.payeeConfirmed,
    }),
  ),
});

async function family(page: Page, actor = 0) {
  const user = {
    id: `10000000-0000-0000-0000-00000000000${actor + 1}`,
    aud: 'authenticated',
    role: 'authenticated',
    email: `member${actor + 1}@example.invalid`,
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-10-06T00:00:00Z',
  };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString('base64url')}.test-signature`;
  await page.addInitScript(
    (value) =>
      localStorage.setItem('family-splitter-auth', JSON.stringify(value)),
    {
      access_token: token,
      refresh_token: 'fake-refresh',
      expires_at: expires,
      expires_in: 3600,
      token_type: 'bearer',
      user,
    },
  );
  const state = {
    rows: [
      seed(0, 200000, ids.slice(0, 2), 'Disney universal'),
      seed(1, 300000, ids.slice(0, 3), 'House title'),
    ],
    writes: [] as Record<string, unknown>[],
    failSave: false,
  };
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: user }));
  await page.route('**/rest/v1/rpc/link_current_member', (route) =>
    route.fulfill({ json: ids[actor] }),
  );
  await page.route('**/rest/v1/members?**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.has('auth_user_id')
        ? { ...members[actor], email: user.email, auth_user_id: user.id }
        : members,
    }),
  );
  await page.route('**/rest/v1/expense_tabs?**', (route) => {
    const tabId = new URL(route.request().url()).searchParams
      .get('id')
      ?.slice(3);
    return route.fulfill({
      json: tabId ? tabs.find((tab) => tab.id === tabId) : tabs,
    });
  });
  await page.route('**/rest/v1/expenses?**', (route) => {
    const tabId = new URL(route.request().url()).searchParams
      .get('tab_id')
      ?.slice(3);
    return route.fulfill({
      json: state.rows.filter((row) => row.tab_id === tabId),
    });
  });
  await page.route('**/rest/v1/rpc/save_expense', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    state.writes.push(body);
    if (state.failSave)
      return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    const id =
      (body.p_expense_id as string | null) ??
      '00000000-0000-0000-0000-000000000299';
    const selected = (body.p_shares as { member_id: string }[]).map(
      (item) => item.member_id,
    );
    const row: Row = {
      id,
      tab_id: body.p_tab_id as string,
      description: body.p_description as string,
      total_cents: body.p_total_cents as number,
      currency: body.p_currency as string,
      paid_by: body.p_paid_by as string,
      created_by: ids[actor],
      split_mode: body.p_split_mode as string,
      expense_shares: splitEqual(
        body.p_total_cents as number,
        selected,
        body.p_paid_by as string,
      ).map((share, index) => ({
        id: `${id}-${index}`,
        member_id: share.memberId,
        amount_cents: share.amountCents,
        percentage: null,
        payor_marked_paid: share.payorMarkedPaid,
        payee_confirmed: share.payeeConfirmed,
      })),
    };
    state.rows = [...state.rows.filter((old) => old.id !== id), row];
    return route.fulfill({ json: id });
  });
  await page.route('**/rest/v1/rpc/delete_expense', (route) => {
    const { p_expense_id: id } = route.request().postDataJSON() as {
      p_expense_id: string;
    };
    state.rows = state.rows.filter((row) => row.id !== id);
    return route.fulfill({ status: 204 });
  });
  return state;
}

test('dashboard and tab show both examples with exact separate currencies', async ({
  page,
}) => {
  await family(page);
  await page.goto('/dashboard');
  await page.getByRole('link', { name: tabs[0].name }).click();
  const travel = page.getByRole('article', { name: 'Disney universal' });
  await expect(travel).toContainText('USD 2,000.00');
  await expect(
    travel
      .getByRole('list', { name: messages.expenses.shares })
      .getByText('USD 1,000.00', { exact: true }),
  ).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('heading', { name: tabs[0].name })).toBeVisible();
  await page.getByRole('link', { name: messages.expenses.backToTabs }).click();
  await page.getByRole('link', { name: tabs[1].name }).click();
  const property = page.getByRole('article', { name: 'House title' });
  await expect(property).toContainText('MXN 3,000.00');
  await expect(
    property
      .getByRole('list', { name: messages.expenses.shares })
      .getByText('MXN 1,000.00', { exact: true }),
  ).toHaveCount(3);
});

test('primary equal split previews stable remainders, saves cents, edits, and deletes', async ({
  page,
}) => {
  const state = await family(page);
  await page.goto(`/tabs/${tabs[0].id}/new`);
  await page
    .getByLabel(messages.expenses.description, { exact: true })
    .fill('Test rounding');
  await page
    .getByLabel(messages.expenses.amount, { exact: true })
    .fill('100.00');
  await expect(page.getByLabel(messages.expenses.splitMode)).toHaveValue(
    'equal',
  );
  await page.getByRole('checkbox', { name: 'Member 1', exact: true }).uncheck();
  for (const name of ['Member 4', 'Member 3', 'Member 2'])
    await page.getByRole('checkbox', { name, exact: true }).check();
  const preview = page.getByRole('list', { name: messages.expenses.preview });
  await expect(preview.getByText('USD 33.34')).toHaveCount(1);
  await expect(preview.getByText('USD 33.33')).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await page
        .getByRole('checkbox', { name: 'Member 2', exact: true })
        .locator('..')
        .boundingBox()
    )?.height,
  ).toBeGreaterThanOrEqual(48);
  await page
    .getByRole('button', { name: messages.expenses.save, exact: true })
    .click();
  const saved = page.getByRole('article', { name: 'Test rounding' });
  await expect(saved).toBeVisible();
  expect(state.writes[0].p_total_cents).toBe(10000);
  expect(state.writes[0].p_shares).toEqual(
    ids.slice(1, 4).map((member_id) => ({ member_id })),
  );
  await saved.getByRole('link', { name: messages.expenses.edit }).click();
  await expect(
    page.getByLabel(messages.expenses.amount, { exact: true }),
  ).toHaveValue('100.00');
  await page.getByLabel(messages.expenses.amount, { exact: true }).fill('0.01');
  await expect(
    page
      .getByRole('list', { name: messages.expenses.preview })
      .getByText('USD 0.01'),
  ).toHaveCount(1);
  await page
    .getByRole('button', { name: messages.expenses.saveChanges })
    .click();
  await expect(saved).toContainText('USD 0.01');
  await saved
    .getByRole('button', { name: messages.expenses.delete, exact: true })
    .click();
  await saved.getByRole('button', { name: messages.expenses.cancel }).click();
  await expect(saved).toBeVisible();
  await saved
    .getByRole('button', { name: messages.expenses.delete, exact: true })
    .click();
  await saved
    .getByRole('button', { name: messages.expenses.confirmDelete })
    .click();
  await expect(saved).toHaveCount(0);
});

test('custom and percentage validation blocks invalid saves and selection stays unique', async ({
  page,
}) => {
  const state = await family(page);
  await page.goto(`/tabs/${tabs[0].id}/new`);
  await page
    .getByLabel(messages.expenses.description, { exact: true })
    .fill('Custom');
  await page
    .getByLabel(messages.expenses.amount, { exact: true })
    .fill('100.00');
  await page.getByRole('checkbox', { name: 'Member 2', exact: true }).check();
  await page.getByLabel(messages.expenses.splitMode).selectOption('custom');
  await page.getByLabel('Member 1 amount', { exact: true }).fill('75');
  await page.getByLabel('Member 2 amount', { exact: true }).fill('24.99');
  await expect(page.getByText(messages.validation.customInvalid)).toBeVisible();
  await expect(
    page.getByRole('button', { name: messages.expenses.save, exact: true }),
  ).toBeDisabled();
  expect(state.writes).toHaveLength(0);
  await page.getByLabel('Member 2 amount', { exact: true }).fill('25');
  await expect(
    page.getByRole('list', { name: messages.expenses.preview }),
  ).toContainText('USD 75.00');
  await page.getByLabel(messages.expenses.splitMode).selectOption('percentage');
  await page.getByLabel('Member 1 percentage (%)', { exact: true }).fill('50');
  await page.getByLabel('Member 2 percentage (%)', { exact: true }).fill('49');
  await expect(
    page.getByRole('button', { name: messages.expenses.save, exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Member 2 percentage (%)', { exact: true }).fill('50');
  await expect(
    page
      .getByRole('list', { name: messages.expenses.preview })
      .getByText('USD 50.00'),
  ).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    await page
      .getByRole('checkbox', { name: 'Member 2', exact: true })
      .uncheck();
    await page.getByRole('checkbox', { name: 'Member 2', exact: true }).check();
  }
  await expect(
    page
      .getByRole('list', { name: messages.expenses.preview })
      .getByRole('listitem'),
  ).toHaveCount(2);
});

test('unauthorized edit routes and controls are blocked for another participant', async ({
  page,
}) => {
  await family(page, 1);
  await page.goto(`/tabs/${tabs[0].id}`);
  await expect(
    page.getByRole('article', { name: 'Disney universal' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: messages.expenses.edit }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: messages.expenses.delete, exact: true }),
  ).toHaveCount(0);
  await page.goto(
    `/tabs/${tabs[0].id}/expenses/00000000-0000-0000-0000-000000000201/edit`,
  );
  await expect(page.getByRole('alert')).toHaveText(
    messages.expenses.writeDenied,
  );
  await expect(
    page.getByRole('button', { name: messages.expenses.saveChanges }),
  ).toHaveCount(0);
});

test('a failed save preserves entries and can be retried', async ({ page }) => {
  const state = await family(page);
  state.failSave = true;
  await page.goto(`/tabs/${tabs[0].id}/new`);
  await page
    .getByLabel(messages.expenses.description, { exact: true })
    .fill('Retry me');
  await page.getByLabel(messages.expenses.amount, { exact: true }).fill('2000');
  await page
    .getByRole('button', { name: messages.expenses.save, exact: true })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    messages.expenses.saveFailed,
  );
  await expect(
    page.getByLabel(messages.expenses.amount, { exact: true }),
  ).toHaveValue('2000');
  state.failSave = false;
  await page
    .getByRole('button', { name: messages.expenses.save, exact: true })
    .click();
  await expect(page.getByRole('article', { name: 'Retry me' })).toBeVisible();
});

test('an authorization change during editing is enforced by the RPC', async ({
  page,
}) => {
  await family(page);
  await page.route('**/rest/v1/rpc/save_expense', (route) =>
    route.fulfill({
      status: 403,
      json: { code: '42501', message: 'Access denied' },
    }),
  );
  await page.goto(
    `/tabs/${tabs[0].id}/expenses/00000000-0000-0000-0000-000000000201/edit`,
  );
  await page
    .getByLabel(messages.expenses.description, { exact: true })
    .fill('Access changed');
  await page
    .getByRole('button', { name: messages.expenses.saveChanges })
    .click();
  await expect(page.getByRole('alert')).toHaveText(
    messages.expenses.writeDenied,
  );
  await expect(
    page.getByLabel(messages.expenses.description, { exact: true }),
  ).toHaveValue('Access changed');
});

test('a tab-list load failure can retry into the empty state', async ({
  page,
}) => {
  await family(page);
  let failing = true;
  await page.route('**/rest/v1/expense_tabs?**', (route) =>
    route.fulfill(
      failing
        ? { status: 403, json: { message: 'Unavailable' } }
        : { json: [] },
    ),
  );
  await page.goto('/dashboard');
  await expect(page.getByRole('alert')).toHaveText(
    messages.expenses.loadFailed,
  );
  failing = false;
  await page.getByRole('button', { name: messages.auth.retry }).click();
  await expect(page.getByText(messages.dashboard.empty)).toBeVisible();
});
