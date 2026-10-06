import { expect, test } from '@playwright/test';
import { messages } from '../../src/i18n';
import { family, tabs } from './fixtures/family';

test('built Pages app restores nested routes, links, history, and assets at the repo base', async ({
  page,
}) => {
  if ((page.viewportSize()?.width ?? 1000) < 500)
    await page.setViewportSize({ width: 320, height: 720 });
  await family(page);
  const response = await page.goto(`/FamilySplitter/tabs/${tabs[0].id}`);
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('article', { name: 'Disney universal' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: messages.expenses.add }),
  ).toHaveAttribute('href', `/FamilySplitter/tabs/${tabs[0].id}/new`);
  await page.getByRole('link', { name: messages.expenses.add }).click();
  await expect(
    page.getByLabel(messages.expenses.description, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel(messages.expenses.description, { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: messages.expenses.cancel }).click();
  await expect(
    page.getByRole('article', { name: 'Disney universal' }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByLabel(messages.expenses.description, { exact: true }),
  ).toBeVisible();
  await page.goto('/FamilySplitter/settle');
  await expect(
    page.getByRole('region', { name: messages.payments.balances }),
  ).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveCSS(
    'background-color',
    'rgb(2, 6, 23)',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  for (const button of await page.getByRole('button').all())
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(48);
});

test('Pages login sends the project-root redirect and handles expired links', async ({
  page,
}) => {
  await page.route('**/auth/v1/otp**', (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('redirect_to')).toBe(
      'http://127.0.0.1:5176/FamilySplitter/',
    );
    expect(route.request().postDataJSON().create_user).toBe(false);
    return route.fulfill({ json: {} });
  });
  await page.goto('/FamilySplitter/#error=access_denied');
  await expect(page.getByRole('alert')).toHaveText(messages.auth.invalidLink);
  await page
    .getByLabel(messages.auth.emailLabel)
    .fill('member1@example.invalid');
  await page.getByRole('button', { name: messages.auth.sendLink }).click();
  await expect(page.getByRole('status')).toHaveText(
    messages.auth.genericResponse,
  );
  await expect(page).toHaveURL(/\/FamilySplitter\/login$/);
});
