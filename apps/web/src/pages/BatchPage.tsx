import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { EvaluationBatch, EvaluationView, Job } from '../api/types';
import { ExportLinks } from '../components/ExportLinks';
import { Badge, ErrorPanel, Loading } from '../components/States';
import { serverTime, shortId } from '../lib/format';
import { artifactStatusLabel, errorCodeLabel, jobStateLabel } from '../lib/labels';

const ACTIVE = new Set(['queued', 'running', 'retry_wait']);

export function batchIsActive(batch: EvaluationBatch | undefined): boolean {
  return Boolean(batch?.jobs.some((j) => ACTIVE.has(j.state)));
}

/** Bounded polling: back off with time and stop entirely once every job is final. */
export function pollInterval(batch: EvaluationBatch | undefined, ticks: number): number | false {
  if (!batchIsActive(batch)) return false;
  return Math.min(1000 + ticks * 500, 10000);
}

function JobRow({ job, evaluation }: { job: Job; evaluation: EvaluationView | undefined }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.retryJob(job.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['batch', job.batch_id] }),
  });
  const attempt = job.attempts.length;
  return (
    <tr data-testid="job-row" data-state={job.state}>
      <td>
        <Link to={`/conversations/${encodeURIComponent(job.conversation_id)}?revision=${job.conversation_revision}`}>
          {shortId(job.conversation_id)}
        </Link>
        <div className="muted">revision {job.conversation_revision}</div>
      </td>
      <td>
        <Badge status={job.state}>{jobStateLabel[job.state] ?? job.state}</Badge>
        {job.state === 'succeeded' && evaluation?.artifact.status === 'partial' ? (
          <p className="hint" data-testid="partial-note">
            Обработка завершена, оценка неполная: по части критериев ответ не определён, полного итога нет.
          </p>
        ) : null}
      </td>
      <td>
        попытка {attempt} из {job.max_attempts}
        {job.state === 'retry_wait' && job.next_attempt_at ? (
          <div className="muted">следующая попытка не раньше {serverTime(job.next_attempt_at)}</div>
        ) : null}
      </td>
      <td>
        {job.error ? (
          <span>
            {errorCodeLabel[job.error.code] ?? job.error.code}
            <div className="muted">
              correlation_id: <code>{job.error.correlation_id}</code>
            </div>
          </span>
        ) : (
          '—'
        )}
      </td>
      <td>
        {job.evaluation_id ? (
          <Link to={`/evaluations/${encodeURIComponent(job.evaluation_id)}`}>
            карточка{evaluation ? ` · ${artifactStatusLabel[evaluation.artifact.status]}` : ''}
          </Link>
        ) : null}
        {job.state === 'failed' || job.state === 'retry_wait' ? (
          <button type="button" onClick={() => retry.mutate()} disabled={retry.isPending}>
            {retry.isPending ? 'Повтор…' : 'Повторить задание'}
          </button>
        ) : null}
        {retry.isError ? <ErrorPanel error={retry.error} /> : null}
      </td>
    </tr>
  );
}

export function BatchPage() {
  const { id = '' } = useParams();
  const batch = useQuery({
    queryKey: ['batch', id],
    queryFn: ({ signal }) => api.getBatch(id, signal),
    refetchInterval: (query) => pollInterval(query.state.data, query.state.dataUpdateCount),
    refetchIntervalInBackground: false,
    retry: 2,
  });
  const active = batchIsActive(batch.data);
  const evaluations = useQuery({
    queryKey: ['evaluations', { batch_id: id }, batch.data?.progress],
    queryFn: ({ signal }) => api.listEvaluations({ batch_id: id, limit: 200 }, signal),
    enabled: Boolean(batch.data),
  });
  const byId = new Map((evaluations.data?.items ?? []).map((e) => [e.id, e]));

  if (batch.isPending) return <Loading label="Загрузка пакета…" />;
  if (batch.isError && !batch.data) return <ErrorPanel error={batch.error} onRetry={() => batch.refetch()} />;
  const b = batch.data!;
  const p = b.progress;

  return (
    <div className="page">
      <p className="crumbs">
        <Link to="/conversations">Диалоги</Link> / Пакет
      </p>
      <h1>
        Пакет <code>{shortId(b.id)}</code>
      </h1>
      <dl className="meta">
        <dt>Создан</dt>
        <dd>{serverTime(b.created_at)}</dd>
        <dt>Версия чек-листа</dt>
        <dd>
          <code>{b.checklist_version_id}</code>
        </dd>
        <dt>Профиль</dt>
        <dd>
          {b.profile_id} · {b.profile_version}
        </dd>
        <dt>Режим</dt>
        <dd>{b.mode}</dd>
      </dl>
      {batch.isError ? (
        <ErrorPanel error={batch.error} onRetry={() => batch.refetch()}>
          <p>Показано последнее полученное состояние. Пакет не создаётся заново.</p>
        </ErrorPanel>
      ) : null}
      <p role="status" aria-live="polite" className="progress-line" data-testid="batch-progress">
        Всего {p.total}: в очереди {p.queued}, выполняется {p.running}, ожидает повтора {p.retry_wait}, завершено{' '}
        {p.succeeded}, с ошибкой {p.failed}
        {p.cancelled ? `, отменено ${p.cancelled}` : ''}.{active ? ' Обновляется…' : ' Все задания в финальном состоянии.'}
      </p>
      <div className="table-wrap" tabIndex={0} aria-label="Задания пакета">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Разговор</th>
              <th scope="col">Состояние</th>
              <th scope="col">Попытки</th>
              <th scope="col">Причина</th>
              <th scope="col">Результат</th>
            </tr>
          </thead>
          <tbody>
            {b.jobs.map((job) => (
              <JobRow key={job.id} job={job} evaluation={job.evaluation_id ? byId.get(job.evaluation_id) : undefined} />
            ))}
          </tbody>
        </table>
      </div>
      <ExportLinks kind="batch" id={b.id} />
    </div>
  );
}
