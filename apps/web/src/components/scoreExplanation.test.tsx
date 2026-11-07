// *.test.tsx: discovered by vitest (include: src/**/*.test.tsx).
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import type { Criterion, CriterionProposal, ScoreSummary } from '../api/types';
import { explainScore } from '../lib/scoreExplanation';
import { ScoreExplanation } from './ScoreExplanation';

function crit(id: string, over: Partial<Criterion> = {}): Criterion {
  return {
    schema_version: '1.0', id, title: `Критерий ${id}`, definition: 'Определение', response_type: 'binary',
    choices: [
      { schema_version: '1.0', id: 'a', label: 'Вариант А', raw_value: true, anchor: '', score_fraction: '1' },
      { schema_version: '1.0', id: 'b', label: 'Вариант Б', raw_value: false, anchor: '', score_fraction: '0' },
    ],
    allow_na: true, na_condition: 'условие', requires_reference: false, weight: '10', section_id: null, flag_when_choice_ids: [],
    channel_instructions: { schema_version: '1.0', agent_chat: '', voice_call: '', voice_policy_version: 'v1' },
    evidence_policy: { schema_version: '1.0', require_evidence: true, missing_action_requires_range: true, allow_source: true },
    ...over,
  } as Criterion;
}
const prop = (criterion_id: string, applicability: CriterionProposal['applicability'], answer: string | null, origin: CriterionProposal['origin'] = 'ai'): CriterionProposal =>
  ({
    schema_version: '1.0', criterion_id, applicability, answer_choice_id: answer, rationale: `Основание ${criterion_id}`, reason_codes: ['other'], origin,
    evidence: [
      { schema_version: '1.0', kind: 'range', start_message_id: 'm0003', end_message_id: 'm0004', relation: 'support', explanation: '' },
      { schema_version: '1.0', kind: 'message', message_ids: ['m0001'], relation: 'context', explanation: '' },
    ],
  }) as CriterionProposal;
const contrib = (criterion_id: string, applicability: string, fraction: string | null, earned: string | null, weight = '10', normalized: string | null = null) => ({
  schema_version: '1.0', criterion_id, applicability, answer_choice_id: null, raw_value: null, score_fraction: fraction,
  original_weight: weight, earned_weight: earned, applicable_weight: applicability === 'applicable' ? weight : '0', normalized_contribution: normalized,
});
const summary = (status: ScoreSummary['status'], total: string | null, contributions: unknown[], flags: [string, boolean | null][] = []) =>
  ({ schema_version: '1.0', status, total_score: total, section_results: [], contributions,
     flags: flags.map(([criterion_id, detected]) => ({ schema_version: '1.0', criterion_id, detected, answer_choice_id: null })) }) as unknown as ScoreSummary;

test('reductions come from server fractions, not labels: a reversed scale and zero weight are handled', () => {
  // Reversed: the first choice "Да" is worth 0, so it IS a reduction; "Нет" is worth 1 and is not.
  const reversed = crit('rev', { choices: [
    { schema_version: '1.0', id: 'yes', label: 'Да', raw_value: true, anchor: '', score_fraction: '0' },
    { schema_version: '1.0', id: 'no', label: 'Нет', raw_value: false, anchor: '', score_fraction: '1' },
  ] as Criterion['choices'] });
  const criteria = [crit('ok'), reversed, crit('zero', { weight: '0' }), crit('na'), crit('und')];
  const model = explainScore(
    criteria,
    [prop('ok', 'applicable', 'b'), prop('rev', 'applicable', 'yes'), prop('zero', 'applicable', 'b'), prop('na', 'not_applicable', null), prop('und', 'undetermined', null)],
    summary('incomplete_evaluation', null, [
      contrib('ok', 'applicable', '0', '0'), contrib('rev', 'applicable', '0', '0'), contrib('zero', 'applicable', '0', '0', '0'),
      contrib('na', 'not_applicable', null, '0'), contrib('und', 'undetermined', null, null),
    ]),
  );
  expect(model.reductions.map((i) => i.criterion.id)).toEqual(['ok', 'rev']);
  expect(model.notApplicable.map((i) => i.criterion.id)).toEqual(['na']);
  expect(model.needsReview.map((i) => i.criterion.id)).toEqual(['und']);

  const noReduction = explainScore([reversed], [prop('rev', 'applicable', 'no')], summary('complete', '100.00', [contrib('rev', 'applicable', '1', '10', '10', '100')]));
  expect(noReduction.reductions).toEqual([]);
});

