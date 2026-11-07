import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Criterion, Decision, EvaluationView } from '../api/types';
import { AppealForm, DecisionComparison, DecisionForm, DecisionSavedNotice } from '../components/Appeals';
import { AudioPanel } from '../components/AudioPanel';
import {
  answerText,
  rawStepText,
  ContributionLine,
  ProposalView,
  ReviewNote,
  ScaleTable,
} from '../components/CriterionDetail';
import { ExportLinks } from '../components/ExportLinks';
import { Modal } from '../components/Modal';
import { RunDetails } from '../components/RunDetails';
import { ScorePanel } from '../components/ScorePanel';
import { Badge, Empty, ErrorPanel, Loading } from '../components/States';
import { Transcript, verifiedMapping } from '../components/Transcript';
import { decimalRu, serverTime, shortId } from '../lib/format';
import { evidenceMessageIds } from '../lib/evidence';
import {
  applicabilityLabel,
  artifactStatusLabel,
  channelLabel,
  errorCodeLabel,
  responseTypeLabel,
} from '../lib/labels';

function CriterionList({
  criteria,
  evaluation,
  selected,
  onSelect,
  scope,
}: {
  criteria: Criterion[];
  evaluation: EvaluationView;
  selected: string | null;
  onSelect: (id: string) => void;
  scope: 'automatic' | 'effective';
}) {
  const effective = new Map(
    (scope === 'automatic' ? evaluation.artifact.automatic_final : evaluation.effective_proposals).map((p) => [
      p.criterion_id,
      p,
    ]),
  );
  const contributions = new Map(
    (scope === 'automatic' ? evaluation.automatic_score : evaluation.effective_score).contributions.map((c) => [
      c.criterion_id,
      c,
    ]),
  );
  const decided = new Set(evaluation.human_decisions.map((d) => d.criterion_id));
  return (
    <div className="criteria-panel">
      <div className="criteria-heading">
        <span>Критерий</span>
        <span>Ответ</span>
        <span>Вклад / вес</span>
      </div>
      <ul className="criteria" aria-label="Критерии">
        {criteria.map((c, index) => {
          const p = effective.get(c.id);
          const contribution = contributions.get(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`criterion-item${selected === c.id ? ' active' : ''}`}
                aria-pressed={selected === c.id}
                onClick={() => onSelect(c.id)}
                data-testid="criterion-item"
                data-criterion-id={c.id}
              >
                <span className="criterion-label">
                  <span className="criterion-title">
                    <span className="criterion-number">{index + 1}</span>
                    {c.title}
                  </span>
                  <span className="criterion-meta">
                    {c.response_type === 'flag' ? 'Флаг без баллов' : responseTypeLabel[c.response_type]}
                    {scope === 'effective' && decided.has(c.id) ? ' · решение человека' : ''}
                  </span>
                </span>
                <span className="criterion-answer">
                  <span className={p?.applicability === 'undetermined' ? 'answer-unknown' : 'answer-value'}>
                    {p?.applicability === 'applicable'
                      ? (rawStepText(c, p.answer_choice_id) ?? answerText(c, p))
                      : answerText(c, p)}
                  </span>
                </span>
                <span className="criterion-contribution">
                  {contribution && c.response_type !== 'flag' && contribution.applicability === 'applicable' ? (
                    <>
                      {decimalRu(contribution.earned_weight)} <small>/ {decimalRu(contribution.original_weight)}</small>
                    </>
                  ) : c.response_type === 'flag' ? (
                    '—'
                  ) : p?.applicability === 'not_applicable' ? (
                    'N/A'
                  ) : (
                    '—'
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EvaluationPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const selectedParam = params.get('criterion');
  const scope = params.get('scope') === 'automatic' ? 'automatic' : 'effective';
  const view = params.get('view') === 'transcript' ? 'transcript' : 'evaluation';
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [focusToken, setFocusToken] = useState(0);
  const [openSource, setOpenSource] = useState<string | null>(null);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [lastDecision, setLastDecision] = useState<Decision | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const [criterionToFocus, setCriterionToFocus] = useState<string | null>(null);
  useEffect(() => {
    if (criterionToFocus && view === 'evaluation' && selectedParam === criterionToFocus && detailRef.current) {
      detailRef.current.focus({ preventScroll: false });
      setCriterionToFocus(null);
    }
  }, [criterionToFocus, view, selectedParam]);

  const evaluation = useQuery({ queryKey: ['evaluation', id], queryFn: ({ signal }) => api.getEvaluation(id, signal) });
  const e = evaluation.data;
  const conversation = useQuery({
    queryKey: ['conversation', e?.conversation_id, e?.conversation_revision],
    queryFn: ({ signal }) => api.getConversation(e!.conversation_id, e!.conversation_revision, signal),
    enabled: Boolean(e),
  });
  const checklist = useQuery({
    queryKey: ['checklist-version', e?.checklist_version_id],
    queryFn: ({ signal }) => api.getChecklistVersion(e!.checklist_version_id, signal),
    enabled: Boolean(e),
    staleTime: Infinity, // versions are immutable
  });
  const appeals = useQuery({
    queryKey: ['appeals', { evaluation_id: id }],
    queryFn: ({ signal }) => api.listAppeals({ evaluation_id: id, limit: 200 }, signal),
    enabled: Boolean(e),
    retry: 0,
  });

  // `?evidence=<index>` (links from the comparison page) opens that evidence item of the
  // selected criterion in the chosen scope once, then leaves the URL as a normal card link.
  const evidenceParam = params.get('evidence');
  useEffect(() => {
    if (evidenceParam === null || !e || !conversation.data || !checklist.data) return;
    const proposals = scope === 'automatic' ? e.artifact.automatic_final : e.effective_proposals;
    const item = proposals.find((p) => p.criterion_id === selectedParam)?.evidence[Number(evidenceParam)];
    const next = new URLSearchParams(params);
    next.delete('evidence');
    if (item?.kind === 'source' && item.source_chunk_id) setOpenSource(item.source_chunk_id);
    else if (item) {
      setHighlighted(evidenceMessageIds(item, conversation.data.messages));
      setFocusToken((t) => t + 1);
      next.set('view', 'transcript');
    }
    setParams(next, { replace: true });
  }, [evidenceParam, e, conversation.data, checklist.data, scope, selectedParam, params, setParams]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key === 'view' });
  }
  function selectCriterion(cid: string) {
    setHighlighted([]);
    setOpenSource(null);
    setShowAppealForm(false);
    const next = new URLSearchParams(params);
    next.set('criterion', cid);
    next.delete('view');
    next.delete('evidence');
    setParams(next);
    setCriterionToFocus(cid);
  }
  function fromMessage(cid: string) {
    selectCriterion(cid);
  }
  function showEvidence(ids: string[]) {
    setHighlighted(ids);
    setFocusToken((t) => t + 1);
    if (view !== 'transcript') setParam('view', 'transcript');
  }
  function seek(messageId: string) {
    const start = conversation.data && verifiedMapping(conversation.data.audio)?.get(messageId);
    if (start === undefined || !audioRef.current) return;
    audioRef.current.currentTime = Number(start);
    void audioRef.current.play().catch(() => undefined);
  }

  if (evaluation.isPending) return <Loading label="Загрузка карточки…" />;
  if (evaluation.isError) return <ErrorPanel error={evaluation.error} onRetry={() => evaluation.refetch()} />;
  const ev = evaluation.data;
  const criteria = checklist.data?.criteria ?? [];
  const selected = selectedParam ?? criteria[0]?.id ?? null;
  const criterion = criteria.find((c) => c.id === selected) ?? null;
  const autoP = criterion ? ev.artifact.automatic_final.find((p) => p.criterion_id === criterion.id) : undefined;
  const effP = criterion ? ev.effective_proposals.find((p) => p.criterion_id === criterion.id) : undefined;
  const autoC = criterion ? ev.automatic_score.contributions.find((c) => c.criterion_id === criterion.id) : undefined;
  const effC = criterion ? ev.effective_score.contributions.find((c) => c.criterion_id === criterion.id) : undefined;
  const review = criterion ? ev.artifact.reviews.find((r) => r.criterion_id === criterion.id) : undefined;
  const criterionDecisions = criterion ? ev.human_decisions.filter((d) => d.criterion_id === criterion.id) : [];
  const criterionAppeals = criterion ? (appeals.data?.items ?? []).filter((a) => a.criterion_id === criterion.id) : [];
  const openAppeal = criterionAppeals.find((a) => a.state === 'open');
  const messages = conversation.data?.messages ?? [];
  const citations = new Map<string, { id: string; number: number; title: string }[]>();
  for (const p of scope === 'automatic' ? ev.artifact.automatic_final : ev.effective_proposals) {
    const index = criteria.findIndex((c) => c.id === p.criterion_id);
    if (index < 0) continue;
    const ids = new Set(p.evidence.flatMap((item) => evidenceMessageIds(item, messages)));
    for (const messageId of ids)
      citations.set(messageId, [
        ...(citations.get(messageId) ?? []),
        { id: p.criterion_id, number: index + 1, title: criteria[index].title },
      ]);
  }
  const fragments = ev.source_fragments.length ? ev.source_fragments : (ev.artifact.source_fragments ?? []);
  const canSeek = Boolean(conversation.data && verifiedMapping(conversation.data.audio));
  const proposalProps = {
    messages,
    fragments,
    onShow: showEvidence,
    openSource,
    onToggleSource: (chunk: string) => setOpenSource((s) => (s === chunk ? null : chunk)),
  };

  return (
    <div className="page page-card">
      <p className="crumbs">
        <Link to="/conversations">Диалоги</Link> /{' '}
        <Link to={`/conversations/${encodeURIComponent(ev.conversation_id)}?revision=${ev.conversation_revision}`}>
          {conversation.data?.external_id ?? shortId(ev.conversation_id)}
        </Link>{' '}
        / Оценка
      </p>
      <h1>
        Карточка оценки <code>{shortId(ev.id)}</code>
      </h1>
      <p className="card-meta">
        <Badge status={ev.artifact.status}>{artifactStatusLabel[ev.artifact.status]}</Badge>{' '}
        {conversation.data ? `${channelLabel[conversation.data.channel]} · ${conversation.data.language} · ` : ''}
        revision разговора {ev.conversation_revision} · {serverTime(ev.created_at)}
      </p>
      {params.get('scope') === 'automatic' || params.get('scope') === 'effective' ? (
        <p className="scope-note hint" data-testid="opened-scope">
          Результат <strong>{params.get('scope')}</strong>
          {params.get('scope') === 'effective'
            ? ' — с учётом решений проверяющего; исходная оценка сохранена.'
            : ' — исходный ответ оценщика.'}
        </p>
      ) : null}
      {ev.artifact.evaluator_mode === 'test' ? (
        <p className="notice notice-warn" data-testid="test-banner">
          Тестовый оценщик: синтетический результат без семантической оценки. Не является AI-оценкой разговора.
        </p>
      ) : null}
      {ev.artifact.status === 'failed' ? (
        <div className="state state-error" role="alert">
          <p className="state-title">Оценка не получена</p>
          {ev.artifact.error ? (
            <p>
              {errorCodeLabel[ev.artifact.error.code] ?? ev.artifact.error.code} · correlation_id:{' '}
              <code>{ev.artifact.error.correlation_id}</code>
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className="view-tabs"
        role="tablist"
        aria-label="Режим просмотра на узком экране"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const nextView =
            event.key === 'Home'
              ? 'evaluation'
              : event.key === 'End'
                ? 'transcript'
                : view === 'evaluation'
                  ? 'transcript'
                  : 'evaluation';
          setParam('view', nextView === 'evaluation' ? null : nextView);
          event.currentTarget.querySelector<HTMLButtonElement>(`[data-view="${nextView}"]`)?.focus();
        }}
      >
        <button
          type="button"
          role="tab"
          data-view="evaluation"
          id="evaluation-tab"
          aria-controls="evaluation-pane"
          tabIndex={view === 'evaluation' ? 0 : -1}
          aria-selected={view === 'evaluation'}
          onClick={() => setParam('view', null)}
        >
          Оценка
        </button>
        <button
          type="button"
          role="tab"
          data-view="transcript"
          id="transcript-tab"
          aria-controls="transcript-pane"
          tabIndex={view === 'transcript' ? 0 : -1}
          aria-selected={view === 'transcript'}
          onClick={() => setParam('view', 'transcript')}
        >
          Разговор{highlighted.length ? ` · выделено ${highlighted.length}` : ''}
        </button>
      </div>

      <div className={`card-layout view-${view}`}>
        <div className="card-transcript" id="transcript-pane">
          {conversation.data ? <AudioPanel key={`${conversation.data.id}:${conversation.data.revision}`}
            ref={audioRef} conversation={conversation.data} onAvailable={() => { void conversation.refetch(); }} /> : null}
          {conversation.isPending ? <Loading label="Загрузка разговора…" /> : null}
          {conversation.isError ? (
            <ErrorPanel error={conversation.error} onRetry={() => conversation.refetch()} />
          ) : null}
          {criterion && highlighted.length ? (
            <p className="back-to">
              <button type="button" className="link" onClick={() => setParam('view', null)}>
                ← к критерию «{criterion.title}»
              </button>
            </p>
          ) : null}
          {conversation.data ? (
            <Transcript
              conversation={conversation.data}
              highlighted={highlighted}
              focusToken={focusToken}
              focusReady={view === 'transcript'}
              canSeek={canSeek}
              onSeek={seek}
              citations={citations}
              onCriterion={fromMessage}
            />
          ) : null}
        </div>

        <div className="card-evaluation" id="evaluation-pane">
          <ScorePanel
            evaluation={ev}
            checklist={checklist.data}
            scope={scope}
            onScope={(value) => {
              setHighlighted([]);
              setParam('scope', value);
            }}
            onCriterion={selectCriterion}
          />
          <RunDetails evaluation={ev} />
          {checklist.isError ? <ErrorPanel error={checklist.error} onRetry={() => checklist.refetch()} /> : null}
          {checklist.isPending ? <Loading label="Загрузка чек-листа…" /> : null}
          {criteria.length ? (
            <CriterionList
              criteria={criteria}
              evaluation={ev}
              selected={selected}
              onSelect={selectCriterion}
              scope={scope}
            />
          ) : null}

          {criterion ? (
            <section
              ref={detailRef}
              tabIndex={-1}
              className="panel criterion-detail"
              aria-labelledby="crit-title"
              data-testid="criterion-detail"
            >
              <h2 id="crit-title">{criterion.title}</h2>
              <details className="criterion-rule">
                <summary>Правило и шкала закреплённой версии</summary>
                <p className="definition">{criterion.definition}</p>
                <ScaleTable criterion={criterion} selected={(scope === 'automatic' ? autoP : effP)?.answer_choice_id} />
              </details>
              <h3>Вклад ({scope})</h3>
              <ContributionLine criterion={criterion} contribution={scope === 'automatic' ? autoC : effC} />
              {effC && autoC && effC.applicability !== autoC.applicability ? (
                <p className="hint">Automatic: {applicabilityLabel[autoC.applicability]}.</p>
              ) : null}
              <ReviewNote review={review} />
              {effP && effP.origin === 'human' ? (
                <>
                  <h3>Действующий ответ (решение проверяющего)</h3>
                  <ProposalView criterion={criterion} proposal={effP} {...proposalProps} />
                </>
              ) : null}
              <h3>Ответ оценщика (automatic)</h3>
              {autoP ? (
                <ProposalView criterion={criterion} proposal={autoP} {...proposalProps} />
              ) : (
                <p className="muted">Оценщик не вернул ответ по этому критерию.</p>
              )}
              <DecisionComparison
                evaluation={ev}
                criterion={criterion}
                decisions={criterionDecisions}
                appeals={criterionAppeals}
              />

              <section className="appeals-block" aria-label="Апелляция по критерию">
                <h3>Апелляция</h3>
                <DecisionSavedNotice decision={lastDecision} onClose={() => setLastDecision(null)} />
                {appeals.isError ? <ErrorPanel error={appeals.error} onRetry={() => appeals.refetch()} /> : null}
                {criterionAppeals.map((a) => (
                  <div key={a.id} className="appeal" data-testid="appeal" data-state={a.state}>
                    <p>
                      <Badge status={a.state}>{a.state === 'open' ? 'Открыта' : 'Рассмотрена'}</Badge> ·{' '}
                      {serverTime(a.created_at)} · к revision {a.effective_revision}
                    </p>
                    <p className="rationale">{a.comment}</p>
                    {a.state === 'open' ? (
                      <details>
                        <summary>Принять решение</summary>
                        <DecisionForm
                          appeal={a}
                          evaluation={ev}
                          criterion={criterion}
                          messages={messages}
                          onReload={() => evaluation.refetch()}
                          onDecided={setLastDecision}
                        />
                      </details>
                    ) : null}
                  </div>
                ))}
                {ev.artifact.status !== 'failed' && !openAppeal ? (
                  <>
                    <button type="button" onClick={() => setShowAppealForm(true)}>
                      Оспорить критерий
                    </button>
                    <Modal open={showAppealForm} title="Апелляция по критерию" onClose={() => setShowAppealForm(false)}>
                      <p>
                        <strong>{criterion.title}</strong>
                      </p>
                      <p className="hint">
                        Ответ оценщика: {answerText(criterion, autoP)}. Исходная оценка сохраняется в истории.
                      </p>
                      <AppealForm
                        key={criterion.id}
                        evaluation={ev}
                        criterionId={criterion.id}
                        onDone={() => setShowAppealForm(false)}
                      />
                    </Modal>
                  </>
                ) : null}
              </section>
            </section>
          ) : criteria.length ? (
            <Empty title="Выберите критерий">
              Откройте критерий, чтобы увидеть ответ, обоснование и доказательства.
            </Empty>
          ) : null}

          <ExportLinks kind="evaluation" id={ev.id} />
        </div>
      </div>
    </div>
  );
}
