// What differs between two saved evaluations of the same conversation text, per criterion.
// Display only: every number comes from the server ScoreSummary of each side (domain
// scoring). Nothing here recomputes a score; decimal strings are compared exactly.
import type {
  ChecklistVersion,
  Choice,
  Criterion,
  CriterionProposal,
  EvaluationView,
  FlagResult,
  ScoreContribution,
  ScoreSummary,
} from '../api/types';
import { diffVersions } from './checklistDraft';

export type Scope = 'automatic' | 'effective';

export type ChangeKind =
  | 'added'
  | 'removed'
  | 'rule'
  | 'na_rule'
  | 'scale'
  | 'weight'
  | 'section'
  | 'answer'
  | 'answer_meaning'
  | 'applicability'
  | 'missing'
  | 'flag'
  | 'contribution';

export const changeKindLabel: Record<ChangeKind, string> = {
  added: 'Критерий добавлен',
  removed: 'Критерий удалён',
  rule: 'Изменено правило',
  na_rule: 'Изменены условия N/A',
  scale: 'Изменена шкала',
  weight: 'Изменился вес',
  section: 'Изменилась секция',
  answer: 'Изменился ответ',
  answer_meaning: 'Тот же вариант ответа, но другой смысл или доля',
  applicability: 'Изменилась применимость',
  missing: 'Ответ есть только с одной стороны',
  flag: 'Изменился флаг нарушения',
  contribution: 'Изменился вклад в итог',
};

/** Groups for the summary. A criterion can belong to several groups at once. */
export const RULE_KINDS: ChangeKind[] = ['added', 'removed', 'rule', 'na_rule', 'scale', 'weight', 'section'];
export const ANSWER_KINDS: ChangeKind[] = ['answer', 'answer_meaning', 'applicability', 'missing', 'flag'];
export const CONTRIBUTION_KINDS: ChangeKind[] = ['contribution'];

const RULE_FIELDS = new Set([
  'title',
  'definition',
  'response_type',
  'channel_instructions',
  'evidence_policy',
  'requires_reference',
  'flag_when_choice_ids',
]);
const NA_FIELDS = new Set(['allow_na', 'na_condition']);
const SCALE_FIELDS = new Set(['choices', 'fractions']);

export interface Side {
  view: EvaluationView;
  version: ChecklistVersion;
  scope: Scope;
}

export interface SideCell {
  criterion?: Criterion;
  proposal?: CriterionProposal;
  contribution?: ScoreContribution;
  flag?: FlagResult;
}

export interface ComparisonRow {
  id: string;
  title: string;
  left: SideCell;
  right: SideCell;
  kinds: ChangeKind[];
  /** diffVersions field names for this criterion (rule/scale/weight details). */
  fields: string[];
}

export function proposalsOf(view: EvaluationView, scope: Scope): CriterionProposal[] {
  return scope === 'automatic' ? view.artifact.automatic_final : view.effective_proposals;
}

export function scoreOf(view: EvaluationView, scope: Scope): ScoreSummary {
  return scope === 'automatic' ? view.automatic_score : view.effective_score;
}

/** "20.00" and "20" are the same decimal. Exact string normalisation, no float. */
export function normDecimal(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  let s = value.trim().replace(/^\+/, '');
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (/^-?0*$/.test(s)) return '0';
  return s.replace(/^(-?)0+(?=\d)/, '$1');
}

function choiceSemantics(c: Choice | undefined): string {
  return c ? JSON.stringify([c.label, c.raw_value, c.anchor, normDecimal(c.score_fraction)]) : '';
}

function contributionKey(c: ScoreContribution | undefined): string {
  if (!c) return '';
  return JSON.stringify([
    c.applicability,
    normDecimal(c.earned_weight),
    normDecimal(c.applicable_weight),
    normDecimal(c.normalized_contribution),
  ]);
}

