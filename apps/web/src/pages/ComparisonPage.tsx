import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Criterion, EvaluationView, Message, ScoreSummary } from '../api/types';
import { answerText, rawStepText } from '../components/CriterionDetail';
import { TotalValue } from '../components/ScorePanel';
import { Badge, Empty, ErrorPanel, Loading } from '../components/States';
import { VersionDiff } from '../components/VersionDiff';
import { fieldLabel } from '../lib/checklistDraft';
import {
  ANSWER_KINDS,
  changeKindLabel,
  compareEvaluations,
  decimalDelta,
  RULE_KINDS,
  scoreOf,
  summarize,
  type ChangeKind,
  type ComparisonRow,
  type Scope,
  type SideCell,
} from '../lib/comparison';
import { evidenceMessageIds, evidenceRefText } from '../lib/evidence';
import { approxRu, decimalRu, serverTime, totalRu } from '../lib/format';
import { profileLabel } from '../lib/presentation';
import { ChecklistName, ProfileName } from '../components/DisplayNames';
import { applicabilityLabel, scoreStatusExplanation, speakerLabel } from '../lib/labels';
import { reusedRunCallsText } from '../lib/runSummary';

function kindTone(kind: ChangeKind): string {
  if (RULE_KINDS.includes(kind)) return 'rule';
  if (ANSWER_KINDS.includes(kind)) return 'answer';
  return 'calc';
}

function evaluationHref(view: EvaluationView, cid: string, scope: Scope, evidence?: number): string {
  const q = new URLSearchParams({ criterion: cid, scope });
  if (evidence !== undefined) q.set('evidence', String(evidence));
  return `/evaluations/${encodeURIComponent(view.id)}?${q.toString()}`;
}

function originText(view: EvaluationView): string {
  return view.reuse.reused_from_evaluation_id
    ? `Ответы переиспользованы. ${reusedRunCallsText(view.run)} Баллы пересчитаны по выбранным правилам.`
    : 'Новый вызов оценщика';
}

function flagText(detected: boolean | null | undefined): string {
  return detected === true ? 'обнаружено' : detected === false ? 'не обнаружено' : 'не определено';
}

