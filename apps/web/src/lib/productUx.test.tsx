// *.test.tsx so that vitest (include: src/**/*.test.tsx) actually runs it.
import { expect, test } from 'vitest';
import type { CallRecord, ChecklistVersion, Criterion, CriterionProposal, EvaluationView, ScoreSummary } from '../api/types';
import { compareEvaluations, decimalDelta, normDecimal, summarize, type Scope } from './comparison';
import { approxRu } from './format';
import { costText, durations, modelPairs, reusedRunCallsText, tokenText, tokenTotals } from './runSummary';

function crit(id: string, over: Partial<Criterion> = {}): Criterion {
  return {
    schema_version: '1.0',
    id,
    title: `Критерий ${id}`,
    definition: 'Определение',
    response_type: 'binary',
    choices: [
      { schema_version: '1.0', id: 'yes', label: 'Да', raw_value: true, anchor: 'выполнено', score_fraction: '1' },
      { schema_version: '1.0', id: 'no', label: 'Нет', raw_value: false, anchor: 'не выполнено', score_fraction: '0' },
    ],
    allow_na: true,
    na_condition: 'Неприменимо',
    channel_instructions: { schema_version: '1.0', agent_chat: '', voice_call: '', voice_policy_version: 'v1' },
    evidence_policy: { schema_version: '1.0', require_evidence: true, missing_action_requires_range: true, allow_source: true },
    requires_reference: false,
    weight: '10',
    section_id: null,
    flag_when_choice_ids: [],
    ...over,
  } as Criterion;
}

function version(id: string, criteria: Criterion[]): ChecklistVersion {
  return { version_id: id, checklist_id: 'c', title: 'T', criteria, sections: [], semantic_hash: 'a', scoring_config_hash: 'b', created_at: '2026-11-07T00:00:00Z', schema_version: '1.0' } as ChecklistVersion;
}

const prop = (criterion_id: string, applicability: CriterionProposal['applicability'], answer_choice_id: string | null): CriterionProposal =>
  ({ criterion_id, applicability, answer_choice_id, rationale: 'r', reason_codes: ['other'], evidence: [], origin: 'test', schema_version: '1.0' }) as CriterionProposal;

function score(total: string | null, contributions: [string, string | null, string | null][], flags: [string, boolean | null][] = []): ScoreSummary {
  return {
    schema_version: '1.0',
    status: total === null ? 'incomplete_evaluation' : 'complete',
    total_score: total,
    section_results: [],
    flags: flags.map(([criterion_id, detected]) => ({ schema_version: '1.0', criterion_id, detected, answer_choice_id: null })),
    contributions: contributions.map(([criterion_id, earned, normalized]) => ({
      schema_version: '1.0', criterion_id, applicability: earned === null ? 'undetermined' : 'applicable', answer_choice_id: null,
      raw_value: null, score_fraction: null, original_weight: '10', earned_weight: earned, applicable_weight: '10', normalized_contribution: normalized,
    })),
  } as ScoreSummary;
}

function view(id: string, auto: CriterionProposal[], autoScore: ScoreSummary, eff?: CriterionProposal[], effScore?: ScoreSummary): EvaluationView {
  return {
    id,
    artifact: { automatic_final: auto, evaluator_mode: 'test' },
    automatic_score: autoScore,
    effective_proposals: eff ?? auto,
    effective_score: effScore ?? autoScore,
  } as unknown as EvaluationView;
}

const side = (v: EvaluationView, ver: ChecklistVersion, scope: Scope = 'automatic') => ({ view: v, version: ver, scope });

