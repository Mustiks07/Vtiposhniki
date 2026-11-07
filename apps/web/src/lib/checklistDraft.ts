// Editor helpers for checklist drafts. Final validation is the API's (A's validate_checklist);
// these checks only give early, field-level feedback and never alter meaning silently.
import type { ChecklistDraft, ChecklistVersion, Choice, Criterion, Section } from '../api/types';

export type Fields = Record<string, string>;

const DECIMAL = /^\d+(\.\d+)?$/;

function rand(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}

export const newCriterionId = () => `crit_${rand()}`;
export const newChoiceId = () => `ch_${rand()}`;
export const newSectionId = () => `sec_${rand()}`;

export function blankChoice(over: Partial<Choice> = {}): Choice {
  return { schema_version: '1.0', id: newChoiceId(), label: '', raw_value: '', anchor: '', score_fraction: '', ...over };
}

export function blankCriterion(type: Criterion['response_type'] = 'binary'): Criterion {
  const c: Criterion = {
    schema_version: '1.0',
    id: newCriterionId(),
    title: '',
    definition: '',
    response_type: type,
    choices: [],
    allow_na: false,
    na_condition: null,
    channel_instructions: { schema_version: '1.0', agent_chat: '', voice_call: '', voice_policy_version: 'text-observable-v1' },
    evidence_policy: { schema_version: '1.0', require_evidence: true, missing_action_requires_range: true, allow_source: true },
    requires_reference: false,
    weight: type === 'flag' ? '0' : '10',
    section_id: null,
    flag_when_choice_ids: [],
  };
  return withTypeDefaults(c, type);
}

/** Default choices when the type changes. Binary/flag get Да/Нет; a scale starts empty. */
export function withTypeDefaults(c: Criterion, type: Criterion['response_type']): Criterion {
  if (type === 'scale') {
    return { ...c, response_type: type, weight: c.response_type === 'flag' ? '10' : c.weight, flag_when_choice_ids: [], choices: [blankChoice({ raw_value: 0 }), blankChoice({ raw_value: 1 })] };
  }
  const yes = blankChoice({ label: 'Да', raw_value: true, anchor: '', score_fraction: type === 'flag' ? null : '1' });
  const no = blankChoice({ label: 'Нет', raw_value: false, anchor: '', score_fraction: type === 'flag' ? null : '0' });
  return {
    ...c,
    response_type: type,
    weight: type === 'flag' ? '0' : c.response_type === 'flag' ? '10' : c.weight,
    choices: [yes, no],
    flag_when_choice_ids: type === 'flag' ? [yes.id] : [],
    allow_na: type === 'flag' ? false : c.allow_na,
  };
}

export function draftFromVersion(v: ChecklistVersion): ChecklistDraft {
  return {
    schema_version: '1.0',
    title: v.title,
    criteria: v.criteria.map((c) => ({ ...c, choices: c.choices.map((x) => ({ ...x })) })),
    sections: (v.sections ?? []).map((s) => ({ ...s })),
    rounding: v.rounding,
  };
}

export function blankDraft(): ChecklistDraft {
  return { schema_version: '1.0', title: '', criteria: [blankCriterion()], sections: [] };
}

/** Numeric raw values of a scale (non-numeric raw values make the scale "custom"). */
function numericRaws(c: Criterion): number[] | null {
  const raws = c.choices.map((x) => (typeof x.raw_value === 'number' ? x.raw_value : Number.NaN));
  return raws.some((r) => Number.isNaN(r)) ? null : raws;
}

/**
 * True when the scale needs an explicit confirmation of the answer→fraction mapping:
 * the lowest step is not zero, or fractions do not grow with raw values (reverse scale).
 */
export function needsMappingConfirmation(c: Criterion): boolean {
  if (c.response_type !== 'scale') return false;
  const raws = numericRaws(c);
  if (!raws) return true;
  if (Math.min(...raws) !== 0) return true;
  const pairs = c.choices
    .map((x) => ({ raw: x.raw_value as number, f: x.score_fraction }))
    .filter((p) => p.f !== null && p.f !== '' && DECIMAL.test(p.f!))
    .sort((a, b) => a.raw - b.raw);
  for (let i = 1; i < pairs.length; i++) if (Number(pairs[i].f) < Number(pairs[i - 1].f)) return true;
  return false;
}

/**
 * Identity of an answer→fraction mapping: the set of choices with their raw values and
 * fractions. A confirmation is bound to this exact value; weight, title, anchors or section
 * do not change it, any change of raw_value/score_fraction/choices does.
 */
export function mappingSignature(c: Criterion): string {
  return JSON.stringify(
    [...c.choices].sort((a, b) => a.id.localeCompare(b.id)).map((x) => [x.id, x.raw_value, x.score_fraction ?? null]),
  );
}

