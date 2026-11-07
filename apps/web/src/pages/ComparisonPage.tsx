import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistVersion, CriterionProposal, EvaluationView } from '../api/types';
import { TotalValue } from '../components/ScorePanel';
import { Empty, ErrorPanel, Loading } from '../components/States';
import { VersionDiff } from '../components/VersionDiff';
import { serverTime, shortId } from '../lib/format';

function answer(p: CriterionProposal | undefined, version: ChecklistVersion, cid: string): string {
  if (!p) return 'Нет результата';
  if (p.applicability === 'not_applicable') return 'N/A';
  if (p.applicability === 'undetermined') return 'Недостаточно данных';
  return (
    version.criteria.find((c) => c.id === cid)?.choices.find((c) => c.id === p.answer_choice_id)?.label ?? '—'
  );
}

function ResultCell({
  view,
  proposal,
  version,
  cid,
  scope,
}: {
  view: EvaluationView;
  proposal: CriterionProposal | undefined;
  version: ChecklistVersion;
  cid: string;
  scope: 'automatic' | 'effective';
}) {
  return (
    <td>
      <strong>{answer(proposal, version, cid)}</strong>
      {proposal ? <p>{proposal.rationale}</p> : null}
      {proposal ? (
        <Link
          to={`/evaluations/${encodeURIComponent(view.id)}?criterion=${encodeURIComponent(cid)}&scope=${scope}`}
        >
          Открыть доказательства
        </Link>
      ) : null}
    </td>
  );
}

