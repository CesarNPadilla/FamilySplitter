import { expect, test } from '@playwright/test';
import { messages } from '../../src/i18n';

test('login page renders without horizontal overflow in light and dark mode', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: messages.app.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: messages.auth.loginTitle }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveCSS(
    'background-color',
    'rgb(2, 6, 23)',
  );
});