/** Confirmations keyed by criterion ID, each holding the signature that was confirmed. */
export type MappingConfirmations = ReadonlyMap<string, string>;

export function isMappingConfirmed(c: Criterion, confirmations: MappingConfirmations): boolean {
  return confirmations.get(c.id) === mappingSignature(c);
}

/** Fixed-point string of n/d with up to `places` decimals, trailing zeros trimmed (no float). */
export function ratio(n: number, d: number, places = 4): string {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d <= 0) return '';
  const scale = 10n ** BigInt(places);
  const q = (BigInt(n) * scale * 10n) / BigInt(d);
  const rounded = (q + 5n) / 10n; // half-up on the next digit, suggestion only
  const s = rounded.toString().padStart(places + 1, '0');
  const int = s.slice(0, -places);
  const frac = s.slice(-places).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

/** Suggests raw/max fractions for a zero-based integer scale; returns null otherwise. */
export function suggestRawOverMax(c: Criterion): Choice[] | null {
  const raws = numericRaws(c);
  if (!raws || Math.min(...raws) !== 0 || raws.some((r) => !Number.isInteger(r))) return null;
  const max = Math.max(...raws);
  if (max <= 0) return null;
  return c.choices.map((x) => ({ ...x, score_fraction: ratio(x.raw_value as number, max) }));
}

export function validateDraft(d: ChecklistDraft, confirmed: MappingConfirmations): Fields {
  const e: Fields = {};
  if (!d.title.trim()) e.title = 'Укажите название чек-листа.';
  if (!d.criteria.length) e.criteria = 'Нужен хотя бы один критерий.';
  const sectionIds = new Set((d.sections ?? []).map((s: Section) => s.id));
  (d.sections ?? []).forEach((s, i) => {
    if (!s.title.trim()) e[`section.${i}.title`] = 'Укажите название секции.';
  });
  const seen = new Set<string>();
  d.criteria.forEach((c, i) => {
    const p = `criterion.${i}`;
    if (seen.has(c.id)) e[`${p}.id`] = 'ID критерия повторяется.';
    seen.add(c.id);
    if (!c.title.trim()) e[`${p}.title`] = 'Укажите название критерия.';
    if (!c.definition.trim()) e[`${p}.definition`] = 'Укажите определение.';
    if (!DECIMAL.test(c.weight)) e[`${p}.weight`] = 'Вес — неотрицательное число (например, 15 или 7.5).';
    if (c.response_type === 'flag' && DECIMAL.test(c.weight) && Number(c.weight) !== 0) e[`${p}.weight`] = 'У флага вес равен 0.';
    if (c.section_id && !sectionIds.has(c.section_id)) e[`${p}.section`] = 'Секция не найдена.';
    if (c.allow_na && !(c.na_condition ?? '').trim()) e[`${p}.na`] = 'Для разрешённого N/A опишите условие неприменимости.';
    if (c.choices.length < 2) e[`${p}.choices`] = 'Нужно минимум два варианта ответа.';
    const choiceIds = new Set<string>();
    c.choices.forEach((x, j) => {
      const q = `${p}.choice.${j}`;
      if (!x.id.trim() || choiceIds.has(x.id)) e[`${q}.id`] = 'ID варианта пустой или повторяется.';
      choiceIds.add(x.id);
      if (!x.label.trim()) e[`${q}.label`] = 'Подпись обязательна.';
      if (!x.anchor.trim()) e[`${q}.anchor`] = 'Опишите смысл ступени.';
      if (x.raw_value === '' || x.raw_value === null) e[`${q}.raw`] = 'Укажите raw_value.';
      if (c.response_type === 'flag') {
        if (x.score_fraction !== null) e[`${q}.fraction`] = 'У флага доли нет.';
      } else if (x.score_fraction === null || !DECIMAL.test(x.score_fraction)) {
        e[`${q}.fraction`] = 'Доля — число от 0 до 1 (например, 0.7).';
      } else if (Number(x.score_fraction) > 1) {
        e[`${q}.fraction`] = 'Доля не может быть больше 1.';
      }
    });
    if (c.response_type === 'flag' && !(c.flag_when_choice_ids ?? []).length) e[`${p}.flag`] = 'Отметьте ответ, означающий нарушение.';
    if (needsMappingConfirmation(c) && !isMappingConfirmed(c, confirmed))
      e[`${p}.mapping`] = 'Шкала с ненулевой нижней ступенью или обратная: подтвердите отображение ответов в доли.';
  });
  return e;
}