test('weight-only change: same answer, weight and contribution differences are both reported', () => {
  const a = version('v1', [crit('greet', { weight: '25' }), crit('close', { weight: '75' })]);
  const b = version('v2', [crit('greet', { weight: '75' }), crit('close', { weight: '25' })]);
  const p = [prop('greet', 'applicable', 'yes'), prop('close', 'applicable', 'no')];
  const rows = compareEvaluations(
    side(view('L', p, score('75.00', [['greet', '25', '25'], ['close', '0', '0']])), a),
    side(view('R', p, score('25.00', [['greet', '75', '75.00'], ['close', '0', '0.0']])), b),
  );
  expect(rows.find((r) => r.id === 'greet')!.kinds).toEqual(['weight', 'contribution']);
  // 0 and 0.0 are the same decimal: only the weight changed for "close".
  expect(rows.find((r) => r.id === 'close')!.kinds).toEqual(['weight']);
  expect(summarize(rows)).toMatchObject({ rules: 2, answers: 0, contributions: 1, changed: 2 });
});

test('definition changed under the same criterion ID and a re-meant choice under the same choice ID are visible', () => {
  const a = version('v1', [crit('greet'), crit('scale')]);
  const b = version('v2', [
    crit('greet', { definition: 'Новое определение' }),
    crit('scale', {
      choices: [
        { schema_version: '1.0', id: 'yes', label: 'Частично', raw_value: true, anchor: 'частично', score_fraction: '0.5' },
        { schema_version: '1.0', id: 'no', label: 'Нет', raw_value: false, anchor: 'не выполнено', score_fraction: '0' },
      ] as Criterion['choices'],
    }),
  ]);
  const p = [prop('greet', 'applicable', 'yes'), prop('scale', 'applicable', 'yes')];
  const rows = compareEvaluations(
    side(view('L', p, score('100', [['greet', '10', '50'], ['scale', '10', '50']])), a),
    side(view('R', p, score('75', [['greet', '10', '66.67'], ['scale', '5', '33.33']])), b),
  );
  expect(rows[0].kinds).toEqual(['rule', 'contribution']);
  expect(rows[0].fields).toEqual(['definition']);
  expect(rows[1].kinds).toEqual(['scale', 'answer_meaning', 'contribution']);
});

test('added/removed criteria, N/A → undetermined status and a flag change with an equal total', () => {
  const flag = crit('risk', { response_type: 'flag', weight: '0', allow_na: false, na_condition: null });
  const a = version('v1', [crit('greet'), crit('old'), flag]);
  const b = version('v2', [crit('greet'), crit('new'), flag]);
  const rows = compareEvaluations(
    side(view('L', [prop('greet', 'not_applicable', null), prop('old', 'applicable', 'yes'), prop('risk', 'applicable', 'no')], score('100', [['old', '10', '100']], [['risk', false]])), a),
    side(view('R', [prop('greet', 'undetermined', null), prop('new', 'applicable', 'yes'), prop('risk', 'applicable', 'yes')], score('100', [['new', '10', '100']], [['risk', true]])), b),
  );
  const by = Object.fromEntries(rows.map((r) => [r.id, r.kinds]));
  expect(by.greet).toEqual(['applicability']);
  expect(by.new).toEqual(['added', 'contribution']);
  expect(by.old).toEqual(['removed', 'contribution']);
  expect(by.risk).toEqual(['answer', 'flag']);
});

test('automatic and effective scopes compare the corresponding result of each side', () => {
  const v = version('v1', [crit('greet')]);
  const auto = [prop('greet', 'applicable', 'yes')];
  const human = [{ ...prop('greet', 'applicable', 'no'), origin: 'human' } as CriterionProposal];
  const left = view('L', auto, score('100', [['greet', '10', '100']]), human, score('0', [['greet', '0', '0']]));
  const right = view('R', auto, score('100', [['greet', '10', '100']]));
  expect(compareEvaluations(side(left, v), side(right, v))[0].kinds).toEqual([]);
  expect(compareEvaluations(side(left, v, 'effective'), side(right, v, 'effective'))[0].kinds).toEqual(['answer', 'contribution']);
});

