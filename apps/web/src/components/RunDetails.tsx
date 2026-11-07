import { Link } from 'react-router-dom';
import type { CallRecord, EvaluationView, Job } from '../api/types';
import { decimalRu, durationText, serverTime } from '../lib/format';
import { callOutcomeLabel, callPurposeLabel, errorCodeLabel, jobStateLabel } from '../lib/labels';

function CallTable({ calls, attempts }: { calls: CallRecord[]; attempts?: Job['attempts'] }) {
  const numbers = new Map(attempts?.map((a) => [a.attempt_id, a.number]));
  return (
    <div className="table-wrap" tabIndex={0} aria-label="Вызовы моделей">
      <table className="table compact">
        <thead>
          <tr>
            {attempts ? <th scope="col">Попытка</th> : null}
            <th scope="col">Назначение</th>
            <th scope="col">Запрошенная модель</th>
            <th scope="col">Модель по ответу API</th>
            <th scope="col">Длительность</th>
            <th scope="col">Результат</th>
            <th scope="col">Токены: вход / выход</th>
            <th scope="col">Стоимость</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.call_id}>
              {attempts ? <td>{numbers.get(c.attempt_id) ?? '—'}</td> : null}
              <td>{callPurposeLabel[c.purpose] ?? c.purpose}</td>
              <td>
                {c.requested.provider} / {c.requested.model}
              </td>
              <td>{c.actual ? `${c.actual.provider} / ${c.actual.model}` : 'неизвестна'}</td>
              <td>{durationText(c.started_at, c.finished_at)}</td>
              <td>
                {callOutcomeLabel[c.outcome] ?? c.outcome}
                {c.safe_error ? ` · ${errorCodeLabel[c.safe_error.code] ?? c.safe_error.code}` : ''}
              </td>
              <td>
                {c.usage?.input_tokens?.toLocaleString('ru-RU') ?? 'неизвестно'} /{' '}
                {c.usage?.output_tokens?.toLocaleString('ru-RU') ?? 'неизвестно'}
              </td>
              <td>{c.cost === null || c.cost === undefined ? 'неизвестна' : `${decimalRu(c.cost)} ${c.currency}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RunDetails({ evaluation }: { evaluation: EvaluationView }) {
  const a = evaluation.artifact;
  const run = evaluation.run;
  const reuse = evaluation.reuse;
  return (
    <details className="panel run-details" data-testid="run-details">
      <summary>Детали запуска: версии, модели, стоимость</summary>
      <dl className="meta">
        <dt>Создана</dt>
        <dd>{serverTime(evaluation.created_at)}</dd>
        <dt>Revision разговора</dt>
        <dd>{evaluation.conversation_revision}</dd>
        <dt>Версия чек-листа</dt>
        <dd>
          <Link to={`/checklists/version/${encodeURIComponent(evaluation.checklist_version_id)}`}>
            <code>{evaluation.checklist_version_id}</code>
          </Link>
        </dd>
        <dt>Профиль оценщика</dt>
        <dd>
          {evaluation.profile_id} · {evaluation.profile_version} ·{' '}
          {a.evaluator_mode === 'test' ? 'тестовый режим' : 'production'}
        </dd>
        <dt>Снимок базы знаний</dt>
        <dd>
          <code>{evaluation.corpus_snapshot_id}</code>
        </dd>
        <dt>Происхождение</dt>
        <dd data-testid="reuse-provenance">
          {reuse.reused_from_evaluation_id ? (
            <>
              Переиспользован результат оценки{' '}
              <Link to={`/evaluations/${encodeURIComponent(reuse.reused_from_evaluation_id)}`}>
                <code>{reuse.reused_from_evaluation_id}</code>
              </Link>{' '}
              (режим {reuse.mode}, подтверждено сервером); баллы пересчитаны по текущей версии весов.
            </>
          ) : (
            <>Результат получен в этом запуске (режим {reuse.mode}).</>
          )}
        </dd>
        <dt>Revision карточки</dt>
        <dd>{evaluation.revision}</dd>
      </dl>
      {run ? (
        <section aria-label="История текущего запуска" data-testid="current-run">
          <h3>Текущий запуск</h3>
          <p>
            Статус: {jobStateLabel[run.job.state] ?? run.job.state}. Попыток: {run.job.attempts.length}.
          </p>
          <details data-testid="run-attempts">
            <summary>История попыток ({run.job.attempts.length})</summary>
            <ol>
              {run.job.attempts.map((attempt) => (
                <li key={attempt.attempt_id}>
                  Попытка {attempt.number}:{' '}
                  {attempt.state === 'expired'
                    ? 'истёк срок выполнения'
                    : (jobStateLabel[attempt.state] ?? attempt.state)}
                  {' · '}
                  {serverTime(attempt.started_at)}
                  {attempt.error ? ` · ${errorCodeLabel[attempt.error.code] ?? attempt.error.code}` : ''}
                </li>
              ))}
            </ol>
          </details>
          <h3>Вызовы этого запуска</h3>
          <p className="muted">
            Расход токенов указан по данным API. Выход включает reasoning-токены; они не прибавляются повторно.
            Имя, возвращённое сторонним шлюзом, само по себе не подтверждает модель за ним.
          </p>
          {run.calls.length ? (
            <CallTable calls={run.calls} attempts={run.job.attempts} />
          ) : (
            <p className="muted">
              {reuse.reused_from_evaluation_id
                ? 'Новых вызовов не было: результат переиспользован.'
                : 'Вызовы не записаны.'}
            </p>
          )}
        </section>
      ) : (
        <p className="notice">История текущего задания недоступна. Вызовы артефакта не заменяют её.</p>
      )}
      <p data-testid="total-cost">
        Стоимость текущего запуска (все попытки, reviewer, исправления, резерв):{' '}
        {run?.cost_complete && run.cost !== null
          ? `${decimalRu(run.cost)} ${run.currency}`
          : run?.cost !== null && run?.cost !== undefined
            ? `неизвестна полностью; известная часть ${decimalRu(run.cost)} ${run.currency}`
            : 'неизвестна'}
      </p>
      {(reuse.reused_from_evaluation_id || !run) && a.calls.length ? (
        <details data-testid="source-calls">
          <summary>Вызовы исходного артефакта ({a.calls.length})</summary>
          <p>Это происхождение сохранённой оценки. Эти расходы не добавляются к стоимости текущего запуска.</p>
          <CallTable calls={a.calls} />
        </details>
      ) : null}
      {(a.limitations ?? []).length ? (
        <>
          <h3>Ограничения оценки</h3>
          <ul>
            {(a.limitations ?? []).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </>
      ) : null}
    </details>
  );
}
