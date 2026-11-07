import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Appeal, Decision } from '../api/types';
import { DecisionComparison, DecisionForm, DecisionSavedNotice } from '../components/Appeals';
import { answerText, EvidenceList, ScaleTable } from '../components/CriterionDetail';
import { Badge, Empty, ErrorPanel, Loading } from '../components/States';
import { Transcript } from '../components/Transcript';
import { serverTime, shortId } from '../lib/format';
import { evidenceMessageIds } from '../lib/evidence';
import { useState } from 'react';

const PAGE_SIZE = 25;

function AppealReview({ appeal, onDecided }: { appeal: Appeal; onDecided: (d: Decision) => void }) {
  const evaluation = useQuery({
    queryKey: ['evaluation', appeal.evaluation_id],
    queryFn: ({ signal }) => api.getEvaluation(appeal.evaluation_id, signal),
  });
  const ev = evaluation.data;
  const conversation = useQuery({
    queryKey: ['conversation', ev?.conversation_id, ev?.conversation_revision],
    queryFn: ({ signal }) => api.getConversation(ev!.conversation_id, ev!.conversation_revision, signal),
    enabled: Boolean(ev),
  });
  const checklist = useQuery({
    queryKey: ['checklist-version', ev?.checklist_version_id],
    queryFn: ({ signal }) => api.getChecklistVersion(ev!.checklist_version_id, signal),
    enabled: Boolean(ev),
    staleTime: Infinity,
  });
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [token, setToken] = useState(0);
  const [openSource, setOpenSource] = useState<string | null>(null);

  if (evaluation.isPending) return <Loading />;
  if (evaluation.isError) return <ErrorPanel error={evaluation.error} onRetry={() => evaluation.refetch()} />;
  const e = evaluation.data;
  const criterion = checklist.data?.criteria.find((c) => c.id === appeal.criterion_id);
  const ai = e.artifact.automatic_final.find((p) => p.criterion_id === appeal.criterion_id);
  const current = e.effective_proposals.find((p) => p.criterion_id === appeal.criterion_id);
  const decisions = e.human_decisions.filter((d) => d.criterion_id === appeal.criterion_id);
  const messages = conversation.data?.messages ?? [];
  const fragments = e.source_fragments.length ? e.source_fragments : (e.artifact.source_fragments ?? []);
  // Show the disputed fragment by default: every message referenced by the current evidence.
  const defaultIds = (current?.evidence ?? []).flatMap((ev) => evidenceMessageIds(ev, messages));

  return (
    <div className="appeal-review">
      {checklist.isError ? <ErrorPanel error={checklist.error} onRetry={() => checklist.refetch()} /> : null}
      {criterion ? (
        <>
          <h3>{criterion.title}</h3>
          <p className="definition">{criterion.definition}</p>
          <ScaleTable criterion={criterion} selected={current?.answer_choice_id} />
          <dl className="meta">
            <dt>Исходный ответ оценщика</dt>
            <dd data-testid="appeal-ai-answer">{answerText(criterion, ai)}</dd>
            <dt>Действующий ответ</dt>
            <dd>{answerText(criterion, current)}</dd>
            <dt>Комментарий апелляции</dt>
            <dd className="rationale">{appeal.comment}</dd>
          </dl>
          {current ? (
            <>
              <h4>Обоснование</h4>
              <p className="rationale">{current.rationale}</p>
              <h4>Текущие доказательства</h4>
              <EvidenceList
                evidence={current.evidence}
                messages={messages}
                fragments={fragments}
                onShow={(ids) => {
                  setHighlighted(ids);
                  setToken((t) => t + 1);
                }}
                openSource={openSource}
                onToggleSource={(c) => setOpenSource((s) => (s === c ? null : c))}
              />
            </>
          ) : null}
          <DecisionComparison evaluation={e} criterion={criterion} decisions={decisions} appeals={[appeal]} />
          {appeal.state === 'open' ? (
            <DecisionForm
              appeal={appeal}
              evaluation={e}
              criterion={criterion}
              messages={messages}
              onReload={() => evaluation.refetch()}
              onDecided={onDecided}
            />
          ) : null}
        </>
      ) : checklist.isPending ? (
        <Loading />
      ) : null}
      {conversation.data ? (
        <details open className="appeal-transcript">
          <summary>Исходный фрагмент разговора</summary>
          <Transcript
            conversation={conversation.data}
            highlighted={highlighted.length ? highlighted : defaultIds}
            focusToken={token}
            canSeek={false}
          />
        </details>
      ) : null}
      <p>
        <Link to={`/evaluations/${encodeURIComponent(e.id)}?criterion=${encodeURIComponent(appeal.criterion_id)}`}>
          Открыть карточку оценки
        </Link>
      </p>
    </div>
  );
}