test('decimal helpers are exact and never use floats', () => {
  expect(decimalDelta('25.00', '75.00')).toBe('+50.00');
  expect(decimalDelta('85.38', '85.5')).toBe('+0.12');
  expect(decimalDelta('100', '95.50')).toBe('−4.50');
  expect(decimalDelta('40', '40.00')).toBe('±0.00');
  expect(normDecimal('20.000')).toBe('20');
  expect(normDecimal('0.0')).toBe('0');
  expect(normDecimal(null)).toBeNull();
  expect(approxRu('68.18181818')).toBe('≈68,18');
  expect(approxRu('22.727272')).toBe('≈22,73');
  expect(approxRu('0.995')).toBe('≈1,00');
  expect(approxRu('25')).toBe('25');
  expect(approxRu('12.5')).toBe('12,5');
});

const call = (over: Partial<CallRecord>): CallRecord =>
  ({
    call_id: 'c', attempt_id: 'a', purpose: 'primary', currency: 'USD', outcome: 'succeeded', schema_version: '1.0',
    requested: { provider: 'xerosharc', model: 'gpt-6.1-sol', configuration_ref: 'x', schema_version: '1.0' },
    actual: { provider: 'xerosharc', model: 'xeros_core', configuration_ref: 'x', schema_version: '1.0' },
    started_at: '2026-11-07T10:00:00Z', finished_at: '2026-11-07T10:00:02.500Z', ...over,
  }) as CallRecord;

test('run summary: tokens from API without double counting, partial usage, requested vs reported model', () => {
  const calls = [
    call({ usage: { schema_version: '1.0', input_tokens: 1000, output_tokens: 300, reasoning_tokens: 200, cached_tokens: 400 } }),
    call({ call_id: 'd', usage: null }),
  ];
  expect(tokenTotals(calls)).toEqual({ calls: 2, known: 1, input: 1000, output: 300 });
  expect(tokenText(tokenTotals(calls))).toBe('вход 1 000 · выход 300 — известно для 1 из 2 вызовов');
  expect(tokenText(tokenTotals([call({ usage: null })]))).toContain('неизвестны');
  expect(tokenText(tokenTotals([]))).toContain('вызовов не было');
  expect(modelPairs(calls)).toEqual(['xerosharc / gpt-6.1-sol → по ответу API xerosharc / xeros_core']);
});

test('run summary: cost is the server summary; confirmed zero, unknown and known part stay distinct', () => {
  const run = (cost: string | null, complete: boolean, calls: CallRecord[]) =>
    ({ cost, cost_complete: complete, currency: 'USD', calls, job: { attempts: [] } }) as unknown as NonNullable<EvaluationView['run']>;
  expect(costText(run('0', true, []))).toContain('подтверждено');
  expect(costText(run('0.75', true, [call({})]))).toBe('0,75 USD');
  expect(costText(run(null, false, [call({})]))).toContain('неизвестна');
  expect(costText(run('0.5', false, [call({}), call({})]))).toBe('неизвестна полностью; известная часть 0,5 USD');
  expect(costText(null)).toContain('нет истории');
  expect(reusedRunCallsText(run('0', true, []))).toContain('Новых вызовов модели не было');
  expect(reusedRunCallsText(run('0.75', true, [call({ outcome: 'failed' })]))).toContain('вызовов модели: 1');
  expect(reusedRunCallsText(null)).toContain('недоступна');
  const timed = {
    ...run(null, false, [call({}), call({ started_at: '2026-11-07T10:00:05Z', finished_at: '2026-11-07T10:00:06Z' })]),
    job: { attempts: [
      { started_at: '2026-11-07T10:00:00Z', finished_at: '2026-11-07T10:00:03Z' },
      { started_at: '2026-11-07T10:00:04Z', finished_at: '2026-11-07T10:00:07Z' },
    ] },
  } as unknown as NonNullable<EvaluationView['run']>;
  expect(durations(timed)).toEqual({ job: '7,0 с', calls: '3,5 с' });
});
