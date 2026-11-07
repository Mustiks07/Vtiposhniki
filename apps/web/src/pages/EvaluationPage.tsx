import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Criterion, Decision, EvaluationView } from '../api/types';
import { AppealForm, DecisionComparison, DecisionForm, DecisionSavedNotice } from '../components/Appeals';
import { AudioPanel } from '../components/AudioPanel';
import {
  answerText,
  ContributionLine,
  ProposalView,
  ReviewNote,
  ScaleTable,
} from '../components/CriterionDetail';
import { ExportLinks } from '../components/ExportLinks';
import { RunDetails } from '../components/RunDetails';
import { ScorePanel } from '../components/ScorePanel';
import { Badge, Empty, ErrorPanel, Loading } from '../components/States';
import { Transcript, verifiedMapping } from '../components/Transcript';
import { decimalRu, serverTime, shortId } from '../lib/format';
import { applicabilityLabel, artifactStatusLabel, channelLabel, errorCodeLabel, responseTypeLabel } from '../lib/labels';

function CriterionList({
  criteria,
  evaluation,
  selected,
  onSelect,
}: {
  criteria: Criterion[];
  evaluation: EvaluationView;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const effective = new Map(evaluation.effective_proposals.map((p) => [p.criterion_id, p]));
  const contributions = new Map(evaluation.effective_score.contributions.map((c) => [c.criterion_id, c]));
  const decided = new Set(evaluation.human_decisions.map((d) => d.criterion_id));
  return (
    <ul className="criteria" aria-label="Критерии">
      {criteria.map((c) => {
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
              <span className="criterion-title">{c.title}</span>
              <span className="criterion-meta">
                {responseTypeLabel[c.response_type]}
                {c.response_type !== 'flag' ? ` · вес ${decimalRu(c.weight)}` : ''}
              </span>
              <span className="criterion-answer">
                <Badge status={p?.applicability === 'undetermined' ? 'undetermined' : p ? 'complete' : 'cancelled'}>
                  {answerText(c, p)}
                </Badge>
                {contribution && c.response_type !== 'flag' && contribution.applicability === 'applicable' ? (
                  <span className="muted"> {decimalRu(contribution.earned_weight)}/{decimalRu(contribution.original_weight)}</span>
                ) : null}
                {decided.has(c.id) ? <span className="code-chip">решение проверяющего</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function EvaluationPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const selected = params.get('criterion');
  const view = params.get('view') === 'transcript' ? 'transcript' : 'evaluation';
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [focusToken, setFocusToken] = useState(0);
  const [openSource, setOpenSource] = useState<string | null>(null);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [lastDecision, setLastDecision] = useState<Decision | null>(null);

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
    setParam('criterion', cid);
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
        <p className="notice" data-testid="opened-scope">
          Открыто из поиска по флагу: результат <strong>{params.get('scope')}</strong>
          {params.get('scope') === 'effective'
            ? ' — с учётом решений проверяющего (ниже показан и исходный ответ оценщика).'
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

      <div className="view-tabs" role="tablist" aria-label="Режим просмотра на узком экране">
        <button type="button" role="tab" aria-selected={view === 'evaluation'} onClick={() => setParam('view', null)}>
          Оценка
        </button>
        <button type="button" role="tab" aria-selected={view === 'transcript'} onClick={() => setParam('view', 'transcript')}>
          Разговор{highlighted.length ? ` · выделено ${highlighted.length}` : ''}
        </button>
      </div>

      <div className={`card-layout view-${view}`}>
        <div className="card-transcript">
          {conversation.data ? <AudioPanel ref={audioRef} conversation={conversation.data} /> : null}
          {conversation.isPending ? <Loading label="Загрузка разговора…" /> : null}
          {conversation.isError ? <ErrorPanel error={conversation.error} onRetry={() => conversation.refetch()} /> : null}
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
              canSeek={canSeek}
              onSeek={seek}
            />
          ) : null}
        </div>

        <div className="card-evaluation">
          <ScorePanel evaluation={ev} checklist={checklist.data} />
          {checklist.isError ? <ErrorPanel error={checklist.error} onRetry={() => checklist.refetch()} /> : null}
          {checklist.isPending ? <Loading label="Загрузка чек-листа…" /> : null}
          {criteria.length ? (
            <CriterionList criteria={criteria} evaluation={ev} selected={selected} onSelect={selectCriterion} />
          ) : null}

          {criterion ? (
            <section className="panel criterion-detail" aria-labelledby="crit-title" data-testid="criterion-detail">
              <h2 id="crit-title">{criterion.title}</h2>
              <p className="definition">{criterion.definition}</p>
              <ScaleTable criterion={criterion} selected={effP?.answer_choice_id} />
              <h3>Вклад (effective)</h3>
              <ContributionLine criterion={criterion} contribution={effC} />
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
                  showAppealForm ? (
                    <AppealForm evaluation={ev} criterionId={criterion.id} onDone={() => setShowAppealForm(false)} />
                  ) : (
                    <button type="button" onClick={() => setShowAppealForm(true)}>
                      Оспорить критерий
                    </button>
                  )
                ) : null}
              </section>
            </section>
          ) : criteria.length ? (
            <Empty title="Выберите критерий">Откройте критерий, чтобы увидеть ответ, обоснование и доказательства.</Empty>
          ) : null}

          <RunDetails evaluation={ev} />
          <ExportLinks kind="evaluation" id={ev.id} />
        </div>
      </div>
    </div>
  );
}
