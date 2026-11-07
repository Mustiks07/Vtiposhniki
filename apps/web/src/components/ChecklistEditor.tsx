import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { ChecklistDraft, ChecklistVersion, Choice, Criterion } from '../api/types';
import {
  blankChoice,
  blankCriterion,
  isMappingConfirmed,
  isScoringOnlyChange,
  mappingSignature,
  needsMappingConfirmation,
  newCriterionId,
  newSectionId,
  parseRaw,
  suggestRawOverMax,
  toWire,
  validateDraft,
  withTypeDefaults,
  type Fields,
} from '../lib/checklistDraft';
import { rawValueText, shortId } from '../lib/format';
import { responseTypeLabel } from '../lib/labels';
import { ErrorPanel, Loading } from './States';
import { VersionDiff } from './VersionDiff';
import { UnsavedChanges } from './UnsavedChanges';
import { ScaleTable } from './CriterionDetail';

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={id} className="field-error">
      {error}
    </p>
  ) : null;
}

function ChoicesEditor({
  criterion,
  index,
  errors,
  onChange,
}: {
  criterion: Criterion;
  index: number;
  errors: Fields;
  onChange: (c: Criterion) => void;
}) {
  const base = `c${index}`;
  const isFlag = criterion.response_type === 'flag';
  function setChoice(j: number, patch: Partial<Choice>) {
    onChange({ ...criterion, choices: criterion.choices.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
  }
  function move(j: number, dir: -1 | 1) {
    const next = [...criterion.choices];
    const t = j + dir;
    if (t < 0 || t >= next.length) return;
    [next[j], next[t]] = [next[t], next[j]];
    onChange({ ...criterion, choices: next });
  }
  return (
    <fieldset>
      <legend>Варианты ответа</legend>
      <div className="table-wrap" tabIndex={0} aria-label={`Варианты ответа критерия ${index + 1}`}>
        <table className="table compact choices-editor">
          <thead>
            <tr>
              <th scope="col">Подпись</th>
              <th scope="col">raw_value</th>
              <th scope="col">Смысл ступени (anchor)</th>
              {isFlag ? <th scope="col">Означает нарушение</th> : <th scope="col">Доля score_fraction (0–1)</th>}
              <th scope="col">Действия</th>
            </tr>
          </thead>
          <tbody>
            {criterion.choices.map((x, j) => {
              const q = `criterion.${index}.choice.${j}`;
              const n = j + 1;
              return (
                <tr key={x.id} data-testid="choice-row">
                  <td>
                    <input
                      aria-label={`Подпись варианта ${n}`}
                      value={x.label}
                      onChange={(e) => setChoice(j, { label: e.target.value })}
                      aria-invalid={errors[`${q}.label`] ? true : undefined}
                      aria-describedby={`${base}-ch${j}-err`}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`raw_value варианта ${n}`}
                      value={rawValueText(x.raw_value === '' ? null : x.raw_value).replace('—', '')}
                      onChange={(e) => setChoice(j, { raw_value: parseRaw(criterion.response_type, e.target.value) })}
                      aria-invalid={errors[`${q}.raw`] ? true : undefined}
                      aria-describedby={`${base}-ch${j}-err`}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Смысл ступени варианта ${n}`}
                      value={x.anchor}
                      onChange={(e) => setChoice(j, { anchor: e.target.value })}
                      aria-invalid={errors[`${q}.anchor`] ? true : undefined}
                      aria-describedby={`${base}-ch${j}-err`}
                    />
                  </td>
                  <td>
                    {isFlag ? (
                      <input
                        type="checkbox"
                        aria-label={`Вариант ${n} означает нарушение`}
                        checked={(criterion.flag_when_choice_ids ?? []).includes(x.id)}
                        onChange={(e) =>
                          onChange({
                            ...criterion,
                            flag_when_choice_ids: e.target.checked
                              ? [...(criterion.flag_when_choice_ids ?? []), x.id]
                              : (criterion.flag_when_choice_ids ?? []).filter((id) => id !== x.id),
                          })
                        }
                      />
                    ) : (
                      <input
                        aria-label={`Доля варианта ${n}`}
                        inputMode="decimal"
                        value={x.score_fraction ?? ''}
                        onChange={(e) => setChoice(j, { score_fraction: e.target.value.replace(',', '.') })}
                        aria-invalid={errors[`${q}.fraction`] ? true : undefined}
                        aria-describedby={`${base}-ch${j}-err`}
                      />
                    )}
                  </td>
                  <td className="row">
                    <button
                      type="button"
                      onClick={() => move(j, -1)}
                      disabled={j === 0}
                      aria-label={`Вариант ${n} выше`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(j, 1)}
                      disabled={j === criterion.choices.length - 1}
                      aria-label={`Вариант ${n} ниже`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...criterion,
                          choices: criterion.choices.filter((_, k) => k !== j),
                          flag_when_choice_ids: (criterion.flag_when_choice_ids ?? []).filter((id) => id !== x.id),
                        })
                      }
                      aria-label={`Удалить вариант ${n}`}
                    >
                      ✕
                    </button>
                    <span id={`${base}-ch${j}-err`} className="field-error">
                      {[
                        errors[`${q}.label`],
                        errors[`${q}.raw`],
                        errors[`${q}.anchor`],
                        errors[`${q}.fraction`],
                        errors[`${q}.id`],
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FieldError id={`${base}-choices-err`} error={errors[`criterion.${index}.choices`]} />
      <FieldError id={`${base}-flag-err`} error={errors[`criterion.${index}.flag`]} />
      <div className="row">
        <button
          type="button"
          onClick={() =>
            onChange({
              ...criterion,
              choices: [
                ...criterion.choices,
                blankChoice({
                  score_fraction: isFlag ? null : '',
                  raw_value: criterion.response_type === 'scale' ? '' : '',
                }),
              ],
            })
          }
        >
          + Вариант
        </button>
      </div>
    </fieldset>
  );
}

function CriterionEditor({
  criterion,
  index,
  total,
  sections,
  errors,
  existing,
  confirmed,
  onConfirm,
  onChange,
  onMove,
  onRemove,
  onReplace,
}: {
  criterion: Criterion;
  index: number;
  total: number;
  sections: { id: string; title: string }[];
  errors: Fields;
  existing: boolean;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
  onChange: (c: Criterion) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onReplace: () => void;
}) {
  const uid = useId();
  const p = `criterion.${index}`;
  const n = index + 1;
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const isFlag = criterion.response_type === 'flag';
  const mapping = needsMappingConfirmation(criterion);

  function suggest() {
    const s = suggestRawOverMax(criterion);
    if (!s) {
      setSuggestion('Подсказка raw/max доступна только для целочисленной шкалы с нижней ступенью 0.');
      return;
    }
    onChange({ ...criterion, choices: s });
    onConfirm(false);
    setSuggestion('Доли заполнены как raw/max. Проверьте каждую долю перед сохранением.');
  }

  return (
    <section
      tabIndex={-1}
      className="editor-criterion"
      aria-labelledby={`${uid}-h`}
      data-testid="editor-criterion"
      data-criterion-id={criterion.id}
    >
      <header>
        <h3 id={`${uid}-h`}>
          Критерий {n}: {criterion.title || 'без названия'}
        </h3>
        <div className="row">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Переместить критерий ${n} выше`}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Переместить критерий ${n} ниже`}
          >
            ↓
          </button>
          {existing ? (
            <button type="button" onClick={onReplace} title="Создать новый критерий с новым ID на месте этого">
              Заменить новым
            </button>
          ) : null}
          <button type="button" onClick={onRemove} aria-label={`Удалить критерий ${n}`}>
            Удалить
          </button>
        </div>
      </header>
      <p className="muted">
        ID <code>{criterion.id}</code> {existing ? '· существующий (ID сохраняется)' : '· новый'}
      </p>
      <div className="grid-2">
        <div>
          <label htmlFor={`${uid}-title`}>Название</label>
          <input
            id={`${uid}-title`}
            value={criterion.title}
            onChange={(e) => onChange({ ...criterion, title: e.target.value })}
            aria-invalid={errors[`${p}.title`] ? true : undefined}
            aria-describedby={`${uid}-title-e`}
          />
          <FieldError id={`${uid}-title-e`} error={errors[`${p}.title`]} />
        </div>
        <div>
          <label htmlFor={`${uid}-type`}>Тип ответа</label>
          <select
            id={`${uid}-type`}
            value={criterion.response_type}
            onChange={(e) => {
              onChange(withTypeDefaults(criterion, e.target.value as Criterion['response_type']));
              onConfirm(false);
            }}
          >
            {(['binary', 'scale', 'flag'] as const).map((t) => (
              <option key={t} value={t}>
                {responseTypeLabel[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-weight`}>Вес</label>
          <input
            id={`${uid}-weight`}
            inputMode="decimal"
            value={criterion.weight}
            disabled={isFlag}
            onChange={(e) => onChange({ ...criterion, weight: e.target.value.replace(',', '.') })}
            aria-invalid={errors[`${p}.weight`] ? true : undefined}
            aria-describedby={`${uid}-weight-h ${uid}-weight-e`}
          />
          <small id={`${uid}-weight-h`} className="hint">
            {isFlag
              ? 'У флага вес всегда 0: флаг не входит в итог.'
              : 'Неотрицательное число. Сумма весов не обязана быть 100.'}
          </small>
          <FieldError id={`${uid}-weight-e`} error={errors[`${p}.weight`]} />
        </div>
        <div>
          <label htmlFor={`${uid}-section`}>Секция</label>
          <select
            id={`${uid}-section`}
            value={criterion.section_id ?? ''}
            onChange={(e) => onChange({ ...criterion, section_id: e.target.value || null })}
            aria-describedby={`${uid}-section-e`}
          >
            <option value="">Без секции</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || s.id}
              </option>
            ))}
          </select>
          <FieldError id={`${uid}-section-e`} error={errors[`${p}.section`]} />
        </div>
      </div>
      <label htmlFor={`${uid}-def`}>Определение</label>
      <textarea
        id={`${uid}-def`}
        rows={3}
        value={criterion.definition}
        onChange={(e) => onChange({ ...criterion, definition: e.target.value })}
        aria-invalid={errors[`${p}.definition`] ? true : undefined}
        aria-describedby={`${uid}-def-e`}
      />
      <FieldError id={`${uid}-def-e`} error={errors[`${p}.definition`]} />

      <ChoicesEditor criterion={criterion} index={index} errors={errors} onChange={onChange} />

      {criterion.response_type === 'scale' ? (
        <div className="notice">
          <div className="row">
            <button type="button" onClick={suggest}>
              Предложить доли raw/max
            </button>
            {suggestion ? <span className="hint">{suggestion}</span> : null}
          </div>
          {mapping ? (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => onConfirm(e.target.checked)}
                  aria-describedby={`${uid}-map-e`}
                />{' '}
                Подтверждаю отображение ответов в доли (ненулевая нижняя ступень или обратная шкала)
              </label>
              <FieldError id={`${uid}-map-e`} error={errors[`${p}.mapping`]} />
            </>
          ) : null}
        </div>
      ) : null}

      {!isFlag ? (
        <>
          <label>
            <input
              type="checkbox"
              checked={criterion.allow_na}
              onChange={(e) =>
                onChange({
                  ...criterion,
                  allow_na: e.target.checked,
                  na_condition: e.target.checked ? (criterion.na_condition ?? '') : null,
                })
              }
            />{' '}
            Разрешить N/A (отдельное состояние, не вариант с нулевой долей)
          </label>
          {criterion.allow_na ? (
            <>
              <label htmlFor={`${uid}-na`}>Условие неприменимости</label>
              <textarea
                id={`${uid}-na`}
                rows={2}
                value={criterion.na_condition ?? ''}
                onChange={(e) => onChange({ ...criterion, na_condition: e.target.value })}
                aria-invalid={errors[`${p}.na`] ? true : undefined}
                aria-describedby={`${uid}-na-e`}
              />
              <FieldError id={`${uid}-na-e`} error={errors[`${p}.na`]} />
            </>
          ) : null}
        </>
      ) : null}

      <details>
        <summary>Дополнительно: инструкции для каналов, доказательства, источник</summary>
        <div className="grid-2">
          <div>
            <label htmlFor={`${uid}-chat`}>Инструкция для чатов</label>
            <textarea
              id={`${uid}-chat`}
              rows={2}
              value={criterion.channel_instructions.agent_chat ?? ''}
              onChange={(e) =>
                onChange({
                  ...criterion,
                  channel_instructions: { ...criterion.channel_instructions, agent_chat: e.target.value },
                })
              }
            />
          </div>
          <div>
            <label htmlFor={`${uid}-voice`}>Инструкция для звонков</label>
            <textarea
              id={`${uid}-voice`}
              rows={2}
              value={criterion.channel_instructions.voice_call ?? ''}
              onChange={(e) =>
                onChange({
                  ...criterion,
                  channel_instructions: { ...criterion.channel_instructions, voice_call: e.target.value },
                })
              }
            />
          </div>
        </div>
        <label>
          <input
            type="checkbox"
            checked={criterion.evidence_policy.require_evidence ?? true}
            onChange={(e) =>
              onChange({
                ...criterion,
                evidence_policy: { ...criterion.evidence_policy, require_evidence: e.target.checked },
              })
            }
          />{' '}
          Требовать доказательства
        </label>
        <label>
          <input
            type="checkbox"
            checked={criterion.evidence_policy.missing_action_requires_range ?? true}
            onChange={(e) =>
              onChange({
                ...criterion,
                evidence_policy: { ...criterion.evidence_policy, missing_action_requires_range: e.target.checked },
              })
            }
          />{' '}
          Для пропущенного действия нужен проверенный диапазон
        </label>
        <label>
          <input
            type="checkbox"
            checked={criterion.evidence_policy.allow_source ?? true}
            onChange={(e) =>
              onChange({
                ...criterion,
                evidence_policy: { ...criterion.evidence_policy, allow_source: e.target.checked },
              })
            }
          />{' '}
          Разрешить ссылки на источники
        </label>
        <label>
          <input
            type="checkbox"
            checked={criterion.requires_reference}
            onChange={(e) => onChange({ ...criterion, requires_reference: e.target.checked })}
          />{' '}
          Нужен источник (база знаний)
        </label>
      </details>
    </section>
  );
}