export function ComparisonPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') === 'effective' ? 'effective' : 'automatic';
  const list = useQuery({
    queryKey: ['evaluations', { conversation_id: id }],
    queryFn: ({ signal }) => api.listEvaluations({ conversation_id: id, limit: 200 }, signal),
  });
  const items = list.data?.items ?? [];
  const right = items.find((e) => e.id === params.get('right')) ?? items[0];
  const left =
    items.find((e) => e.id === params.get('left')) ??
    items.find((e) => e.id !== right?.id && e.conversation_revision === right?.conversation_revision);
  const leftVersion = useQuery({
    queryKey: ['checklist-version', left?.checklist_version_id],
    queryFn: ({ signal }) => api.getChecklistVersion(left!.checklist_version_id, signal),
    enabled: Boolean(left),
  });
  const rightVersion = useQuery({
    queryKey: ['checklist-version', right?.checklist_version_id],
    queryFn: ({ signal }) => api.getChecklistVersion(right!.checklist_version_id, signal),
    enabled: Boolean(right),
  });
  function select(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (left) next.set('left', left.id);
    if (right) next.set('right', right.id);
    next.set(key, value);
    setParams(next);
  }
  if (list.isPending) return <Loading />;
  if (list.isError) return <ErrorPanel error={list.error} onRetry={() => list.refetch()} />;
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
  const leftProposals = scope === 'automatic' ? left.artifact.automatic_final : left.effective_proposals;
  const rightProposals = scope === 'automatic' ? right.artifact.automatic_final : right.effective_proposals;
  const leftScore = scope === 'automatic' ? left.automatic_score : left.effective_score;
  const rightScore = scope === 'automatic' ? right.automatic_score : right.effective_score;
  const ids = [
    ...new Set([
      ...(leftVersion.data?.criteria ?? []).map((c) => c.id),
      ...(rightVersion.data?.criteria ?? []).map((c) => c.id),
    ]),
  ];
  const title = (cid: string) =>
    rightVersion.data?.criteria.find((c) => c.id === cid)?.title ??
    leftVersion.data?.criteria.find((c) => c.id === cid)?.title ??
    cid;
  const changes = ids.filter((cid) => {
    const a = leftProposals.find((p) => p.criterion_id === cid),
      b = rightProposals.find((p) => p.criterion_id === cid);
    return a?.applicability !== b?.applicability || a?.answer_choice_id !== b?.answer_choice_id;
  });
  return (
    <div className="page comparison-page">
      <p className="crumbs">
        <Link to={`/conversations/${encodeURIComponent(id)}`}>Разговор</Link> / Сравнение
      </p>
      <header className="page-heading">
        <div>
          <p className="eyebrow">ДО И ПОСЛЕ</p>
          <h1>Сравнение оценок</h1>
          <p className="page-intro">Что изменилось в правилах, ответах и основаниях решения.</p>
        </div>
      </header>
      <div className="panel comparison-controls">
        {(['left', 'right'] as const).map((side) => (
          <label key={side}>
            {side === 'left' ? 'Исходная оценка' : 'Новая оценка'}
            <select
              value={(side === 'left' ? left : right).id}
              onChange={(e) => select(side, e.target.value)}
            >
              {items.map((e) => (
                <option key={e.id} value={e.id}>
                  {serverTime(e.created_at)} · {e.profile_id} · текст v{e.conversation_revision} ·{' '}
                  {shortId(e.checklist_version_id)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Источник результата
          <select value={scope} onChange={(e) => select('scope', e.target.value)}>
            <option value="automatic">Исходный AI</option>
            <option value="effective">С учётом решений человека</option>
          </select>
        </label>
      </div>
      {!compatible ? (
        <p className="notice notice-warn">
          Выберите разные оценки одного и того же текста. Изменённый разговор нельзя сравнивать как изменение
          оценки прежнего текста.
        </p>
      ) : (
        <>
          <div className="comparison-totals">
            {[
              { view: left, score: leftScore, label: 'Было' },
              { view: right, score: rightScore, label: 'Стало' },
            ].map(({ view, score, label }) => (
              <section className="panel" key={view.id}>
                <p className="eyebrow">{label}</p>
                <div className="comparison-score">
                  <TotalValue score={score} />
                </div>
                <p>
                  {view.profile_id} · версия {view.profile_version}
                </p>
                <p className="muted">
                  {view.reuse.reused_from_evaluation_id
                    ? 'Переиспользован совместимый результат'
                    : 'Отдельный запуск'}{' '}
                  · {serverTime(view.created_at)}
                </p>
                <p>{score.flags.filter((f) => f.detected === true).length} обнаруженных флагов</p>
              </section>
            ))}
          </div>
          {leftVersion.isError ? (
            <ErrorPanel error={leftVersion.error} onRetry={() => leftVersion.refetch()} />
          ) : null}
          {rightVersion.isError ? (
            <ErrorPanel error={rightVersion.error} onRetry={() => rightVersion.refetch()} />
          ) : null}
          {leftVersion.isPending || rightVersion.isPending ? <Loading /> : null}
          {leftVersion.data && rightVersion.data ? (
            <>
              <p role="status">
                Изменённых ответов: {changes.length} из {ids.length}. Баллы рассчитаны сервером для каждой
                закреплённой версии.
              </p>
              {left.profile_id !== right.profile_id || left.profile_version !== right.profile_version ? (
                <p className="notice">
                  Профили оценщика отличаются. Изменения могут быть связаны с моделью, инструкциями и
                  настройками, а не только с чек-листом.
                </p>
              ) : null}
              <div className="table-wrap" tabIndex={0} aria-label="Сравнение критериев">
                <table className="table comparison-table">
                  <thead>
                    <tr>
                      <th>Критерий</th>
                      <th>Было</th>
                      <th>Стало</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ids.map((cid) => (
                      <tr
                        key={cid}
                        data-testid="comparison-row"
                        className={changes.includes(cid) ? 'comparison-changed' : ''}
                      >
                        <th scope="row">
                          {title(cid)}
                          {changes.includes(cid) ? <small>Ответ изменился</small> : null}
                        </th>
                        <ResultCell
                          view={left}
                          version={leftVersion.data}
                          cid={cid}
                          scope={scope}
                          proposal={leftProposals.find((p) => p.criterion_id === cid)}
                        />
                        <ResultCell
                          view={right}
                          version={rightVersion.data}
                          cid={cid}
                          scope={scope}
                          proposal={rightProposals.find((p) => p.criterion_id === cid)}
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <VersionDiff from={leftVersion.data} to={rightVersion.data} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
