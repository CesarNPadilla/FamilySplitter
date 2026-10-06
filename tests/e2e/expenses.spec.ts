import { expect, test } from '@playwright/test';
import { messages } from '../../src/i18n';
import { family, ids, tabs } from './fixtures/family';

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

test('payment permissions, two-step balances, reload, and settle-up screen', async ({
  page,
}) => {
  const state = await family(page, 1);
  let fail = true;
  await page.route('**/rest/v1/rpc/mark_paid', (route) => {
    expect(route.request().postDataJSON()).toEqual({ share_id: 'share-0-1' });
    if (fail) return route.fulfill({ status: 403, json: { code: '42501' } });
    state.rows[0].expense_shares[1].payor_marked_paid = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/settle');
  const balances = page.getByRole('region', {
    name: messages.payments.balances,
  });
  await expect(balances).toContainText('You owe: USD 1,000.00');
  await expect(balances).toContainText('You owe: MXN 1,000.00');
  const card = page.getByRole('article', {
    name: 'Disney universal: Member 2',
  });
  await expect(
    card.getByText(messages.payments.statuses['to-be-paid']),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: messages.payments.confirm, exact: true }),
  ).toHaveCount(0);
  await card
    .getByRole('button', { name: messages.payments.mark, exact: true })
    .click();
  await expect(card.getByRole('alert')).toHaveText(messages.payments.denied);
  fail = false;
  await card
    .getByRole('button', { name: messages.payments.mark, exact: true })
    .click();
  await expect(
    card.getByText(messages.payments.statuses['awaiting-confirmation']),
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: messages.payments.mark, exact: true }),
  ).toHaveCount(0);
  await expect(balances).toContainText('You owe: USD 1,000.00');
  await page.reload();
  await expect(
    card.getByText(messages.payments.statuses['awaiting-confirmation']),
  ).toBeVisible();
  state.rows[0].expense_shares[1].payee_confirmed = true;
  await page.getByRole('button', { name: messages.payments.refresh }).click();
  await expect(card).toHaveCount(0);
  await expect(balances).toContainText('You owe: USD 0.00');
  await expect(balances).toContainText('You owe: MXN 1,000.00');
});

test('only the recipient can confirm a marked share and self shares stay settled', async ({
  page,
}) => {
  const state = await family(page);
  await page.route('**/rest/v1/rpc/confirm_received', (route) => {
    expect(route.request().postDataJSON()).toEqual({ share_id: 'share-0-1' });
    state.rows[0].expense_shares[1].payee_confirmed = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto(`/tabs/${tabs[0].id}`);
  const card = page.getByRole('article', { name: 'Disney universal' });
  await expect(card.getByText(messages.payments.statuses.settled)).toHaveCount(
    1,
  );
  await expect(
    card.getByRole('button', { name: messages.payments.mark, exact: true }),
  ).toHaveCount(0);
  await expect(
    card.getByRole('button', { name: messages.payments.confirm, exact: true }),
  ).toHaveCount(0);
  state.rows[0].expense_shares[1].payor_marked_paid = true;
  await page.getByRole('button', { name: messages.payments.refresh }).click();
  await card
    .getByRole('button', { name: messages.payments.confirm, exact: true })
    .click();
  await expect(card.getByText(messages.payments.statuses.settled)).toHaveCount(
    2,
  );
  await expect(
    page.getByRole('region', { name: messages.payments.balances }),
  ).toContainText('Owed to you: USD 0.00');
});

test('an uninvolved member has zero separate balances and no settlement actions', async ({
  page,
}) => {
  await family(page, 4);
  await page.goto('/settle');
  await expect(page.getByText(messages.payments.empty)).toBeVisible();
  const balances = page.getByRole('region', {
    name: messages.payments.balances,
  });
  await expect(balances).toContainText('You owe: USD 0.00');
  await expect(balances).toContainText('Owed to you: MXN 0.00');
  await expect(
    page.getByRole('button', { name: messages.payments.mark, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: messages.payments.confirm, exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
