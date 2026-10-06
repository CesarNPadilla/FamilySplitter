import { supabase } from './supabase';
import { assertCents, assertCurrency, type Currency } from './money';
import {
  prepareExpense,
  type ExpenseDraft,
  type SplitMode,
} from './expense-form';

export interface FamilyMember {
  id: string;
  name: string;
}
export interface ExpenseTab {
  id: string;
  name: string;
}
export interface SavedShare {
  id: string;
  memberId: string;
  amountCents: number;
  percentage: string | null;
  payorMarkedPaid: boolean;
  payeeConfirmed: boolean;
}
export interface SavedExpense {
  id: string;
  tabId: string;
  description: string;
  totalCents: number;
  currency: Currency;
  paidBy: string;
  createdBy: string;
  splitMode: SplitMode;
  shares: SavedShare[];
}
export interface TabData {
  tab: ExpenseTab;
  members: FamilyMember[];
  expenses: SavedExpense[];
}
export class ExpenseWriteDenied extends Error {}

function client() {
  if (!supabase) throw new Error('Supabase unavailable');
  return supabase;
}
export async function listTabs(): Promise<ExpenseTab[]> {
  const { data, error } = await client()
    .from('expense_tabs')
    .select('id,name')
    .order('created_at')
    .order('id');
  if (error || !data) throw new Error('Tabs unavailable');
  return data;
}
export async function createTab(name: string): Promise<string> {
  const { data, error } = await client().rpc('create_expense_tab', {
    p_name: name.trim(),
  });
  if (error || typeof data !== 'string') throw new Error('Tab creation failed');
  return data;
}
export async function loadTab(tabId: string): Promise<TabData> {
  const api = client();
  const [tabResult, memberResult, expenseResult] = await Promise.all([
    api.from('expense_tabs').select('id,name').eq('id', tabId).single(),
    api.from('members').select('id,name').order('id'),
    api
      .from('expenses')
      .select(
        'id,tab_id,description,total_cents,currency,paid_by,created_by,split_mode,expense_shares(id,member_id,amount_cents,percentage::text,payor_marked_paid,payee_confirmed)',
      )
      .eq('tab_id', tabId)
      .order('created_at', { ascending: false })
      .order('id'),
  ]);
  if (
    tabResult.error ||
    memberResult.error ||
    expenseResult.error ||
    !tabResult.data ||
    !memberResult.data ||
    !expenseResult.data
  )
    throw new Error('Tab unavailable');
  const expenses = expenseResult.data.map((row): SavedExpense => {
    assertCents(row.total_cents);
    assertCurrency(row.currency);
    if (!['equal', 'custom', 'percentage'].includes(row.split_mode))
      throw new Error('Invalid split mode');
    return {
      id: row.id,
      tabId: row.tab_id,
      description: row.description,
      totalCents: row.total_cents,
      currency: row.currency,
      paidBy: row.paid_by,
      createdBy: row.created_by,
      splitMode: row.split_mode as SplitMode,
      shares: row.expense_shares
        .map((item): SavedShare => {
          assertCents(item.amount_cents);
          if (item.percentage !== null && typeof item.percentage !== 'string')
            throw new Error('Percentage must be exact text');
          return {
            id: item.id,
            memberId: item.member_id,
            amountCents: item.amount_cents,
            percentage: item.percentage,
            payorMarkedPaid: item.payor_marked_paid,
            payeeConfirmed: item.payee_confirmed,
          };
        })
        .sort((a, b) =>
          a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0,
        ),
    };
  });
  return { tab: tabResult.data, members: memberResult.data, expenses };
}
export function canManageExpense(
  expense: Pick<SavedExpense, 'createdBy' | 'paidBy'>,
  memberId: string,
) {
  return expense.createdBy === memberId || expense.paidBy === memberId;
}
export function expensePayload(
  tabId: string,
  draft: ExpenseDraft,
  knownIds: readonly string[],
  expenseId?: string,
) {
  const preview = prepareExpense(draft, knownIds);
  return {
    p_tab_id: tabId,
    p_description: draft.description.trim(),
    p_total_cents: preview.totalCents,
    p_currency: draft.currency,
    p_paid_by: draft.paidBy,
    p_split_mode: draft.splitMode,
    p_shares: preview.shares.map((item) => ({
      member_id: item.memberId,
      ...(draft.splitMode === 'custom'
        ? { amount_cents: item.amountCents }
        : {}),
      ...(draft.splitMode === 'percentage'
        ? { percentage: draft.percentages[item.memberId].trim() }
        : {}),
    })),
    p_expense_id: expenseId ?? null,
  };
}
export async function saveExpense(
  tabId: string,
  draft: ExpenseDraft,
  knownIds: readonly string[],
  expenseId?: string,
): Promise<string> {
  const { data, error } = await client().rpc(
    'save_expense',
    expensePayload(tabId, draft, knownIds, expenseId),
  );
  if (error?.code === '42501') throw new ExpenseWriteDenied();
  if (error || typeof data !== 'string') throw new Error('Expense save failed');
  return data;
}
export async function deleteExpense(expenseId: string): Promise<void> {
  const { error } = await client().rpc('delete_expense', {
    p_expense_id: expenseId,
  });
  if (error?.code === '42501') throw new ExpenseWriteDenied();
  if (error) throw new Error('Expense deletion failed');
}