export function AppealsPage() {
  const [params, setParams] = useSearchParams();
  const state = params.get('state') ?? 'open';
  const openId = params.get('appeal');
  const evaluationId = params.get('evaluation_id');
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const filterId = useId();
  const [lastDecision, setLastDecision] = useState<Decision | null>(null);
  const list = useQuery({
    queryKey: ['appeals', { state, offset, evaluationId }],
    queryFn: ({ signal }) =>
      api.listAppeals(
        { state: state === 'all' ? null : state, evaluation_id: evaluationId, offset, limit: PAGE_SIZE },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  }
  // Only a filter change returns to the first page; paging and opening an appeal keep the offset.
  const setFilter = (value: string) => update({ state: value, offset: null, appeal: null });
  const setOffset = (value: number) => update({ offset: value > 0 ? String(value) : null, appeal: null });
  const toggleAppeal = (id: string | null) => update({ appeal: id });
  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ПЕРЕСМОТР РЕШЕНИЙ</p>
          <h1>Апелляции</h1>
          <p className="page-intro">Проверьте основания, примите решение и сохраните историю.</p>
        </div>
      </header>
      <DecisionSavedNotice decision={lastDecision} onClose={() => setLastDecision(null)} />
      {evaluationId ? (
        <p className="notice">
          Апелляции оценки {shortId(evaluationId)}.{' '}
          <button
            type="button"
            className="link"
            onClick={() => update({ evaluation_id: null, offset: null, appeal: null })}
          >
            Показать все
          </button>
        </p>
      ) : null}
      <div className="filters">
        <div>
          <label htmlFor={filterId}>Состояние</label>
          <select id={filterId} value={state} onChange={(e) => setFilter(e.target.value)}>
            <option value="open">Открытые</option>
            <option value="resolved">Рассмотренные</option>
            <option value="all">Все</option>
          </select>
        </div>
      </div>
      {list.isPending ? <Loading /> : null}
      {list.isError ? <ErrorPanel error={list.error} onRetry={() => list.refetch()} /> : null}
      {list.data && list.data.items.length === 0 && offset > 0 && list.data.total > 0 ? (
        <Empty title="На этой странице апелляций нет">
          <button type="button" onClick={() => setOffset(0)}>
            К первой странице
          </button>
        </Empty>
      ) : list.data && list.data.items.length === 0 ? (
        <Empty title={state === 'open' ? 'Открытых апелляций нет' : 'Апелляций нет'}>
          Апелляция подаётся из карточки оценки по конкретному критерию.
        </Empty>
      ) : null}
      <ul className="appeal-queue">
        {list.data?.items.map((a) => (
          <li key={a.id} data-testid="queue-appeal" data-state={a.state}>
            <button
              type="button"
              className="appeal-head"
              aria-expanded={openId === a.id}
              onClick={() => toggleAppeal(openId === a.id ? null : a.id)}
            >
              <Badge status={a.state}>{a.state === 'open' ? 'Открыта' : 'Рассмотрена'}</Badge>{' '}
              <span>критерий {a.criterion_id}</span> · <span>оценка {shortId(a.evaluation_id)}</span> ·{' '}
              <span className="muted">{serverTime(a.created_at)}</span>
              <span className="clamp">{a.comment}</span>
            </button>
            {openId === a.id ? <AppealReview appeal={a} onDecided={setLastDecision} /> : null}
          </li>
        ))}
      </ul>
      {list.data && list.data.total > PAGE_SIZE ? (
        <nav className="pager" aria-label="Страницы">
          <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
            ← Назад
          </button>
          <span data-testid="pager-range">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, list.data.total)} из {list.data.total}
          </span>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= list.data.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Вперёд →
          </button>
        </nav>
      ) : null}
    </div>
  );
}
