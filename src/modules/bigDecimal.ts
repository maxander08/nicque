/**
 * Arbitrary-precision decimal arithmetic for the Decimal Block (and for operators fed by it).
 *
 * A BigDecimal is an unscaled `bigint` and a scale (the number of digits after the decimal point), exactly like
 * Java's BigDecimal: value = unscaled / 10^scale. There is no limit on the number of digits, only memory. Addition,
 * subtraction and multiplication are always exact. Division is exact whenever the quotient terminates; otherwise it
 * is truncated toward zero after DIVISION_DIGITS significant digits.
 */

export interface BigDecimal {
  unscaled: bigint;
  /** Digits after the decimal point (never negative). */
  scale: number;
}

/** Significant digits kept when a quotient never terminates (e.g. 1 ÷ 3). Terminating quotients are exact. */
export const DIVISION_DIGITS = 100;

/** A complete decimal number: optional minus sign, digits, and optionally a point followed by at least one digit. */
export const isDecimal = (value: string) => /^-?\d+(\.\d+)?$/.test(value);

/**
 * Reduces any string to a valid decimal entry: an optional leading minus sign, digits and at most one decimal point.
 * Everything else is dropped. There is no limit on the number of digits. A trailing "." (or a lone "-") is kept
 * so a number can be typed; a point typed first becomes "0." and leading zeros are removed.
 */
export function sanitizeDecimal(raw: string): string {
  const negative = raw.trimStart().startsWith('-');
  const cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  const intRaw = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const frac = dot === -1 ? '' : cleaned.slice(dot + 1).replace(/\./g, '');
  // no leading zeros: typing 5 after a 0 gives 5, not 05 (a single 0 is kept)
  let int = intRaw.replace(/^0+(?=\d)/, '');
  if (dot !== -1 && int === '') int = '0';
  return (negative ? '-' : '') + int + (dot === -1 ? '' : '.' + frac);
}

const pow10 = (n: number): bigint => 10n ** BigInt(n);

/** Parses a complete decimal string. Throws on anything else. */
export function parseDecimal(text: string): BigDecimal {
  if (!isDecimal(text)) throw new Error(`Not a decimal number: "${text}"`);
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const dot = body.indexOf('.');
  const digits = dot === -1 ? body : body.slice(0, dot) + body.slice(dot + 1);
  const unscaled = BigInt(digits);
  return { unscaled: negative ? -unscaled : unscaled, scale: dot === -1 ? 0 : body.length - dot - 1 };
}

/** Plain (never exponential) text of a BigDecimal. The scale is kept, so 2.50 stays "2.50". */
export function formatDecimal(d: BigDecimal): string {
  const negative = d.unscaled < 0n;
  let digits = (negative ? -d.unscaled : d.unscaled).toString();
  if (d.scale > 0) {
    digits = digits.padStart(d.scale + 1, '0');
    digits = digits.slice(0, digits.length - d.scale) + '.' + digits.slice(digits.length - d.scale);
  }
  return (negative ? '-' : '') + digits;
}

/** Brings two numbers to the same scale. */
function align(a: BigDecimal, b: BigDecimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.unscaled * pow10(scale - a.scale), b.unscaled * pow10(scale - b.scale), scale];
}

export function addDecimal(a: BigDecimal, b: BigDecimal): BigDecimal {
  const [x, y, scale] = align(a, b);
  return { unscaled: x + y, scale };
}

export function subDecimal(a: BigDecimal, b: BigDecimal): BigDecimal {
  const [x, y, scale] = align(a, b);
  return { unscaled: x - y, scale };
}

export function mulDecimal(a: BigDecimal, b: BigDecimal): BigDecimal {
  return { unscaled: a.unscaled * b.unscaled, scale: a.scale + b.scale };
}

/** Quotient a ÷ b, or null when b is zero. Exact when it terminates, otherwise truncated toward zero. */
export function divDecimal(a: BigDecimal, b: BigDecimal): BigDecimal | null {
  if (b.unscaled === 0n) return null;
  // a / b = (ua · 10^sb) / (ub · 10^sa)
  let num = a.unscaled * pow10(b.scale);
  let den = b.unscaled * pow10(a.scale);
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const negative = num < 0n;
  const absNum = negative ? -num : num;
  // the quotient is about 10^-(digits(den) - digits(num)): keep DIVISION_DIGITS significant digits beyond that
  const lead = den.toString().length - absNum.toString().length;
  const scale = Math.max(0, lead) + DIVISION_DIGITS;
  let q = (absNum * pow10(scale)) / den;
  let s = scale;
  // like Java's BigDecimal, drop the zeros that were only padding, but not below the preferred scale
  const preferred = Math.max(0, a.scale - b.scale);
  while (s > preferred && q % 10n === 0n) {
    q /= 10n;
    s--;
  }
  return { unscaled: negative ? -q : q, scale: s };
}

/** Convenience wrappers on decimal strings (both operands must be complete decimals / integers). */
export const decimalOp = {
  add: (a: string, b: string) => formatDecimal(addDecimal(parseDecimal(a), parseDecimal(b))),
  sub: (a: string, b: string) => formatDecimal(subDecimal(parseDecimal(a), parseDecimal(b))),
  mul: (a: string, b: string) => formatDecimal(mulDecimal(parseDecimal(a), parseDecimal(b))),
  /** null when dividing by zero */
  div: (a: string, b: string) => {
    const q = divDecimal(parseDecimal(a), parseDecimal(b));
    return q ? formatDecimal(q) : null;
  },
};