test('partial: says the total is not calculated and never labels undetermined as a penalty', () => {
  const model = explainScore([crit('x'), crit('y')], [prop('x', 'applicable', 'b'), prop('y', 'undetermined', null)],
    summary('incomplete_evaluation', null, [contrib('x', 'applicable', '0', '0'), contrib('y', 'undetermined', null, null)]));
  render(<ScoreExplanation model={model} checklistState="ready" sourceLabel="automatic" actions={{ onShowEvidence: vi.fn(), onOpenCriterion: vi.fn() }} />);
  expect(screen.getByRole('heading', { name: 'Что известно об оценке' })).toBeTruthy();
  expect(screen.getByTestId('why-incomplete').textContent).toContain('не рассчитан');
  expect(screen.getAllByTestId('why-reduction')).toHaveLength(1);
  expect(screen.getByTestId('why-review').textContent).toContain('Критерий y');
  expect(screen.getByTestId('why-reduction').textContent).toContain('Получено веса0 из 10');
  expect(screen.getByTestId('why-reduction').textContent).toContain('не рассчитан');
});

test('critical at full score is separate; no flag result is "не определено", not "не обнаружено"', () => {
  const flag = crit('risk', { response_type: 'flag', weight: '0' });
  const flag2 = crit('risk2', { response_type: 'flag', weight: '0' });
  const model = explainScore([crit('a'), flag, flag2], [prop('a', 'applicable', 'a'), prop('risk', 'applicable', 'a'), prop('risk2', 'undetermined', null)],
    summary('complete', '100.00', [contrib('a', 'applicable', '1', '10', '10', '100')], [['risk', true], ['risk2', null]]));
  const onShowEvidence = vi.fn();
  render(<ScoreExplanation model={model} checklistState="ready" sourceLabel="automatic" actions={{ onShowEvidence, onOpenCriterion: vi.fn() }} />);
  expect(screen.getByTestId('why-none').textContent).toContain('По применимым критериям баллы не снижены');
  const critical = screen.getByTestId('why-critical-block');
  expect(critical.textContent).toContain('не меняет и не обнуляет итог');
  fireEvent.click(within(critical).getByTestId('why-evidence'));
  expect(onShowEvidence).toHaveBeenCalledWith('risk', 0);
  expect(screen.getByTestId('why-review').textContent).toContain('Критерий risk2');
  expect(screen.queryByTestId('why-flags-clear')).toBeNull();
});

test('human decision is labelled, more than three reasons fold, evidence and appeal actions target the criterion', () => {
  const ids = ['c1', 'c2', 'c3', 'c4'];
  const model = explainScore(ids.map((id) => crit(id)), ids.map((id, i) => prop(id, 'applicable', 'b', i === 0 ? 'human' : 'ai')),
    summary('complete', '0.00', ids.map((id) => contrib(id, 'applicable', '0', '0', '10', '0'))));
  const onShowEvidence = vi.fn();
  const onAppeal = vi.fn();
  render(<ScoreExplanation model={model} checklistState="ready" sourceLabel="effective"
    actions={{ onShowEvidence, onOpenCriterion: vi.fn(), onAppeal, appealState: (cid) => (cid === 'c2' ? 'open' : 'available') }} />);
  expect(screen.getAllByTestId('why-reduction')).toHaveLength(3);
  expect(screen.getAllByTestId('why-human')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Показать все причины (4)' }));
  expect(screen.getAllByTestId('why-reduction')).toHaveLength(4);
  const first = screen.getAllByTestId('why-reduction')[0];
  fireEvent.click(within(first).getByRole('button', { name: 'реплики диалога', exact: true }));
  expect(onShowEvidence).toHaveBeenCalledWith('c1', 1);
  fireEvent.click(within(first).getByRole('button', { name: 'Оспорить критерий «Критерий c1»' }));
  expect(onAppeal).toHaveBeenCalledWith('c1');
  expect(screen.getAllByTestId('why-reduction')[1].textContent).toContain('Апелляция уже открыта');
});

test('no applicable weight and a missing checklist are explained without numbers', () => {
  const model = explainScore([crit('na')], [prop('na', 'not_applicable', null)], summary('no_applicable_weight', null, [contrib('na', 'not_applicable', null, '0')]));
  const { unmount } = render(<ScoreExplanation model={model} checklistState="ready" sourceLabel="automatic" actions={{ onShowEvidence: vi.fn(), onOpenCriterion: vi.fn() }} />);
  expect(screen.getByTestId('why-no-weight').textContent).toContain('не 0 и не 100');
  expect(screen.getByTestId('why-na').textContent).toContain('не штраф');
  unmount();
  render(<ScoreExplanation model={null} checklistState="error" sourceLabel="automatic" actions={{ onShowEvidence: vi.fn(), onOpenCriterion: vi.fn() }} />);
  expect(screen.getByText(/Не удалось загрузить версию чек-листа/)).toBeTruthy();
  expect(screen.queryByTestId('why-reduction')).toBeNull();
});
