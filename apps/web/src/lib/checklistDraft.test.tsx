import { expect, test } from 'vitest';
import checklistFixture from '../../../../fixtures/contracts/checklist-custom.json';
import type { ChecklistVersion, Criterion } from '../api/types';
import {
  blankCriterion,
  diffVersions,
  draftFromVersion,
  isScoringOnlyChange,
  needsMappingConfirmation,
  ratio,
  suggestRawOverMax,
  toWire,
  validateDraft,
  withTypeDefaults,
} from './checklistDraft';

const version = checklistFixture as ChecklistVersion;

function scale(raws: number[], fractions: string[]): Criterion {
  const c = withTypeDefaults(blankCriterion('scale'), 'scale');
  return {
    ...c,
    title: 't',
    definition: 'd',
    choices: raws.map((r, i) => ({ schema_version: '1.0', id: `s${r}`, label: String(r), raw_value: r, anchor: `a${r}`, score_fraction: fractions[i] })),
  };
}

test('raw/max suggestion only for zero-based integer scales, exact fixed-point strings', () => {
  expect(ratio(7, 10)).toBe('0.7');
  expect(ratio(1, 3)).toBe('0.3333');
  expect(ratio(10, 10)).toBe('1');
  expect(suggestRawOverMax(scale([0, 4, 7, 10], ['', '', '', '']))!.map((c) => c.score_fraction)).toEqual(['0', '0.4', '0.7', '1']);
  expect(suggestRawOverMax(scale([1, 2, 3], ['', '', '']))).toBeNull();
});

test('non-zero lowest step and reverse scales require explicit mapping confirmation', () => {
  expect(needsMappingConfirmation(scale([0, 5, 10], ['0', '0.5', '1']))).toBe(false);
  expect(needsMappingConfirmation(scale([1, 2, 3], ['0', '0.5', '1']))).toBe(true);
  expect(needsMappingConfirmation(scale([0, 5, 10], ['1', '0.5', '0']))).toBe(true);
  const c = scale([1, 2, 3], ['0', '0.5', '1']);
  const d = { schema_version: '1.0' as const, title: 'x', criteria: [c], sections: [] };
  expect(validateDraft(d, new Set())['criterion.0.mapping']).toBeTruthy();
  expect(validateDraft(d, new Set([c.id]))['criterion.0.mapping']).toBeUndefined();
});

test('field validation: fraction range, weight, N/A condition, flag rules', () => {
  const bad = scale([0, 1], ['0', '1.5']);
  const d = {
    schema_version: '1.0' as const,
    title: '',
    criteria: [
      { ...bad, weight: '-1', allow_na: true, na_condition: '' },
      { ...withTypeDefaults(blankCriterion(), 'flag'), title: 'f', definition: 'd', weight: '5', flag_when_choice_ids: [] },
    ],
    sections: [],
  };
  const e = validateDraft(d, new Set());
  expect(e.title).toBeTruthy();
  expect(e['criterion.0.choice.1.fraction']).toMatch(/больше 1/);
  expect(e['criterion.0.weight']).toBeTruthy();
  expect(e['criterion.0.na']).toBeTruthy();
  expect(e['criterion.1.weight']).toMatch(/0/);
  expect(e['criterion.1.flag']).toBeTruthy();
});

test('flag choices carry no fraction on the wire; N/A condition null when not allowed', () => {
  const flag = { ...withTypeDefaults(blankCriterion(), 'flag'), title: 'f', definition: 'd', na_condition: 'stale' };
  const wire = toWire({ schema_version: '1.0', title: 't', criteria: [flag], sections: [] });
  expect(wire.criteria[0].choices.every((c) => c.score_fraction === null)).toBe(true);
  expect(wire.criteria[0].na_condition).toBeNull();
  expect(wire.criteria[0].weight).toBe('0');
});

test('existing criterion IDs are preserved when editing a version', () => {
  const d = draftFromVersion(version);
  expect(d.criteria.map((c) => c.id)).toEqual(version.criteria.map((c) => c.id));
});

test('diff and weight-only detection', () => {
  const weightOnly = draftFromVersion(version);
  weightOnly.criteria[0] = { ...weightOnly.criteria[0], weight: '55' };
  expect(isScoringOnlyChange(version, weightOnly)).toBe(true);
  const semantic = draftFromVersion(version);
  semantic.criteria[0] = { ...semantic.criteria[0], definition: 'Новое определение' };
  expect(isScoringOnlyChange(version, semantic)).toBe(false);
  const next = { ...version, version_id: 'v2', criteria: [...semantic.criteria.slice(1), { ...blankCriterion(), id: 'new-one', title: 'Новый' }] } as ChecklistVersion;
  const diff = diffVersions(version, next);
  expect(diff.criteria.find((c) => c.id === 'new-one')?.kind).toBe('added');
  expect(diff.criteria.find((c) => c.id === version.criteria[0].id)?.kind).toBe('removed');
});