/** Normalises a draft for the wire: N/A condition null when N/A is not allowed. */
export function toWire(d: ChecklistDraft): ChecklistDraft {
  return {
    ...d,
    schema_version: '1.0',
    criteria: d.criteria.map((c) => ({
      ...c,
      schema_version: '1.0',
      na_condition: c.allow_na ? (c.na_condition ?? '').trim() || null : null,
      choices: c.choices.map((x) => ({ ...x, schema_version: '1.0', score_fraction: c.response_type === 'flag' ? null : x.score_fraction })),
    })),
  };
}

/** Parses the raw_value input according to the criterion type (no silent coercion of meaning). */
export function parseRaw(type: Criterion['response_type'], text: string): boolean | number | string {
  if (type !== 'scale') {
    if (text === 'true') return true;
    if (text === 'false') return false;
    return text;
  }
  if (/^-?\d+(\.\d+)?$/.test(text.trim())) return Number(text.trim());
  return text;
}

// ---------- version comparison ----------

export interface CriterionChange {
  id: string;
  title: string;
  kind: 'added' | 'removed' | 'changed';
  fields: string[];
}

const fieldLabels: Record<string, string> = {
  title: 'название',
  definition: 'определение',
  response_type: 'тип',
  weight: 'вес',
  section_id: 'секция',
  allow_na: 'разрешение N/A',
  na_condition: 'условие N/A',
  channel_instructions: 'инструкции для канала',
  evidence_policy: 'требования к доказательствам',
  requires_reference: 'необходимость источника',
  flag_when_choice_ids: 'ответы-нарушения',
  choices: 'варианты ответа',
  fractions: 'доли вариантов',
  order: 'порядок',
};

export function fieldLabel(f: string): string {
  return fieldLabels[f] ?? f;
}

/** Field-level differences between two immutable versions (display only). */
export function diffVersions(a: ChecklistVersion, b: ChecklistVersion): { criteria: CriterionChange[]; sections: string[]; title: boolean } {
  const before = new Map(a.criteria.map((c, i) => [c.id, { c, i }]));
  const after = new Map(b.criteria.map((c, i) => [c.id, { c, i }]));
  const out: CriterionChange[] = [];
  for (const [id, { c, i }] of after) {
    const prev = before.get(id);
    if (!prev) {
      out.push({ id, title: c.title, kind: 'added', fields: [] });
      continue;
    }
    const fields: string[] = [];
    const p = prev.c;
    for (const k of ['title', 'definition', 'response_type', 'weight', 'section_id', 'allow_na', 'na_condition', 'requires_reference'] as const) {
      if (JSON.stringify(p[k] ?? null) !== JSON.stringify(c[k] ?? null)) fields.push(k);
    }
    if (JSON.stringify(p.channel_instructions) !== JSON.stringify(c.channel_instructions)) fields.push('channel_instructions');
    if (JSON.stringify(p.evidence_policy) !== JSON.stringify(c.evidence_policy)) fields.push('evidence_policy');
    if (JSON.stringify([...(p.flag_when_choice_ids ?? [])].sort()) !== JSON.stringify([...(c.flag_when_choice_ids ?? [])].sort()))
      fields.push('flag_when_choice_ids');
    const semanticChoices = (x: Criterion) =>
      JSON.stringify([...x.choices].sort((m, n) => m.id.localeCompare(n.id)).map((ch) => [ch.id, ch.label, ch.raw_value, ch.anchor]));
    const fractionChoices = (x: Criterion) =>
      JSON.stringify([...x.choices].sort((m, n) => m.id.localeCompare(n.id)).map((ch) => [ch.id, ch.score_fraction]));
    if (semanticChoices(p) !== semanticChoices(c)) fields.push('choices');
    if (fractionChoices(p) !== fractionChoices(c)) fields.push('fractions');
    if (prev.i !== i) fields.push('order');
    if (fields.length) out.push({ id, title: c.title, kind: 'changed', fields });
  }
  for (const [id, { c }] of before) if (!after.has(id)) out.push({ id, title: c.title, kind: 'removed', fields: [] });
  const sa = JSON.stringify((a.sections ?? []).map((s) => [s.id, s.title]));
  const sb = JSON.stringify((b.sections ?? []).map((s) => [s.id, s.title]));
  return { criteria: out, sections: sa === sb ? [] : ['sections'], title: a.title !== b.title };
}

const SCORING_ONLY = new Set(['weight', 'fractions', 'section_id', 'order']);

/** True when only weights/fractions/sections/order changed: the semantic request is unchanged. */
export function isScoringOnlyChange(base: ChecklistVersion, draft: ChecklistDraft): boolean {
  const pseudo = { ...base, ...draft, criteria: draft.criteria, sections: draft.sections ?? [] } as ChecklistVersion;
  const d = diffVersions(base, pseudo);
  if (!d.criteria.length && !d.sections.length) return false;
  return d.criteria.every((c) => c.kind === 'changed' && c.fields.every((f) => SCORING_ONLY.has(f)));
}
