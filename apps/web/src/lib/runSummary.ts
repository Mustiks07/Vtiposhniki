// Facts of one saved run for the compact summary. Cost comes only from the server's
// EvaluationRun summary (all attempts, reviewer, repairs, fallbacks); no tariff is applied
// here. Token counts are reported by the provider API: reasoning tokens are already part of
// output and cached tokens part of input, so they are never added a second time.
import type { CallRecord, EvaluationView } from '../api/types';
import { decimalRu } from './format';

type Run = NonNullable<EvaluationView['run']>;

export interface TokenTotals {
  calls: number;
  /** Calls whose usage reported both input and output. */
  known: number;
  input: number;
  output: number;
}

export function tokenTotals(calls: CallRecord[]): TokenTotals {
  let input = 0;
  let output = 0;
  let known = 0;
  for (const c of calls) {
    const i = c.usage?.input_tokens;
    const o = c.usage?.output_tokens;
    if (typeof i === 'number') input += i;
    if (typeof o === 'number') output += o;
    if (typeof i === 'number' && typeof o === 'number') known += 1;
  }
  return { calls: calls.length, known, input, output };
}

const n = (v: number) => v.toLocaleString('ru-RU');

export function tokenText(t: TokenTotals): string {
  if (t.calls === 0) return '0 — вызовов не было';
  if (t.known === 0 && t.input === 0 && t.output === 0) return 'неизвестны: API не сообщил расход';
  const base = `вход ${n(t.input)} · выход ${n(t.output)}`;
  return t.known === t.calls ? base : `${base} — известно для ${t.known} из ${t.calls} вызовов`;
}

export function costText(run: Run | null | undefined): string {
  if (!run) return 'неизвестна: нет истории запуска';
  if (run.cost_complete && run.cost !== null) {
    return run.calls.length === 0
      ? `${decimalRu(run.cost)} ${run.currency} — подтверждено: платных вызовов не было`
      : `${decimalRu(run.cost)} ${run.currency}`;
  }
  if (run.cost !== null) return `неизвестна полностью; известная часть ${decimalRu(run.cost)} ${run.currency}`;
  return 'неизвестна: цена вызовов не подтверждена';
}

function ms(start: string, end: string | null | undefined): number | null {
  if (!end) return null;
  const v = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export function secondsText(value: number): string {
  if (value < 1000) return `${value} мс`;
  const s = value / 1000;
  if (s < 60) return `${s.toFixed(1).replace('.', ',')} с`;
  return `${Math.floor(s / 60)} мин ${Math.round(s % 60)} с`;
}

/** Wall time of the job (first attempt start → last attempt end) and the sum of call times. */
export function durations(run: Run | null | undefined): { job: string; calls: string } {
  if (!run) return { job: 'неизвестна', calls: 'неизвестна' };
  const attempts = run.job.attempts;
  let job = 'неизвестна';
  if (attempts.length) {
    const start = attempts.map((a) => a.started_at).sort()[0];
    const open = attempts.some((a) => !a.finished_at);
    const end = attempts.map((a) => a.finished_at ?? '').sort().at(-1);
    const value = open ? null : ms(start, end);
    job = open ? 'ещё выполняется' : value === null ? 'неизвестна' : secondsText(value);
  }
  let calls = run.calls.length ? 'неизвестна' : '0 — вызовов не было';
  if (run.calls.length) {
    const parts = run.calls.map((c) => ms(c.started_at, c.finished_at));
    const knownParts = parts.filter((p): p is number => p !== null);
    if (knownParts.length) {
      const total = secondsText(knownParts.reduce((a, b) => a + b, 0));
      calls = knownParts.length === parts.length ? total : `${total} — известно для ${knownParts.length} из ${parts.length}`;
    }
  }
  return { job, calls };
}

/** Distinct requested → reported model pairs, in call order. */
export function modelPairs(calls: CallRecord[]): string[] {
  const out: string[] = [];
  for (const c of calls) {
    const requested = `${c.requested.provider} / ${c.requested.model}`;
    const reported = c.actual ? `${c.actual.provider} / ${c.actual.model}` : null;
    const text =
      reported === null
        ? `${requested} (по ответу API: неизвестна)`
        : reported === requested
          ? requested
          : `${requested} → по ответу API ${reported}`;
    if (!out.includes(text)) out.push(text);
  }
  return out;
}
