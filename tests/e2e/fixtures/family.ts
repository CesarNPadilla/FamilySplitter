import { type Page } from '@playwright/test';
import { splitEqual } from '../../../src/lib/split';
export const ids = Array.from(
  { length: 5 },
  (_, index) => `00000000-0000-0000-0000-00000000000${index + 1}`,
);
export const tabs = [
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

export async function family(page: Page, actor = 0) {
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
      json: state.rows.filter((row) => !tabId || row.tab_id === tabId),
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
