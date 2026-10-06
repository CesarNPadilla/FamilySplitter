export type Currency = 'USD' | 'MXN';

export function assertCurrency(value: string): asserts value is Currency {
  if (value !== 'USD' && value !== 'MXN')
    throw new Error('Unsupported currency');
}

export function assertCents(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Money must be nonnegative safe integer cents');
  }
}

export function safeCents(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Money exceeds the safe integer range');
  }
  return Number(value);
}

/** Parse an ungrouped decimal input without floating-point money arithmetic. */
export function parseCents(input: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match)
    throw new Error('Enter a nonnegative amount with at most two decimals');
  return safeCents(
    BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')),
  );
}

/** Always include the currency code so USD and MXN cannot be confused. */
export function formatCents(cents: number, currency: Currency): string {
  assertCents(cents);
  assertCurrency(currency);
  const value = BigInt(cents);
  const whole = new Intl.NumberFormat('en-US').format(value / 100n);
  return `${currency} ${whole}.${String(value % 100n).padStart(2, '0')}`;
}
