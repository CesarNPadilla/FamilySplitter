import { expect, test, type Page } from '@playwright/test';
import { messages } from '../../src/i18n';

const user = {
  id: '10000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'member1@example.invalid',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-10-06T00:00:00Z',
};
const member = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Member 1',
  email: user.email,
  auth_user_id: user.id,
};

async function session(page: Page) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString('base64url')}.test-signature`;
  await page.addInitScript(
    (value) => {
      if (!sessionStorage.getItem('test-session-initialized')) {
        localStorage.setItem('family-splitter-auth', JSON.stringify(value));
        sessionStorage.setItem('test-session-initialized', 'true');
      }
    },
    {
      access_token: token,
      refresh_token: 'test-refresh-token',
      expires_at: expires,
      expires_in: 3600,
      token_type: 'bearer',
      user,
    },
  );
}

async function memberApi(page: Page, denied = false) {
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: user }));
  await page.route('**/rest/v1/rpc/link_current_member', (route) =>
    route.fulfill(
      denied
        ? { status: 403, json: { code: '42501', message: 'Access denied' } }
        : { json: member.id },
    ),
  );
  await page.route('**/rest/v1/members?**', (route) =>
    route.fulfill({ json: member }),
  );
  await page.route('**/auth/v1/logout?**', (route) =>
    route.fulfill({ status: 204 }),
  );
}

test('unauthenticated dashboard access redirects to login', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { name: messages.auth.loginTitle }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole('heading', { name: messages.dashboard.title }),
  ).toHaveCount(0);
});

test('known and unknown emails get identical responses and cannot create accounts', async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/auth/v1/otp**', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    await route.fulfill(
      body.email === user.email
        ? { json: {} }
        : {
            status: 400,
            json: { error_code: 'otp_disabled', msg: 'Signups not allowed' },
          },
    );
  });
  await page.goto('/login');
  for (const email of [user.email, 'outsider@example.invalid']) {
    await page.getByLabel(messages.auth.emailLabel).fill(email);
    await page.getByRole('button', { name: messages.auth.sendLink }).click();
    await expect(page.getByRole('status')).toHaveText(
      messages.auth.genericResponse,
    );
  }
  expect(requests).toHaveLength(2);
  expect(requests.every((item) => item.create_user === false)).toBe(true);
});

test('valid membership persists across reload and sign-out protects later visits', async ({
  page,
}) => {
  await session(page);
  await memberApi(page);
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { name: messages.dashboard.title }),
  ).toBeVisible();
  await expect(page.getByText(member.email, { exact: true })).toBeVisible();
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
});

test('authenticated non-member cannot render protected content', async ({
  page,
}) => {
  await session(page);
  await memberApi(page, true);
  await page.goto('/dashboard');
  await expect(page.getByRole('alert')).toHaveText(messages.auth.denied);
  await expect(
    page.getByRole('heading', { name: messages.dashboard.title }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/);
  await page
    .getByRole('button', { name: messages.auth.signOut, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: messages.auth.loginTitle }),
  ).toBeVisible();
});

test('invalid magic link shows a safe recovery message', async ({ page }) => {
  await page.goto(
    '/auth/callback#error=access_denied&error_code=otp_expired&error_description=Sensitive+provider+detail',
  );
  await expect(
    page.getByRole('heading', { name: messages.auth.loginTitle }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(messages.auth.invalidLink);
  await expect(page.getByText('Sensitive provider detail')).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/);
});

test('transient member lookup error offers retry without leaking protected content', async ({
  page,
}) => {
  await session(page);
  await memberApi(page);
  let calls = 0;
  await page.route('**/rest/v1/rpc/link_current_member', (route) => {
    calls++;
    return route.fulfill(
      calls === 1
        ? { status: 503, json: { code: '503', message: 'Internal detail' } }
        : { json: member.id },
    );
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('alert')).toHaveText(messages.auth.unavailable);
  await expect(
    page.getByRole('heading', { name: messages.dashboard.title }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: messages.auth.retry }).click();
  await expect(
    page.getByRole('heading', { name: messages.dashboard.title }),
  ).toBeVisible();
});

test('a late membership response cannot undo sign-out from another tab', async ({
  page,
}) => {
  await session(page);
  await memberApi(page);
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route('**/rest/v1/rpc/link_current_member', async (route) => {
    requested = true;
    await waiting;
    await route.fulfill({ json: member.id });
  });
  await page.goto('/dashboard');
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() => {
    localStorage.removeItem('family-splitter-auth');
    const channel = new BroadcastChannel('family-splitter-auth');
    channel.postMessage({ event: 'SIGNED_OUT', session: null });
    channel.close();
  });
  await expect(
    page.getByRole('heading', { name: messages.auth.loginTitle }),
  ).toBeVisible();
  const response = page.waitForResponse('**/rest/v1/rpc/link_current_member');
  release();
  await response;
  await expect(
    page.getByRole('heading', { name: messages.dashboard.title }),
  ).toHaveCount(0);
});
