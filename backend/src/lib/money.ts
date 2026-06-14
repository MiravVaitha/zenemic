/**
 * Money helpers. We store amounts as integer minor units (pence/cents) to avoid
 * floating-point drift, and convert at the edges.
 */

const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);

/** Number of minor units per major unit for a currency (100 for most, 1 for JPY etc.). */
export function minorUnitFactor(currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? 1 : 100;
}

/** 12.5 (major) -> 1250 (minor) for GBP. */
export function toMinor(amountMajor: number, currency: string): number {
  return Math.round(amountMajor * minorUnitFactor(currency));
}

/** 1250 (minor) -> 12.5 (major) for GBP. */
export function toMajor(amountMinor: number, currency: string): number {
  return amountMinor / minorUnitFactor(currency);
}

/** Parse a free-text budget like "£480", "$3,200", "860" into minor units. */
export function parseBudgetToMinor(input: string | number | null | undefined, currency: string): number | null {
  if (input == null) return null;
  if (typeof input === 'number') return toMinor(input, currency);
  const cleaned = input.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? toMinor(value, currency) : null;
}

const SYMBOLS: Record<string, string> = { gbp: '£', usd: '$', eur: '€' };

/** Format minor units for display, e.g. (15800, "gbp") -> "£158.00". */
export function formatMoney(amountMinor: number, currency: string): string {
  const symbol = SYMBOLS[currency.toLowerCase()] ?? '';
  const major = toMajor(amountMinor, currency);
  const decimals = minorUnitFactor(currency) === 1 ? 0 : 2;
  return `${symbol}${major.toFixed(decimals)}`;
}

/**
 * Split a total across n people as evenly as possible in minor units, pushing
 * any rounding remainder onto the earliest shares so the parts sum exactly.
 */
export function evenSplit(totalMinor: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalMinor / n);
  let remainder = totalMinor - base * n;
  return Array.from({ length: n }, () => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return base + extra;
  });
}
