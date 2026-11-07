import { useId, useState, type ReactNode } from 'react';
import type { Evidence, Message } from '../api/types';
import { evidenceRefText } from '../lib/evidence';
import { approxRu, totalRu } from '../lib/format';
import type { ExplainedFlag, ExplainedItem, ScoreExplanationModel } from '../lib/scoreExplanation';
import { answerText, rawStepText } from './CriterionDetail';
import { ErrorPanel, Loading } from './States';

export interface ExplanationActions {
  messages?: Message[];
  onShowEvidence: (criterionId: string, evidenceIndex: number) => void;
  onOpenCriterion: (criterionId: string) => void;
  /** Existing appeals open the same review queue as the criterion card. */
  appealState?: (criterionId: string) => 'available' | 'open' | null;
  appealHref?: (criterionId: string) => string | undefined;
  onAppeal?: (criterionId: string) => void;
}

const VISIBLE = 3;
const LONG_TEXT = 180;

function Rationale({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = text.length > LONG_TEXT || text.includes('\n');
  return (
    <div className="why-rationale-wrap">
      <p id={id} className={`why-rationale${long && !open ? ' why-clamped' : ''}`}>
        {text}
      </p>
      {long ? (
        <button
          type="button"
          className="link"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Свернуть обоснование' : 'Показать обоснование полностью'}
        </button>
      ) : null}
    </div>
  );
}

function evidenceLabel(e: Evidence, messages?: Message[]): string {
  return e.kind === 'source'
    ? 'сохранённый источник'
    : messages
      ? `реплики ${evidenceRefText(e, messages)}`
      : 'реплики диалога';
}

function ItemActions({ item, actions }: { item: ExplainedItem; actions: ExplanationActions }) {
  const evidence = item.proposal?.evidence ?? [];
  const appeal = actions.appealState?.(item.criterion.id) ?? null;
  return (
    <div className="why-actions">
      {evidence.length ? (
        <button
          type="button"
          className="why-primary"
          onClick={() => actions.onShowEvidence(item.criterion.id, 0)}
          data-testid="why-evidence"
          aria-label={`Показать доказательство: ${item.criterion.title}, ${evidenceLabel(evidence[0], actions.messages)}`}
        >
          Показать доказательство
          <small>{evidenceLabel(evidence[0], actions.messages)}</small>
        </button>
      ) : (
        <span className="muted">Доказательство не указано</span>
      )}
      {evidence.length > 1 ? (
        <span className="why-more-evidence" role="group" aria-label={`Другие доказательства: ${item.criterion.title}`}>
          ещё:{' '}
          {evidence.slice(1).map((e, i) => (
            <button
              key={i}
              type="button"
              className="link"
              onClick={() => actions.onShowEvidence(item.criterion.id, i + 1)}
            >
              {evidenceLabel(e, actions.messages)}
            </button>
          ))}
        </span>
      ) : null}
      <button
        type="button"
        className="link"
        onClick={() => actions.onOpenCriterion(item.criterion.id)}
        aria-label={`Полный разбор критерия «${item.criterion.title}»`}
      >
        Полный разбор
      </button>
      {appeal === 'available' && actions.onAppeal ? (
        <button
          type="button"
          className="link"
          onClick={() => actions.onAppeal!(item.criterion.id)}
          aria-label={`Оспорить критерий «${item.criterion.title}»`}
        >
          Оспорить
        </button>
      ) : appeal === 'open' ? (
        actions.appealHref?.(item.criterion.id) ? (
          <a href={actions.appealHref(item.criterion.id)} data-testid="why-open-appeal">
            Открыть апелляцию
          </a>
        ) : (
          <span className="muted">Апелляция уже открыта</span>
        )
      ) : null}
    </div>
  );
}

function answerOf(item: ExplainedItem): string {
  const p = item.proposal;
  if (p?.applicability === 'applicable')
    return rawStepText(item.criterion, p.answer_choice_id) ?? answerText(item.criterion, p);
  return answerText(item.criterion, p);
}

function Origin({ item }: { item: ExplainedItem }) {
  return item.proposal?.origin === 'human' ? (
    <span className="why-origin" data-testid="why-human">
      решение проверяющего
    </span>
  ) : null;
}

function ReductionItem({
  item,
  actions,
  highlighted,
}: {
  item: ExplainedItem;
  actions: ExplanationActions;
  highlighted: boolean;
}) {
  const c = item.contribution;
  return (
    <li
      className={`why-item${highlighted ? ' why-highlighted' : ''}`}
      data-testid="why-reduction"
      data-criterion-id={item.criterion.id}
    >
      <div className="why-head">
        <span className="why-number" aria-hidden="true">
          {item.number}
        </span>
        <strong className="why-title">{item.criterion.title}</strong>
        <span className="why-answer">
          Ответ: <strong data-testid="why-answer">{answerOf(item)}</strong>
        </span>
        <Origin item={item} />
      </div>
      {item.proposal ? <Rationale text={item.proposal.rationale} /> : null}
      <dl className="why-numbers">
        <div>
          <dt>Получено веса</dt>
          <dd data-testid="why-weight" title={c ? `${c.earned_weight ?? '—'} из ${c.original_weight}` : undefined}>
            {c ? `${approxRu(c.earned_weight)} из ${approxRu(c.original_weight)}` : '—'}
          </dd>
        </div>
        <div>
          <dt>Вклад в итог</dt>
          <dd title={c?.normalized_contribution ?? undefined}>
            {c?.normalized_contribution != null
              ? `${approxRu(c.normalized_contribution)} п. из 100`
              : 'не рассчитан: общего итога нет'}
          </dd>
        </div>
      </dl>
      <ItemActions item={item} actions={actions} />
    </li>
  );
}

function CompactItem({ item, actions, note }: { item: ExplainedItem; actions: ExplanationActions; note?: ReactNode }) {
  return (
    <li className="why-compact" data-criterion-id={item.criterion.id}>
      <div className="why-head">
        <strong className="why-title">{item.criterion.title}</strong>
        <span className="why-answer">{note ?? answerOf(item)}</span>
        <Origin item={item} />
      </div>
      {item.proposal ? <Rationale text={item.proposal.rationale} /> : null}
      <ItemActions item={item} actions={actions} />
    </li>
  );
}

function CriticalItem({ item, actions }: { item: ExplainedFlag; actions: ExplanationActions }) {
  return (
    <li className="why-critical-item" data-testid="why-critical" data-criterion-id={item.criterion.id}>
      <div className="why-head">
        <span aria-hidden="true">⚑</span>
        <strong className="why-title">{item.criterion.title}: нарушение обнаружено</strong>
        <Origin item={item} />
      </div>
      {item.proposal ? <Rationale text={item.proposal.rationale} /> : null}
      <ItemActions item={item} actions={actions} />
    </li>
  );
}

export function ScoreExplanation({
  model,
  checklistState,
  checklistError,
  onRetryChecklist,
  sourceLabel,
  actions,
  highlightCriterion,
}: {
  model: ScoreExplanationModel | null;
  checklistState: 'loading' | 'error' | 'ready';
  checklistError?: unknown;
  onRetryChecklist?: () => void;
  /** E.g. «оценка AI (automatic)», «после пересмотра (effective)», «учебная разметка». */
  sourceLabel: string;
  actions: ExplanationActions;
  highlightCriterion?: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const titleId = useId();
  if (checklistState === 'loading' || !model) {
    return (
      <section className="panel why" aria-labelledby={titleId} data-testid="score-explanation">
        <h2 id={titleId}>Почему такая оценка</h2>
        {checklistState === 'error' ? (
          <ErrorPanel error={checklistError} onRetry={onRetryChecklist}>
            <p>
              Не удалось загрузить версию чек-листа этой оценки. Без неё названия и правила критериев не показываются.
            </p>
          </ErrorPanel>
        ) : (
          <Loading label="Загрузка правил чек-листа…" />
        )}
      </section>
    );
  }
  const { status, reductions, notApplicable, needsReview, critical, flagsUnknown, flagsClear } = model;
  const title =
    status === 'incomplete_evaluation'
      ? 'Что известно об оценке'
      : status === 'no_applicable_weight'
        ? 'Почему итог не рассчитан'
        : reductions.length
          ? 'Почему снижена оценка'
          : 'Основания итога';
  const visible = showAll ? reductions : reductions.slice(0, VISIBLE);
  return (
    <section className="panel why" aria-labelledby={titleId} data-testid="score-explanation" data-status={status}>
      <div className="why-heading">
        <h2 id={titleId}>{title}</h2>
        <span className="hint" data-testid="why-source">
          {sourceLabel}
        </span>
      </div>

      {status === 'complete' && model.total !== null ? (
        <p className="why-lead">
          Итог {totalRu(model.total)} из 100.{' '}
          {reductions.length ? `Полный балл не получили критерии: ${reductions.length}.` : null}
        </p>
      ) : status === 'incomplete_evaluation' ? (
        <p className="why-lead why-lead-warn" data-testid="why-incomplete">
          Общий итог ещё не рассчитан: по части критериев нет определённого ответа. Ниже — подтверждённые снижения по
          известным ответам; это не окончательный итог.
        </p>
      ) : status === 'no_applicable_weight' ? (
        <p className="why-lead why-lead-warn" data-testid="why-no-weight">
          Ни один взвешенный критерий не применим (все N/A или вес 0), поэтому итога нет. Это не 0 и не 100 баллов.
        </p>
      ) : null}

      {critical.length ? (
        <div className="why-critical" data-testid="why-critical-block">
          <p className="why-critical-lead">
            <strong>Грубое нарушение обнаружено.</strong> Это отдельный сигнал: флаг не меняет и не обнуляет итог.
          </p>
          <ul>
            {critical.map((item) => (
              <CriticalItem key={item.criterion.id} item={item} actions={actions} />
            ))}
          </ul>
        </div>
      ) : null}

      {reductions.length ? (
        <>
          <ol className="why-list" aria-label="Критерии без полного балла">
            {visible.map((item) => (
              <ReductionItem
                key={item.criterion.id}
                item={item}
                actions={actions}
                highlighted={highlightCriterion === item.criterion.id}
              />
            ))}
          </ol>
          {reductions.length > VISIBLE ? (
            <button type="button" className="link" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Показать первые три' : `Показать все причины (${reductions.length})`}
            </button>
          ) : null}
        </>
      ) : status === 'complete' ? (
        <p className="why-ok" data-testid="why-none">
          <span aria-hidden="true">✓ </span>По применимым критериям баллы не снижены.
          {critical.length ? null : ' Грубые нарушения проверяются отдельным флагом — см. ниже.'}
        </p>
      ) : null}

      {needsReview.length || flagsUnknown.length ? (
        <div className="why-group why-review" data-testid="why-review">
          <h3>Требуется проверка</h3>
          <p className="hint">Ответ не определён или отсутствует. Это не штраф и не N/A — нужен ответ проверяющего.</p>
          <ul>
            {[...needsReview, ...flagsUnknown].map((item) => (
              <CompactItem
                key={item.criterion.id}
                item={item}
                actions={actions}
                note={item.proposal ? 'не определено' : 'ответа нет'}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {notApplicable.length ? (
        <div className="why-group why-na" data-testid="why-na">
          <h3>Не применялось (N/A)</h3>
          <p className="hint">Эти критерии исключены из применимого веса — это не штраф.</p>
          <ul>
            {notApplicable.map((item) => (
              <CompactItem key={item.criterion.id} item={item} actions={actions} note="N/A" />
            ))}
          </ul>
        </div>
      ) : null}

      {flagsClear.length ? (
        <p className="why-flags-clear hint" data-testid="why-flags-clear">
          {flagsClear.map((f) => `«${f.criterion.title}»`).join(', ')}: нарушение не обнаружено.
          {flagsUnknown.length ? ' По остальным флагам результат не определён.' : ''}
        </p>
      ) : null}
    </section>
  );
}