function SideResult({
  view,
  side,
  scope,
  messages,
  label,
}: {
  view: EvaluationView;
  side: SideCell;
  scope: Scope;
  messages: Message[];
  label: string;
}) {
  const c = side.criterion;
  if (!c) {
    return (
      <td data-side={label}>
        <span className="muted">Нет в этой версии чек-листа</span>
      </td>
    );
  }
  const p = side.proposal;
  const contribution = side.contribution;
  const step = p?.applicability === 'applicable' ? rawStepText(c, p.answer_choice_id) : null;
  const byId = new Map(messages.map((m) => [m.id, m]));
  return (
    <td data-side={label}>
      <div className="cmp-answer">
        <strong data-testid="cmp-answer">{answerText(c, p)}</strong>
        {step ? <span className="muted"> · ступень {step}</span> : null}
        {p ? (
          <Badge status={p.applicability === 'undetermined' ? 'undetermined' : p.applicability === 'applicable' ? 'complete' : 'unevaluated'}>
            {applicabilityLabel[p.applicability]}
          </Badge>
        ) : null}
        {p?.origin === 'human' ? <span className="cmp-human">решение проверяющего</span> : null}
      </div>
      <dl className="cmp-numbers">
        {c.response_type === 'flag' ? (
          <>
            <dt>Флаг</dt>
            <dd>{flagText(side.flag?.detected)} · без баллов</dd>
          </>
        ) : (
          <>
            <dt>Вес</dt>
            <dd>{decimalRu(c.weight)}</dd>
            <dt>Получено / применимо</dt>
            <dd>
              {contribution
                ? contribution.applicability === 'applicable'
                  ? `${approxRu(contribution.earned_weight)} / ${approxRu(contribution.applicable_weight)}`
                  : `— (${applicabilityLabel[contribution.applicability]}, вне расчёта)`
                : '—'}
            </dd>
            <dt>Вклад в итог</dt>
            <dd data-testid="cmp-contribution" title={contribution?.normalized_contribution ?? undefined}>
              {contribution?.normalized_contribution != null
                ? `${approxRu(contribution.normalized_contribution)} п. из 100`
                : 'нет — итог не рассчитан или критерий вне расчёта'}
            </dd>
          </>
        )}
      </dl>
      {p ? <p className="cmp-rationale">{p.rationale}</p> : <p className="muted">Ответа по критерию нет.</p>}
      {p?.evidence.length ? (
        <ul className="cmp-evidence" aria-label={`Доказательства: ${label}`}>
          {p.evidence.map((ev, i) => {
            const quoted = evidenceMessageIds(ev, messages)
              .map((id) => byId.get(id))
              .filter((m): m is Message => Boolean(m));
            return (
              <li key={i}>
                <Link to={evaluationHref(view, c.id, scope, i)} data-testid="cmp-evidence-link">
                  {ev.kind === 'source' ? 'Открыть источник' : `Реплики ${evidenceRefText(ev, messages)}`}
                </Link>
                {quoted[0] ? (
                  <span className="muted cmp-quote">
                    {' '}
                    {speakerLabel[quoted[0].speaker]}: «{quoted[0].text}»
                    {quoted.length > 1 ? ` и ещё ${quoted.length - 1}` : ''}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {p ? <Link to={evaluationHref(view, c.id, scope)}>Открыть доказательства</Link> : null}
    </td>
  );
}

/** Before → after of the rule itself, so a new meaning under an old ID is visible. */
function RuleChange({ row }: { row: ComparisonRow }) {
  const a = row.left.criterion;
  const b = row.right.criterion;
  if (!a || !b) return null;
  const text = (label: string, x: string | null | undefined, y: string | null | undefined) =>
    (x ?? '') !== (y ?? '') ? (
      <div className="rule-change">
        <span className="rule-change-label">{label}</span>
        <del>{x || '—'}</del>
        <ins>{y || '—'}</ins>
      </div>
    ) : null;
  const choiceIds = [...new Set([...a.choices.map((c) => c.id), ...b.choices.map((c) => c.id)])];
  const changedChoices = choiceIds.filter((id) => {
    const x = a.choices.find((c) => c.id === id);
    const y = b.choices.find((c) => c.id === id);
    return JSON.stringify([x?.label, x?.raw_value, x?.anchor, x?.score_fraction]) !==
      JSON.stringify([y?.label, y?.raw_value, y?.anchor, y?.score_fraction]);
  });
  const choiceText = (c: Criterion['choices'][number] | undefined) =>
    c ? `${c.label} · значение ${String(c.raw_value)} · доля ${c.score_fraction ?? '—'}${c.anchor ? ` · ${c.anchor}` : ''}` : 'нет';
  return (
    <div className="rule-changes" data-testid="rule-change">
      <p className="muted">Изменено в правиле: {row.fields.map(fieldLabel).join(', ')}.</p>
      {text('Название', a.title, b.title)}
      {text('Определение', a.definition, b.definition)}
      {a.allow_na !== b.allow_na ? (
        <div className="rule-change">
          <span className="rule-change-label">N/A</span>
          <del>{a.allow_na ? 'разрешён' : 'запрещён'}</del>
          <ins>{b.allow_na ? 'разрешён' : 'запрещён'}</ins>
        </div>
      ) : null}
      {text('Условие N/A', a.na_condition, b.na_condition)}
      {changedChoices.map((id) => (
        <div className="rule-change" key={id}>
          <span className="rule-change-label">
            Вариант «{b.choices.find((c) => c.id === id)?.label ?? a.choices.find((c) => c.id === id)?.label ?? 'Без названия'}»
          </span>
          <del>{choiceText(a.choices.find((c) => c.id === id))}</del>
          <ins>{choiceText(b.choices.find((c) => c.id === id))}</ins>
        </div>
      ))}
      {a.weight !== b.weight ? (
        <div className="rule-change">
          <span className="rule-change-label">Вес</span>
          <del>{decimalRu(a.weight)}</del>
          <ins>{decimalRu(b.weight)}</ins>
        </div>
      ) : null}
    </div>
  );
}

function TotalDelta({ left, right }: { left: ScoreSummary; right: ScoreSummary }) {
  if (left.status === 'complete' && right.status === 'complete' && left.total_score && right.total_score) {
    return (
      <p className="cmp-delta" data-testid="total-delta">
        Разница итогов: <strong>{totalRu(decimalDelta(left.total_score, right.total_score))}</strong> п.
      </p>
    );
  }
  return (
    <p className="cmp-delta muted" data-testid="total-delta">
      Числовая разница не показывается: итог есть не у обеих оценок. Отсутствующий итог — не 0.
    </p>
  );
}

export function ComparisonPage() {
  const { id = '' } = useParams();
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: ({ signal }) => api.listProfiles(signal), staleTime: 60_000 });
  const [params, setParams] = useSearchParams();
  const scope: Scope = params.get('scope') === 'effective' ? 'effective' : 'automatic';
  const onlyChanges = params.get('changes') === '1';
  const list = useQuery({
    queryKey: ['evaluations', { conversation_id: id }],
    queryFn: ({ signal }) => api.listEvaluations({ conversation_id: id, limit: 200 }, signal),
  });
  const items = list.data?.items ?? [];
  // A requested evaluation may be newer than the cached list (e.g. a run just finished):
  // read the list again once instead of silently comparing a different evaluation.
  const wanted = [params.get('left'), params.get('right')].filter((v): v is string => Boolean(v));
  const missing = wanted.filter((w) => !items.some((e) => e.id === w));
  const refetchedFor = useRef<string | null>(null);
  const missingKey = missing.join('|');
  useEffect(() => {
    if (!missingKey || !list.data || list.isFetching || refetchedFor.current === missingKey) return;
    refetchedFor.current = missingKey;
    void list.refetch();
  }, [missingKey, list]);
  const unresolved = missing.length > 0 && (refetchedFor.current !== missingKey || list.isFetching);
  const right = params.get('right') ? items.find((e) => e.id === params.get('right')) : items[0];
  const left = params.get('left')
    ? items.find((e) => e.id === params.get('left'))
    : items.find((e) => e.id !== right?.id && e.conversation_revision === right?.conversation_revision);
  const leftVersion = useQuery({
    queryKey: ['checklist-version', left?.checklist_version_id],
    queryFn: ({ signal }) => api.getChecklistVersion(left!.checklist_version_id, signal),
    enabled: Boolean(left),
    staleTime: Infinity,
  });
  const rightVersion = useQuery({
    queryKey: ['checklist-version', right?.checklist_version_id],
    queryFn: ({ signal }) => api.getChecklistVersion(right!.checklist_version_id, signal),
    enabled: Boolean(right),
    staleTime: Infinity,
  });
  const conversation = useQuery({
    queryKey: ['conversation', right?.conversation_id, right?.conversation_revision],
    queryFn: ({ signal }) => api.getConversation(right!.conversation_id, right!.conversation_revision, signal),
    enabled: Boolean(right),
  });
  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    if (left) next.set('left', left.id);
    if (right) next.set('right', right.id);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next);
  }
  if (list.isPending || unresolved) return <Loading label="Загрузка оценок…" />;
  if (list.isError) return <ErrorPanel error={list.error} onRetry={() => list.refetch()} />;
  if (missing.length)
    return (
      <Empty title="Выбранная оценка не найдена у этого разговора">
        <p>
          Одна из выбранных оценок недоступна. Выберите сохранённые оценки из истории разговора.
        </p>
        <Link to={`/conversations/${encodeURIComponent(id)}/compare`}>Открыть сравнение без выбора</Link>
      </Empty>
    );
  if (!left || !right)
    return (
      <Empty title="Для сравнения нужны две оценки одной версии разговора">
        <Link to={`/conversations/${encodeURIComponent(id)}`}>Вернуться к разговору и запустить оценку</Link>
      </Empty>
    );
  const compatible =
    left.id !== right.id &&
    left.conversation_revision === right.conversation_revision &&
    left.artifact.identity.conversation_content_hash === right.artifact.identity.conversation_content_hash;
  const leftScore = scoreOf(left, scope);
  const rightScore = scoreOf(right, scope);
  const profileChanged = left.profile_id !== right.profile_id || left.profile_version !== right.profile_version;
  const testMode = left.artifact.evaluator_mode === 'test' || right.artifact.evaluator_mode === 'test';
  const rows =
    leftVersion.data && rightVersion.data
      ? compareEvaluations(
          { view: left, version: leftVersion.data, scope },
          { view: right, version: rightVersion.data, scope },
        )
      : [];
  const summary = summarize(rows);
  const shown = onlyChanges ? rows.filter((r) => r.kinds.length) : rows;
  const flagChanges = rows.filter((r) => r.kinds.includes('flag'));
  const messages = conversation.data?.messages ?? [];

  return (
    <div className="page comparison-page">
      <p className="crumbs">
        <Link to={`/conversations/${encodeURIComponent(id)}`}>Разговор</Link> / Сравнение
      </p>
      <header className="page-heading">
        <div>
          <h1>Сравнение оценок</h1>
          <p className="page-intro">Что изменилось в правилах, ответах и расчёте — и почему изменился итог.</p>
        </div>
      </header>
      <div className="panel comparison-controls">
        {(['left', 'right'] as const).map((side) => (
          <label key={side}>
            {side === 'left' ? 'Было (левая сторона)' : 'Стало (правая сторона)'}
            <select value={(side === 'left' ? left : right).id} onChange={(e) => update({ [side]: e.target.value })}>
              {items.map((e, index) => (
                <option key={e.id} value={e.id}>
                  Запуск {items.length - index} · {serverTime(e.created_at)} · {(() => { const p = profiles.data?.items.find((p) => p.profile.id === e.profile_id && p.profile.version === e.profile_version); return p ? profileLabel(p.profile) : 'Сохранённая оценка'; })()} · текст v{e.conversation_revision}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="comparison-actions">
          <button type="button" onClick={() => update({ left: right.id, right: left.id })} data-testid="swap-sides">
            ⇄ Поменять стороны
          </button>
          <label>
            Источник результата
            <select value={scope} onChange={(e) => update({ scope: e.target.value })}>
              <option value="automatic">Оценка AI</option>
              <option value="effective">После пересмотра</option>
            </select>
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={onlyChanges}
              onChange={(e) => update({ changes: e.target.checked ? '1' : null })}
            />{' '}
            Только изменения
          </label>
        </div>
      </div>
      {testMode ? (
        <p className="notice notice-warn" data-testid="test-banner">
          Тестовый оценщик: синтетические ответы без семантической оценки. Это не результат настоящего AI.
        </p>
      ) : null}
      {!compatible ? (
        <p className="notice notice-warn">
          Выберите разные оценки одного и того же текста. Изменённый разговор нельзя сравнивать как изменение
          оценки прежнего текста.
        </p>
      ) : (
        <>
          {profileChanged ? (
            <p className="notice notice-warn" data-testid="profile-changed">
              Профили оценщика отличаются. Разница может быть вызвана моделью, инструкциями и настройками, а не только
              чек-листом.
            </p>
          ) : null}
          <div className="comparison-totals">
            {[
              { view: left, score: leftScore, label: 'Было' },
              { view: right, score: rightScore, label: 'Стало' },
            ].map(({ view, score, label }) => (
              <section className="panel" key={label} data-testid={`cmp-side-${label === 'Было' ? 'left' : 'right'}`}>
                <p className="eyebrow">
                  {label} · {scope === 'automatic' ? 'исходный AI' : 'с учётом пересмотра'}
                </p>
                <div className="comparison-score">
                  <TotalValue score={score} />
                </div>
                {score.flags.length ? <Badge status={score.flags.some((f) => f.detected) ? 'failed' : score.flags.some((f) => f.detected === null) ? 'partial' : 'complete'}>{score.flags.some((f) => f.detected) ? 'Обнаружено нарушение' : score.flags.some((f) => f.detected === null) ? 'Нарушения: не определено' : 'Нарушений не обнаружено'}</Badge> : null}
                {score.status !== 'complete' ? (
                  <p className="hint">{scoreStatusExplanation[score.status]}</p>
                ) : null}
                <dl className="cmp-side-meta">
                  <dt>Чек-лист</dt>
                  <dd>
                    <Link to={`/checklists/version/${encodeURIComponent(view.checklist_version_id)}`}>
                      <ChecklistName id={view.checklist_version_id} />
                    </Link>
                  </dd>
                  <dt>Профиль</dt>
                  <dd>
                    <ProfileName id={view.profile_id} version={view.profile_version} />
                  </dd>
                  <dt>Происхождение</dt>
                  <dd data-testid="cmp-origin">{originText(view)}</dd>
                  <dt>Получена</dt>
                  <dd>{serverTime(view.created_at)}</dd>
                  <dt>Флаги</dt>
                  <dd>
                    обнаружено: {score.flags.filter((f) => f.detected === true).length}
                    {score.flags.some((f) => f.detected === null) ? ', есть неопределённые' : ''}
                  </dd>
                  {view.human_decisions.length ? (
                    <>
                      <dt>Решения человека</dt>
                      <dd>{view.human_decisions.length}</dd>
                    </>
                  ) : null}
                </dl>
                <Link to={`/evaluations/${encodeURIComponent(view.id)}?scope=${scope}`}>Карточка оценки</Link>
              </section>
            ))}
          </div>
          <TotalDelta left={leftScore} right={rightScore} />
          {flagChanges.length ? (
            <div className="notice notice-bad" role="status" data-testid="flag-changes">
              <strong>Изменился флаг нарушения</strong> — флаг не меняет общий балл, поэтому смотрите его отдельно:
              <ul>
                {flagChanges.map((r) => (
                  <li key={r.id}>
                    {r.title}: {flagText(r.left.flag?.detected)} → {flagText(r.right.flag?.detected)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {leftVersion.isError ? <ErrorPanel error={leftVersion.error} onRetry={() => leftVersion.refetch()} /> : null}
          {rightVersion.isError ? (
            <ErrorPanel error={rightVersion.error} onRetry={() => rightVersion.refetch()} />
          ) : null}
          {leftVersion.isPending || rightVersion.isPending ? <Loading label="Загрузка версий чек-листа…" /> : null}
          {leftVersion.data && rightVersion.data ? (
            <>
              <section className="panel cmp-summary" aria-label="Сводка изменений" data-testid="cmp-summary">
                <p role="status">
                  Изменения есть у <strong>{summary.changed}</strong> из {summary.total} критериев.
                </p>
                <ul>
                  <li data-testid="cmp-count-rules">
                    Правила и веса: <strong>{summary.rules}</strong>
                  </li>
                  <li data-testid="cmp-count-answers">
                    Ответы, применимость и флаги: <strong>{summary.answers}</strong>
                  </li>
                  <li data-testid="cmp-count-contributions">
                    Вклад в итог: <strong>{summary.contributions}</strong>
                  </li>
                </ul>
                <p className="hint">
                  Группы пересекаются: один критерий может одновременно получить новый вес и новый вклад. Вклад
                  меняется и тогда, когда изменились другие критерии — у итога общий знаменатель. Все баллы и вклады
                  рассчитаны сервером для закреплённой версии каждой стороны; одинаковый ID варианта при изменённой
                  шкале не считается тем же ответом.
                </p>
              </section>
              {shown.length === 0 ? (
                <Empty title="Различий по критериям нет">
                  Ответы, правила и вклады совпадают. Снимите «Только изменения», чтобы увидеть все критерии.
                </Empty>
              ) : (
                <div className="table-wrap" tabIndex={0} aria-label="Сравнение критериев">
                  <table className="table comparison-table">
                    <thead>
                      <tr>
                        <th scope="col">Критерий и изменения</th>
                        <th scope="col">Было</th>
                        <th scope="col">Стало</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.flatMap((row) => {
                        const ruleChanged = row.kinds.some((k) => ['rule', 'na_rule', 'scale', 'weight'].includes(k));
                        const out = [
                          <tr
                            key={row.id}
                            data-testid="comparison-row"
                            data-criterion-id={row.id}
                            data-kinds={row.kinds.join(' ')}
                            className={row.kinds.length ? 'comparison-changed' : ''}
                          >
                            <th scope="row">
                              {row.title}
                              <span className="cmp-kinds">
                                {row.kinds.length ? (
                                  row.kinds.map((k) => (
                                    <small key={k} className={`cmp-kind cmp-kind-${kindTone(k)}`} data-kind={k}>
                                      {changeKindLabel[k]}
                                    </small>
                                  ))
                                ) : (
                                  <small className="cmp-kind cmp-kind-none">Без изменений</small>
                                )}
                              </span>
                            </th>
                            <SideResult view={left} side={row.left} scope={scope} messages={messages} label="Было" />
                            <SideResult view={right} side={row.right} scope={scope} messages={messages} label="Стало" />
                          </tr>,
                        ];
                        if (ruleChanged)
                          out.push(
                            <tr key={`${row.id}-rule`} className="comparison-detail">
                              <td colSpan={3}>
                                <RuleChange row={row} />
                              </td>
                            </tr>,
                          );
                        return out;
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <VersionDiff from={leftVersion.data} to={rightVersion.data} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

