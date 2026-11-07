import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import type { Appeal, Criterion, CriterionProposal, Decision, DecisionRequest, EvaluationView, Message } from '../api/types';
import { approxRu, decimalRu, serverTime, totalRu } from '../lib/format';
import { reasonCodeLabel } from '../lib/labels';
import { answerText } from './CriterionDetail';
import { ErrorPanel } from './States';

function invalidateEvaluation(queryClient: ReturnType<typeof useQueryClient>, evaluationId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['evaluation', evaluationId] }),
    queryClient.invalidateQueries({ queryKey: ['appeals'] }),
  ]);
}

export function AppealForm({ evaluation, criterionId, onDone }: { evaluation: EvaluationView; criterionId: string; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  // Bound to the revision the user is looking at; refreshed only by an explicit reload.
  const [expectedRevision] = useState(evaluation.revision);
  const mutation = useMutation({
    mutationFn: () =>
      api.createAppeal(evaluation.id, {
        schema_version: '1.0',
        criterion_id: criterionId,
        comment,
        expected_revision: expectedRevision,
      }),
    onSuccess: async () => {
      setComment('');
      await invalidateEvaluation(queryClient, evaluation.id);
      onDone?.();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (mutation.isPending) return;
    if (!comment.trim()) {
      setError('Опишите, с чем вы не согласны.');
      return;
    }
    setError(null);
    mutation.mutate();
  }
  return (
    <form onSubmit={submit} className="appeal-form" noValidate>
      <label htmlFor={id}>Комментарий к апелляции</label>
      <textarea
        id={id}
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error ? (
        <p id={`${id}-err`} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Отправка…' : 'Подать апелляцию'}
        </button>
      </div>
      {mutation.isError ? (
        <ErrorPanel error={mutation.error} retryLabel="Отправить ещё раз" onRetry={() => mutation.mutate()}>
          <p className="hint">Комментарий сохранён в форме. Если запрос мог дойти до сервера, проверьте очередь апелляций.</p>
        </ErrorPanel>
      ) : null}
    </form>
  );
}

/** Builds the human replacement proposal for a "changed" decision from the criterion snapshot. */
export function buildReplacement(
  criterion: Criterion,
  choice: string,
  rationale: string,
  range: { start: string; end: string } | null,
): CriterionProposal {
  const na = choice === '__na__';
  return {
    schema_version: '1.0',
    criterion_id: criterion.id,
    applicability: na ? 'not_applicable' : 'applicable',
    answer_choice_id: na ? null : choice,
    rationale,
    reason_codes: ['human_changed'],
    // The reviewer's own basis: a whole-message inclusive range picked from the original.
    evidence: range
      ? [
          {
            schema_version: '1.0',
            kind: 'range',
            start_message_id: range.start,
            end_message_id: range.end,
            relation: 'support',
            explanation: rationale,
          },
        ]
      : [],
    limitations: [],
    review_reasons: [],
    origin: 'human',
  };
}

export function DecisionForm({
  appeal,
  evaluation,
  criterion,
  messages,
  onReload,
  onDecided,
}: {
  appeal: Appeal;
  evaluation: EvaluationView;
  criterion: Criterion;
  messages: Message[];
  onReload: () => Promise<unknown>;
  /** Called after a saved decision; the resolved appeal may leave the list right after. */
  onDecided?: (decision: Decision) => void;
}) {
  const queryClient = useQueryClient();
  const ids = { reason: useId(), choice: useId(), rationale: useId(), start: useId(), end: useId() };
  const [decision, setDecision] = useState<'confirmed' | 'changed'>('confirmed');
  const [reason, setReason] = useState('');
  const [choice, setChoice] = useState('');
  const [rationale, setRationale] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const evidenceRequired = criterion.evidence_policy.require_evidence !== false;
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The revision the reviewer saw. A conflict never silently adopts a newer revision.
  const [expectedRevision, setExpectedRevision] = useState(evaluation.revision);
  const [reloaded, setReloaded] = useState(false);
  const mutation = useMutation({
    mutationFn: (body: DecisionRequest) => api.decideAppeal(appeal.id, body),
    onSuccess: (decision) => {
      onDecided?.(decision);
      return invalidateEvaluation(queryClient, evaluation.id);
    },
  });
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409;

  function validate(): DecisionRequest | null {
    const next: Record<string, string> = {};
    if (!reason.trim()) next.reason = 'Укажите причину решения.';
    if (decision === 'changed') {
      if (!choice) next.choice = 'Выберите новый ответ.';
      if (choice === '__na__' && !rationale.trim()) next.rationale = 'Для N/A укажите причину неприменимости.';
      if (choice && choice !== '__na__' && !rationale.trim()) next.rationale = 'Добавьте обоснование нового ответа.';
      if ((start || end || evidenceRequired) && !(start && end)) next.range = 'Выберите первую и последнюю реплику основания.';
      if (start && end && messages.findIndex((m) => m.id === start) > messages.findIndex((m) => m.id === end))
        next.range = 'Начало диапазона должно быть не позже конца.';
    }
    setErrors(next);
    if (Object.keys(next).length) return null;
    return {
      schema_version: '1.0',
      expected_revision: expectedRevision,
      decision,
      replacement:
        decision === 'changed' ? buildReplacement(criterion, choice, rationale, start && end ? { start, end } : null) : null,
      reason,
    };
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mutation.isPending) return;
    const body = validate();
    if (body) mutation.mutate(body);
  }

  async function reload() {
    await onReload();
    const fresh = queryClient.getQueryData<EvaluationView>(['evaluation', evaluation.id]);
    if (fresh) setExpectedRevision(fresh.revision);
    setReloaded(true);
    mutation.reset();
  }

  if (mutation.isSuccess) {
    return (
      <p className="notice notice-ok">Решение сохранено (revision {mutation.data.revision}).</p>
    );
  }

  return (
    <form onSubmit={submit} className="decision-form" noValidate>
      <fieldset className="segmented">
        <legend>Решение</legend>
        <label>
          <input type="radio" name={`${appeal.id}-d`} checked={decision === 'confirmed'} onChange={() => setDecision('confirmed')} />{' '}
          Подтвердить текущий ответ
        </label>
        <label>
          <input type="radio" name={`${appeal.id}-d`} checked={decision === 'changed'} onChange={() => setDecision('changed')} />{' '}
          Изменить ответ
        </label>
      </fieldset>
      {decision === 'changed' ? (
        <>
          <label htmlFor={ids.choice}>Новый ответ (по снимку критерия этой оценки)</label>
          <select
            id={ids.choice}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            aria-invalid={errors.choice ? true : undefined}
            aria-describedby={errors.choice ? `${ids.choice}-e` : undefined}
          >
            <option value="">— выберите —</option>
            {criterion.choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} — {c.anchor}
                {c.score_fraction !== null ? ` (доля ${decimalRu(c.score_fraction)})` : ''}
              </option>
            ))}
            {criterion.allow_na ? <option value="__na__">N/A — {criterion.na_condition}</option> : null}
          </select>
          {errors.choice ? (
            <p id={`${ids.choice}-e`} className="field-error">
              {errors.choice}
            </p>
          ) : null}
          <label htmlFor={ids.rationale}>{choice === '__na__' ? 'Причина неприменимости' : 'Обоснование нового ответа'}</label>
          <textarea
            id={ids.rationale}
            rows={2}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            aria-invalid={errors.rationale ? true : undefined}
            aria-describedby={errors.rationale ? `${ids.rationale}-e` : undefined}
          />
          {errors.rationale ? (
            <p id={`${ids.rationale}-e`} className="field-error">
              {errors.rationale}
            </p>
          ) : null}
          <fieldset aria-describedby={`${ids.start}-h ${errors.range ? `${ids.start}-e` : ''}`}>
            <legend>Основание в разговоре{evidenceRequired ? ' (обязательно для этого критерия)' : ''}</legend>
            <small id={`${ids.start}-h`} className="hint">
              Диапазон целых реплик, границы включительно.
            </small>
            <div className="grid-2">
              <div>
                <label htmlFor={ids.start}>Первая реплика</label>
                <select id={ids.start} value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={errors.range ? true : undefined}>
                  <option value="">— выберите —</option>
                  {messages.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} · {m.timestamp_original} · {m.text.slice(0, 60)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={ids.end}>Последняя реплика</label>
                <select id={ids.end} value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={errors.range ? true : undefined}>
                  <option value="">— выберите —</option>
                  {messages.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id} · {m.timestamp_original} · {m.text.slice(0, 60)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {errors.range ? (
              <p id={`${ids.start}-e`} className="field-error">
                {errors.range}
              </p>
            ) : null}
          </fieldset>
        </>
      ) : null}
      <label htmlFor={ids.reason}>Причина решения</label>
      <textarea
        id={ids.reason}
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-invalid={errors.reason ? true : undefined}
        aria-describedby={errors.reason ? `${ids.reason}-e` : undefined}
      />
      {errors.reason ? (
        <p id={`${ids.reason}-e`} className="field-error">
          {errors.reason}
        </p>
      ) : null}
      {reloaded ? (
        <p className="notice" role="status">
          Данные обновлены (revision {expectedRevision}). Проверьте актуальное состояние и отправьте решение повторно, если оно
          всё ещё нужно.
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Сохранение…' : 'Сохранить решение'}
        </button>
      </div>
      {conflict ? (
        <div className="state state-error" role="alert" data-testid="decision-conflict">
          <p className="state-title">⚠ Решение не сохранено: данные изменились в другом окне</p>
          <p>
            Другое решение уже принято или карточка обновилась. Ваш ввод сохранён. Обновите данные и решите, нужно ли повторное
            действие.
          </p>
          <button type="button" onClick={reload}>
            Обновить данные
          </button>
          {mutation.error instanceof ApiError && mutation.error.correlationId ? (
            <small className="muted">
              {' '}
              correlation_id: <code>{mutation.error.correlationId}</code>
            </small>
          ) : null}
        </div>
      ) : mutation.isError ? (
        <ErrorPanel error={mutation.error} retryLabel="Отправить ещё раз" onRetry={() => submit({ preventDefault() {} } as FormEvent)}>
          <p className="hint">Ввод сохранён. При сетевой ошибке решение могло быть записано — обновите карточку перед повтором.</p>
        </ErrorPanel>
      ) : null}
    </form>
  );
}

/** Page-level confirmation that survives the resolved appeal leaving the open queue. */
export function DecisionSavedNotice({ decision, onClose }: { decision: Decision | null; onClose: () => void }) {
  if (!decision) return null;
  return (
    <div className="notice notice-ok" role="status" data-testid="decision-saved">
      <p>
        Решение «{decision.decision === 'confirmed' ? 'подтвердить' : 'изменить'}» по критерию <code>{decision.criterion_id}</code>{' '}
        сохранено (revision {decision.revision}). Итог effective получен с сервера заново.
      </p>
      <div className="row">
        <a href={`#/evaluations/${encodeURIComponent(decision.evaluation_id)}?criterion=${encodeURIComponent(decision.criterion_id)}`}>
          Открыть карточку
        </a>
        <button type="button" onClick={onClose}>
          Скрыть
        </button>
      </div>
    </div>
  );
}

/** "AI → решение → итог после пересмотра" for one criterion, built from server data only. */
export function DecisionComparison({
  evaluation,
  criterion,
  decisions,
  appeals,
}: {
  evaluation: EvaluationView;
  criterion: Criterion;
  decisions: Decision[];
  appeals: Appeal[];
}) {
  if (!decisions.length) return null;
  const automatic = evaluation.artifact.automatic_final.find((p) => p.criterion_id === criterion.id);
  const autoC = evaluation.automatic_score.contributions.find((c) => c.criterion_id === criterion.id);
  const effC = evaluation.effective_score.contributions.find((c) => c.criterion_id === criterion.id);
  const effective = evaluation.effective_proposals.find((p) => p.criterion_id === criterion.id);
  const appealById = new Map(appeals.map((a) => [a.id, a]));
  return (
    <section className="comparison" aria-label="Сравнение до и после пересмотра" data-testid="decision-comparison">
      <h4>AI → решение → итог после пересмотра</h4>
      <ol className="timeline">
        <li>
          <strong>Ответ оценщика:</strong> {answerText(criterion, automatic)}
          {autoC && criterion.response_type !== 'flag' ? (
            <span className="muted" title={autoC.normalized_contribution ?? undefined}> · вклад {approxRu(autoC.normalized_contribution)}</span>
          ) : null}
        </li>
        {decisions.map((d) => (
          <li key={d.id} data-testid="decision-entry">
            <strong>{d.decision === 'confirmed' ? 'Подтверждено' : 'Изменено'}</strong>{' '}
            {d.decision === 'changed' && d.replacement ? `на «${answerText(criterion, d.replacement)}»` : ''} ·{' '}
            {serverTime(d.created_at)} · revision {d.revision}
            <div>Причина: {d.reason}</div>
            {appealById.get(d.appeal_id) ? (
              <div className="muted">Комментарий апелляции: {appealById.get(d.appeal_id)!.comment}</div>
            ) : null}
            <div className="codes">
              {d.reason_codes.map((c) => (
                <span key={c} className="code-chip">
                  {reasonCodeLabel[c]}
                </span>
              ))}
            </div>
          </li>
        ))}
        <li>
          <strong>Действующий ответ:</strong> {answerText(criterion, effective)}
          {effC && criterion.response_type !== 'flag' ? (
            <span className="muted" title={effC.normalized_contribution ?? undefined}> · вклад {approxRu(effC.normalized_contribution)}</span>
          ) : null}
          <div>
            Итог: automatic {evaluation.automatic_score.total_score === null ? 'нет итога' : totalRu(evaluation.automatic_score.total_score)} →
            effective {evaluation.effective_score.total_score === null ? 'нет итога' : totalRu(evaluation.effective_score.total_score)}
          </div>
        </li>
      </ol>
    </section>
  );
}
