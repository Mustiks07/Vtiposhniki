import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { AudioPanel } from '../components/AudioPanel';
import { BatchLauncher } from '../components/BatchLauncher';
import { TotalValue } from '../components/ScorePanel';
import { Badge, Empty, ErrorPanel, Loading } from '../components/States';
import { Transcript } from '../components/Transcript';
import { serverTime, shortId } from '../lib/format';
import { artifactStatusLabel, channelLabel, languageLabel } from '../lib/labels';

export function ConversationPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const requested = params.get('revision');
  const revision = requested && /^\d+$/.test(requested) ? Number(requested) : null;
  const revId = useId();
  const audioRef = useRef<HTMLAudioElement>(null);

  // Latest revision (to offer the list of revisions) and the selected one.
  const latest = useQuery({ queryKey: ['conversation', id, null], queryFn: ({ signal }) => api.getConversation(id, null, signal) });
  const selected = useQuery({
    queryKey: ['conversation', id, revision],
    queryFn: ({ signal }) => api.getConversation(id, revision, signal),
    enabled: revision !== null,
  });
  const conversation = revision === null ? latest.data : selected.data;
  const evaluations = useQuery({
    queryKey: ['evaluations', { conversation_id: id }],
    queryFn: ({ signal }) => api.listEvaluations({ conversation_id: id, limit: 200 }, signal),
  });
  const conversationIds = useMemo(() => [id], [id]);

  if (latest.isPending) return <Loading label="Загрузка разговора…" />;
  if (latest.isError) return <ErrorPanel error={latest.error} onRetry={() => latest.refetch()} />;
  const latestRevision = latest.data.revision;
  const shownRevision = conversation?.revision ?? revision ?? latestRevision;

  return (
    <div className="page">
      <p className="crumbs">
        <Link to="/conversations">Диалоги</Link> / {latest.data.external_id}
      </p>
      <h1>{latest.data.external_id}</h1>
      <p className="card-meta">
        {channelLabel[latest.data.channel]} · {languageLabel[latest.data.language]} · ID <code>{id}</code>
      </p>
      <div className="row">
        <label htmlFor={revId}>Revision</label>
        <select
          id={revId}
          value={shownRevision}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (Number(e.target.value) === latestRevision) next.delete('revision');
            else next.set('revision', e.target.value);
            setParams(next);
          }}
        >
          {Array.from({ length: latestRevision }, (_, i) => latestRevision - i).map((r) => (
            <option key={r} value={r}>
              {r}
              {r === latestRevision ? ' (последняя)' : ''}
            </option>
          ))}
        </select>
        {shownRevision !== latestRevision ? (
          <span className="notice notice-warn" data-testid="old-revision">
            Показана не последняя revision: текст мог измениться.
          </span>
        ) : null}
      </div>

      <div className="layout-split">
        <div className="grow">
          {selected.isError ? <ErrorPanel error={selected.error} onRetry={() => selected.refetch()} /> : null}
          {revision !== null && selected.isPending ? <Loading /> : null}
          {conversation ? (
            <>
              <AudioPanel ref={audioRef} conversation={conversation} />
              <Transcript conversation={conversation} highlighted={[]} focusToken={0} canSeek={false} />
            </>
          ) : null}
        </div>
        <aside className="side">
          <section className="panel" aria-labelledby="evals-title">
            <h2 id="evals-title">Оценки разговора</h2>
            {evaluations.isPending ? <Loading /> : null}
            {evaluations.isError ? <ErrorPanel error={evaluations.error} onRetry={() => evaluations.refetch()} /> : null}
            {evaluations.data && evaluations.data.items.length === 0 ? (
              <Empty title="Оценок пока нет">Запустите оценку ниже.</Empty>
            ) : null}
            <ul className="eval-list">
              {evaluations.data?.items.map((e) => (
                <li key={e.id} data-testid="evaluation-item" data-revision={e.conversation_revision}>
                  <Link to={`/evaluations/${encodeURIComponent(e.id)}`}>Карточка {shortId(e.id)}</Link>
                  <div>
                    <Badge status={e.artifact.status}>{artifactStatusLabel[e.artifact.status]}</Badge>{' '}
                    effective: <TotalValue score={e.effective_score} />
                  </div>
                  <div className="muted">
                    revision разговора {e.conversation_revision}
                    {e.conversation_revision !== latestRevision ? ' (не последняя — результат относится к старому тексту)' : ''} ·
                    чек-лист {shortId(e.checklist_version_id)} · {serverTime(e.created_at)}
                    {e.human_decisions.length ? ` · решений: ${e.human_decisions.length}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {shownRevision === latestRevision ? (
            <BatchLauncher conversationIds={conversationIds} />
          ) : (
            <p className="hint">Оценка запускается для последней revision разговора.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
