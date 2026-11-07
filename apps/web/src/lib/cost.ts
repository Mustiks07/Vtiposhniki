// Cost is not a score. Summing provider costs is needed to show the total cost of all
// attempts; done with fixed-point BigInt so decimal strings are never rounded via float.
import type { CallRecord } from '../api/types';

function toScaled(value: string, scale: number): bigint {
  const negative = value.startsWith('-');
  const [int, frac = ''] = value.replace('-', '').split('.');
  const scaled = BigInt(int + (frac + '0'.repeat(scale)).slice(0, scale));
  return negative ? -scaled : scaled;
}

function fromScaled(value: bigint, scale: number): string {
  const s = value.toString().padStart(scale + 1, '0');
  const int = s.slice(0, -scale);
  const frac = s.slice(-scale).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

export interface CostTotal {
  known: string | null; // sum of known costs
  complete: boolean; // false when any call has unknown (null) cost
  currency: string;
}

export function totalCost(calls: CallRecord[]): CostTotal {
  const scale = Math.max(
    0,
    ...calls.map((c) => (c.cost && c.cost.includes('.') ? c.cost.split('.')[1].length : 0)),
  );
  let sum = 0n;
  let any = false;
  let complete = true;
  for (const call of calls) {
    if (call.cost === null || call.cost === undefined) {
      complete = false;
      continue;
    }
    any = true;
    sum += toScaled(call.cost, scale);
  }
  return {
    known: any ? (scale ? fromScaled(sum, scale) : sum.toString()) : null,
    complete: complete && calls.length > 0,
    currency: calls[0]?.currency ?? 'USD',
  };
}
