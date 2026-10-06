import { assertCents, safeCents } from './money';

export interface SplitShare {
  memberId: string;
  amountCents: number;
  payorMarkedPaid: boolean;
  payeeConfirmed: boolean;
}

function participants(memberIds: readonly string[]): string[] {
  if (memberIds.length === 0)
    throw new Error('Select at least one participant');
  if (memberIds.some((id) => !id.trim()))
    throw new Error('Member IDs cannot be empty');
  if (new Set(memberIds).size !== memberIds.length)
    throw new Error('Duplicate member');
  // Lexical ID order is stable across environments, unlike locale-aware sorting.
  return [...memberIds].sort();
}

function share(
  memberId: string,
  amountCents: number,
  payeeId: string,
): SplitShare {
  if (!payeeId.trim()) throw new Error('Payee ID cannot be empty');
  return {
    memberId,
    amountCents,
    payorMarkedPaid: memberId === payeeId,
    payeeConfirmed: memberId === payeeId,
  };
}

/** Primary split mode: payee takes remainder if present; otherwise +1 in ID order. */
export function splitEqual(
  totalCents: number,
  memberIds: readonly string[],
  payeeId: string,
): SplitShare[] {
  assertCents(totalCents);
  const ids = participants(memberIds);
  const total = BigInt(totalCents);
  const base = total / BigInt(ids.length);
  const remainder = Number(total % BigInt(ids.length));
  const payeeParticipates = ids.includes(payeeId);
  return ids.map((id, index) =>
    share(
      id,
      safeCents(
        base +
          BigInt(
            payeeParticipates
              ? id === payeeId
                ? remainder
                : 0
              : index < remainder
                ? 1
                : 0,
          ),
      ),
      payeeId,
    ),
  );
}

export interface CustomAmount {
  memberId: string;
  amountCents: number;
}

export function splitCustom(
  totalCents: number,
  amounts: readonly CustomAmount[],
  payeeId: string,
): SplitShare[] {
  assertCents(totalCents);
  const ids = participants(amounts.map((item) => item.memberId));
  const byId = new Map(
    amounts.map((item) => {
      assertCents(item.amountCents);
      return [item.memberId, item.amountCents] as const;
    }),
  );
  const sum = amounts.reduce((acc, item) => acc + BigInt(item.amountCents), 0n);
  if (sum !== BigInt(totalCents))
    throw new Error('Custom amounts must sum to the total');
  return ids.map((id) => share(id, byId.get(id)!, payeeId));
}

/** Percentages are decimal strings, avoiding floating-point percentage arithmetic. */
export interface Percentage {
  memberId: string;
  percentage: string;
}

export function splitPercentages(
  totalCents: number,
  percentages: readonly Percentage[],
  payeeId: string,
): SplitShare[] {
  assertCents(totalCents);
  participants(percentages.map((item) => item.memberId));
  const decimals = percentages.map((item) => {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(item.percentage.trim());
    if (!match) throw new Error('Percentages must be nonnegative decimals');
    return {
      memberId: item.memberId,
      whole: match[1],
      fraction: match[2] ?? '',
    };
  });
  const precision = Math.max(...decimals.map((item) => item.fraction.length));
  const scale = 10n ** BigInt(precision);
  const denominator = 100n * scale;
  const weights = decimals.map((item) => ({
    memberId: item.memberId,
    weight:
      BigInt(item.whole) * scale +
      BigInt(item.fraction.padEnd(precision, '0') || '0'),
  }));
  if (weights.reduce((sum, item) => sum + item.weight, 0n) !== denominator)
    throw new Error('Percentages must sum to 100');
  const allocations = weights.map((item) => {
    const numerator = BigInt(totalCents) * item.weight;
    return {
      memberId: item.memberId,
      cents: numerator / denominator,
      remainder: numerator % denominator,
    };
  });
  const leftover = Number(
    BigInt(totalCents) -
      allocations.reduce((sum, item) => sum + item.cents, 0n),
  );
  allocations.sort((a, b) =>
    a.remainder !== b.remainder
      ? a.remainder > b.remainder
        ? -1
        : 1
      : a.memberId < b.memberId
        ? -1
        : a.memberId > b.memberId
          ? 1
          : 0,
  );
  for (let index = 0; index < leftover; index++) allocations[index].cents += 1n;
  return allocations
    .sort((a, b) =>
      a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0,
    )
    .map((item) => share(item.memberId, safeCents(item.cents), payeeId));
}
