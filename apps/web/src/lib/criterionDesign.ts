import type { Criterion, CriterionBlueprint } from '../api/types';
import { blankCriterion, newChoiceId } from './checklistDraft';

/** Only an explicit "add to draft" action invokes this. Scored weight stays empty. */
export function criterionFromBlueprint(value: CriterionBlueprint): Criterion {
  const ids = new Map(value.choices.map((c) => [c.id, newChoiceId()]));
  return {
    ...blankCriterion(value.response_type),
    title: value.title, definition: value.definition, response_type: value.response_type,
    choices: value.choices.map((c) => ({ ...c, id: ids.get(c.id)! })),
    allow_na: value.allow_na, na_condition: value.na_condition,
    flag_when_choice_ids: (value.flag_when_choice_ids ?? []).map((id) => ids.get(id)!),
    weight: value.response_type === 'flag' ? '0' : '',
  };
}