/**
 * After a 409 the user compares the version they edited against the newer latest version
 * and explicitly moves the draft onto it. Only this action changes the expected version.
 */
function ConflictResolution({
  checklistId,
  expectedVersionId,
  onRebase,
}: {
  checklistId: string;
  expectedVersionId: string;
  onRebase: (latestVersionId: string) => void;
}) {
  const [state, setState] = useState<{ from: ChecklistVersion; to: ChecklistVersion } | 'loading' | 'error' | null>(
    null,
  );
  async function load() {
    setState('loading');
    try {
      const { items } = await api.listChecklistVersions(checklistId);
      const latest = items.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
      const from = items.find((v) => v.version_id === expectedVersionId) ?? latest;
      setState({ from, to: latest });
    } catch {
      setState('error');
    }
  }
  return (
    <div className="state state-error" role="alert" data-testid="version-conflict">
      <p className="state-title">⚠ Версия не сохранена: появилась более новая версия чек-листа</p>
      <p>
        Черновик основан на версии <code>{shortId(expectedVersionId)}</code> и сохранён на этой странице. Сверьте
        изменения другого автора и перенесите свои, прежде чем сохранять.
      </p>
      {state === null || state === 'error' ? (
        <button type="button" onClick={load}>
          Сверить с последней версией
        </button>
      ) : null}
      {state === 'loading' ? <Loading /> : null}
      {state === 'error' ? <p>Не удалось загрузить версии. Повторите.</p> : null}
      {typeof state === 'object' && state ? (
        <>
          <VersionDiff from={state.from} to={state.to} />
          <p>
            Ваш черновик не изменён автоматически: изменения другого автора, которые нужно сохранить, внесите в форму
            сами.
          </p>
          <button type="button" onClick={() => onRebase(state.to.version_id)}>
            Изменения учтены — сохранять поверх версии {shortId(state.to.version_id)}
          </button>
        </>
      ) : null}
    </div>
  );
}