function cell(side: Side, id: string): SideCell {
  const score = scoreOf(side.view, side.scope);
  return {
    criterion: side.version.criteria.find((c) => c.id === id),
    proposal: proposalsOf(side.view, side.scope).find((p) => p.criterion_id === id),
    contribution: score.contributions.find((c) => c.criterion_id === id),
    flag: score.flags.find((f) => f.criterion_id === id),
  };
}

export function compareEvaluations(left: Side, right: Side): ComparisonRow[] {
  const diff = new Map(diffVersions(left.version, right.version).criteria.map((c) => [c.id, c]));
  const ids = [...new Set([...right.version.criteria.map((c) => c.id), ...left.version.criteria.map((c) => c.id)])];
  return ids.map((id) => {
    const l = cell(left, id);
    const r = cell(right, id);
    const kinds: ChangeKind[] = [];
    const change = diff.get(id);
    const fields = change?.fields ?? [];
    if (!l.criterion) kinds.push('added');
    else if (!r.criterion) kinds.push('removed');
    else {
      if (fields.some((f) => RULE_FIELDS.has(f))) kinds.push('rule');
      if (fields.some((f) => NA_FIELDS.has(f))) kinds.push('na_rule');
      if (fields.some((f) => SCALE_FIELDS.has(f))) kinds.push('scale');
      if (fields.includes('weight')) kinds.push('weight');
      if (fields.includes('section_id')) kinds.push('section');
      const a = l.proposal;
      const b = r.proposal;
      if (!a !== !b) kinds.push('missing');
      if (a && b) {
        if (a.applicability !== b.applicability) kinds.push('applicability');
        else if (a.applicability === 'applicable' && a.answer_choice_id !== b.answer_choice_id) kinds.push('answer');
        else if (a.applicability === 'applicable') {
          // Same choice ID: only the same meaning if label/raw/anchor/fraction are unchanged.
          const before = l.criterion.choices.find((c) => c.id === a.answer_choice_id);
          const after = r.criterion.choices.find((c) => c.id === b.answer_choice_id);
          if (choiceSemantics(before) !== choiceSemantics(after)) kinds.push('answer_meaning');
        }
      }
      if ((l.flag || r.flag) && l.flag?.detected !== r.flag?.detected) kinds.push('flag');
    }
    if ((l.contribution || r.contribution) && contributionKey(l.contribution) !== contributionKey(r.contribution))
      kinds.push('contribution');
    return {
      id,
      title: r.criterion?.title ?? l.criterion?.title ?? id,
      left: l,
      right: r,
      kinds,
      fields: fields.filter((f) => f !== 'order'),
    };
  });
}

export function summarize(rows: ComparisonRow[]) {
  const count = (group: ChangeKind[]) => rows.filter((r) => r.kinds.some((k) => group.includes(k))).length;
  return {
    total: rows.length,
    changed: rows.filter((r) => r.kinds.length > 0).length,
    rules: count(RULE_KINDS),
    answers: count(ANSWER_KINDS),
    contributions: count(CONTRIBUTION_KINDS),
  };
}

/** Exact difference b − a of two server totals (display only; both must be complete). */
export function decimalDelta(a: string, b: string): string {
  const scale = Math.max(...[a, b].map((v) => (v.includes('.') ? v.split('.')[1].length : 0)));
  const toInt = (v: string) => {
    const neg = v.startsWith('-');
    const [i, f = ''] = v.replace(/^[-+]/, '').split('.');
    const n = BigInt(i + (f + '0'.repeat(scale)).slice(0, scale));
    return neg ? -n : n;
  };
  const d = toInt(b) - toInt(a);
  const abs = (d < 0n ? -d : d).toString().padStart(scale + 1, '0');
  const body = scale ? `${abs.slice(0, -scale)}.${abs.slice(-scale)}` : abs;
  return `${d < 0n ? '−' : d > 0n ? '+' : '±'}${body}`;
}
