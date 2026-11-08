import { describe, expect, it } from 'vitest';
import type { CriterionBlueprint } from '../api/types';
import { criterionFromBlueprint } from './criterionDesign';
import { validateDraft } from './checklistDraft';

const blueprint: CriterionBlueprint = {
  schema_version: '1.0', title: 'Учебное правило', definition: 'Наблюдаемое действие', response_type: 'binary',
  choices: [
    { schema_version: '1.0', id: 'yes', label: 'Да', raw_value: true, anchor: 'Выполнено', score_fraction: '1' },
    { schema_version: '1.0', id: 'no', label: 'Нет', raw_value: false, anchor: 'Не выполнено', score_fraction: '0' },
  ], allow_na: true, na_condition: 'Нет возможности', flag_when_choice_ids: [], explanation: 'Подсказка AI',
};

describe('AI proposal to ordinary draft', () => {
  it('requires human weight and gives fresh criterion/choice identities', () => {
    const a = criterionFromBlueprint(blueprint), b = criterionFromBlueprint(blueprint);
    expect(a.weight).toBe('');
    expect(a.id).not.toBe(b.id);
    expect(a.choices[0].id).not.toBe('yes');
    expect(a.allow_na).toBe(true);
    expect(validateDraft({ schema_version: '1.0', title: 'Draft', criteria: [a] }, new Map())['criterion.0.weight']).toBeTruthy();
  });
  it('maps violation choices onto fresh IDs and keeps mandatory flag weight zero', () => {
    const flag = criterionFromBlueprint({ ...blueprint, response_type: 'flag', allow_na: false, na_condition: null,
      choices: blueprint.choices.map((c) => ({ ...c, score_fraction: null })), flag_when_choice_ids: ['yes'] });
    expect(flag.flag_when_choice_ids).toEqual([flag.choices[0].id]);
    expect(flag.weight).toBe('0');
    expect(flag.choices.every((c) => c.score_fraction === null)).toBe(true);
  });
});