export function ChecklistEditor({
  initial,
  base,
  expectedLatestVersionId,
  checklistId,
  onSaved,
}: {
  initial: ChecklistDraft;
  /** Version the draft was created from; null for a new checklist. */
  base: ChecklistVersion | null;
  /** Latest version known when the draft was opened. Pinned: later refetches never change it. */
  expectedLatestVersionId: string | null;
  checklistId: string | null;
  onSaved: (v: ChecklistVersion) => void;
}) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [draft, setDraft] = useState<ChecklistDraft>(initial);
  const [activeCriterion, setActiveCriterion] = useState(initial.criteria[0]?.id ?? '');
  const [errors, setErrors] = useState<Fields>({});
  // Pinned at draft creation; only an explicit conflict resolution moves it.
  const [expectedLatest, setExpectedLatest] = useState(expectedLatestVersionId);
  const [rebasedNote, setRebasedNote] = useState<string | null>(null);
  // Mapping confirmations bound to the exact mapping. Unchanged scales of the base version
  // count as already confirmed; any change of their mapping invalidates that.
  const [confirmed, setConfirmed] = useState<Map<string, string>>(
    () => new Map((base?.criteria ?? []).map((c) => [c.id, mappingSignature(c)])),
  );
  const existingIds = useMemo(() => new Set(base?.criteria.map((c) => c.id) ?? []), [base]);
  const sections = draft.sections ?? [];

  const mutation = useMutation({
    mutationFn: (body: ChecklistDraft) =>
      checklistId && expectedLatest
        ? api.createChecklistVersion(checklistId, {
            schema_version: '1.0',
            expected_latest_version_id: expectedLatest,
            config: body,
          })
        : api.createChecklist(body),
    onSuccess: async (v) => {
      await queryClient.invalidateQueries({ queryKey: ['checklists'] });
      await queryClient.invalidateQueries({ queryKey: ['checklist-versions', v.checklist_id] });
      onSaved(v);
    },
  });

  function setCriterion(i: number, c: Criterion) {
    setDraft((d) => ({ ...d, criteria: d.criteria.map((x, k) => (k === i ? c : x)) }));
  }
  function move(i: number, dir: -1 | 1) {
    setDraft((d) => {
      const next = [...d.criteria];
      const t = i + dir;
      if (t < 0 || t >= next.length) return d;
      [next[i], next[t]] = [next[t], next[i]];
      return { ...d, criteria: next };
    });
  }
  function confirm(c: Criterion, v: boolean) {
    setConfirmed((s) => {
      const n = new Map(s);
      if (v) n.set(c.id, mappingSignature(c));
      else n.delete(c.id);
      return n;
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mutation.isPending) return;
    const found = validateDraft(draft, confirmed);
    setErrors(found);
    if (Object.keys(found).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    mutation.mutate(toWire(draft));
  }

  const scoringOnly = base ? isScoringOnlyChange(base, draft) : false;
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409;
  const errorCount = Object.keys(errors).length;
  const preview = draft.criteria.find((c) => c.id === activeCriterion) ?? draft.criteria[0];
  function focusCriterion(id: string) {
    setActiveCriterion(id);
    document.querySelector<HTMLElement>(`.editor-criterion[data-criterion-id="${CSS.escape(id)}"]`)?.focus();
  }

  return (
    <form onSubmit={submit} noValidate className="checklist-editor" aria-label="Редактор чек-листа">
      <UnsavedChanges dirty={!mutation.isSuccess && JSON.stringify(draft) !== JSON.stringify(initial)} />
      <p className="hint">
        Сохранение создаёт новую неизменяемую версию. Уже запущенные пакеты и старые карточки остаются на своих версиях.
      </p>
      <label htmlFor={`${uid}-title`}>Название чек-листа</label>
      <input
        id={`${uid}-title`}
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        aria-invalid={errors.title ? true : undefined}
        aria-describedby={`${uid}-title-e`}
      />
      <FieldError id={`${uid}-title-e`} error={errors.title} />

      <fieldset>
        <legend>Секции (необязательно)</legend>
        {sections.map((s, i) => (
          <div key={s.id} className="row">
            <label htmlFor={`${uid}-s${i}`} className="visually-hidden">
              Название секции {i + 1}
            </label>
            <input
              id={`${uid}-s${i}`}
              value={s.title}
              placeholder="Название секции"
              onChange={(e) =>
                setDraft({
                  ...draft,
                  sections: sections.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)),
                })
              }
              aria-invalid={errors[`section.${i}.title`] ? true : undefined}
            />
            <button
              type="button"
              aria-label={`Удалить секцию ${i + 1}`}
              onClick={() =>
                setDraft({
                  ...draft,
                  sections: sections.filter((_, k) => k !== i),
                  criteria: draft.criteria.map((c) => (c.section_id === s.id ? { ...c, section_id: null } : c)),
                })
              }
            >
              ✕
            </button>
            <FieldError id={`${uid}-s${i}-e`} error={errors[`section.${i}.title`]} />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setDraft({ ...draft, sections: [...sections, { schema_version: '1.0', id: newSectionId(), title: '' }] })
          }
        >
          + Секция
        </button>
      </fieldset>

      <div className="editor-workspace">
        <nav className="editor-nav" aria-label="Критерии в редакторе">
          <h2>
            Критерии <span className="muted">{draft.criteria.length}</span>
          </h2>
          {draft.criteria.map((c, i) => (
            <button type="button" key={c.id} aria-pressed={preview?.id === c.id} onClick={() => focusCriterion(c.id)}>
              <span>{i + 1}</span>
              {c.title || 'Новый критерий'}
              {Object.keys(errors).some((key) => key.startsWith(`criterion.${i}.`)) ? (
                <b className="field-error"> !</b>
              ) : null}
            </button>
          ))}
        </nav>
        <div
          className="editor-fields"
          onFocusCapture={(event) => {
            const id = (event.target as HTMLElement).closest<HTMLElement>('[data-criterion-id]')?.dataset.criterionId;
            if (id) setActiveCriterion(id);
          }}
        >
          {draft.criteria.map((c, i) => (
            <CriterionEditor
              key={c.id}
              criterion={c}
              index={i}
              total={draft.criteria.length}
              sections={sections}
              errors={errors}
              existing={existingIds.has(c.id)}
              confirmed={isMappingConfirmed(c, confirmed)}
              onConfirm={(v) => confirm(c, v)}
              onChange={(next) => setCriterion(i, next)}
              onMove={(dir) => move(i, dir)}
              onRemove={() => setDraft((d) => ({ ...d, criteria: d.criteria.filter((_, k) => k !== i) }))}
              onReplace={() => setCriterion(i, { ...c, id: newCriterionId() })}
            />
          ))}
        </div>
        <aside className="editor-preview">
          <p className="eyebrow">ПРЕДПРОСМОТР</p>
          {preview ? (
            <>
              <h2>{preview.title || 'Название критерия'}</h2>
              <p className="definition">{preview.definition || 'Здесь появится правило оценки.'}</p>
              <p className="hint">{preview.response_type === 'flag' ? 'Флаг без баллов' : `Вес: ${preview.weight}`}</p>
              <ScaleTable criterion={preview} selected={undefined} />
              <p className="hint">
                {preview.allow_na ? `N/A: ${preview.na_condition || 'Укажите условие'}` : 'N/A не разрешён'}
              </p>
            </>
          ) : (
            <p>Добавьте первый критерий.</p>
          )}
        </aside>
      </div>
      <FieldError id={`${uid}-crit-e`} error={errors.criteria} />
      <div className="row">
        <button type="button" onClick={() => setDraft((d) => ({ ...d, criteria: [...d.criteria, blankCriterion()] }))}>
          + Критерий
        </button>
      </div>

      {scoringOnly ? (
        <p className="notice" data-testid="scoring-only-note">
          Изменены только веса, доли, секции или порядок: смысловой запрос к оценщику не меняется. При запуске в режиме
          reuse_if_compatible сервер может переиспользовать прежние ответы и пересчитать баллы — источник пересчёта
          будет указан в карточке. Режим fresh всегда вызывает оценщик заново.
        </p>
      ) : null}
      {errorCount ? (
        <p className="field-error" role="alert">
          Исправьте ошибки в отмеченных полях ({errorCount}).
        </p>
      ) : null}
      <div className="row editor-save">
        <button type="submit" className="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Сохранение…' : base ? 'Сохранить как новую версию' : 'Создать чек-лист'}
        </button>
        {checklistId ? (
          <Link to={`/checklists/${encodeURIComponent(checklistId)}`}>Отмена</Link>
        ) : (
          <Link to="/checklists">Отмена</Link>
        )}
      </div>
      {rebasedNote ? (
        <p className="notice" role="status" data-testid="rebased-note">
          {rebasedNote}
        </p>
      ) : null}
      {conflict && checklistId && expectedLatest ? (
        <ConflictResolution
          checklistId={checklistId}
          expectedVersionId={expectedLatest}
          onRebase={(latest) => {
            setExpectedLatest(latest);
            mutation.reset();
            setRebasedNote(
              `Черновик будет сохранён как следующая версия после ${shortId(latest)}. Нажмите «Сохранить» ещё раз.`,
            );
          }}
        />
      ) : mutation.isError ? (
        <ErrorPanel error={mutation.error}>
          <p className="hint">Черновик сохранён в форме; сервер отклонил версию по причине выше.</p>
        </ErrorPanel>
      ) : null}
    </form>
  );
}
