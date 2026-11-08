import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { CallRecord, EvaluationView, Job } from '../api/types';
import { decimalRu, durationText, serverTime } from '../lib/format';
import { costText, durations, modelPairs, reusedRunCallsText, tokenText, tokenTotals } from '../lib/runSummary';
import { callOutcomeLabel, callPurposeLabel, errorCodeLabel, jobStateLabel } from '../lib/labels';
import { ChecklistName, ProfileName } from './DisplayNames';

export function CallTable({ calls, attempts }: { calls: CallRecord[]; attempts?: Job['attempts'] }) {
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

/**
 * Compact answer to "where did this result come from and was there a new model call?".
 * Every fact is read from the saved evaluation and its job ledger, not from the current
 * application configuration. For a reused result the original run is read from the source
 * evaluation's own server summary and shown separately: it is not part of this run's spend.
 */
export function RunSummary({ evaluation }: { evaluation: EvaluationView }) {
  const run = evaluation.run;
  const reusedFrom = evaluation.reuse.reused_from_evaluation_id;
  const source = useQuery({
    queryKey: ['evaluation', reusedFrom],
    queryFn: ({ signal }) => api.getEvaluation(reusedFrom!, signal),
    enabled: Boolean(reusedFrom),
    staleTime: 60_000,
  });
  const time = durations(run);
  const models = modelPairs(run?.calls ?? []);
  const sourceRun = source.data?.run;
  const sourceModels = modelPairs(sourceRun?.calls ?? []);
  const test = evaluation.artifact.evaluator_mode === 'test';
  return (
    <section className="panel run-summary" aria-labelledby="run-summary-title" data-testid="run-summary">
      <h2 id="run-summary-title">Откуда этот результат</h2>
      <p className={`run-origin ${reusedFrom ? 'run-origin-reuse' : 'run-origin-fresh'}`} data-testid="run-origin">
        {reusedFrom ? (
          <>
            <strong>Переиспользован сохранённый результат</strong>. {reusedRunCallsText(run)} Ответы взяты из оценки{' '}
            <Link to={`/evaluations/${encodeURIComponent(reusedFrom)}`}>предыдущего запуска</Link>, баллы пересчитаны
            сервером по версии этой карточки.
          </>
        ) : (
          <>
            <strong>Новый вызов оценщика</strong> в этом запуске.
          </>
        )}
        {test ? <span className="run-test"> Тестовый оценщик — синтетический ответ, не настоящий AI.</span> : null}
      </p>
      <dl className="run-facts">
        <div>
          <dt>Получена</dt>
          <dd>{serverTime(evaluation.created_at)}</dd>
        </div>
        <div>
          <dt>Версия правил</dt>
          <dd>
            <Link to={`/checklists/version/${encodeURIComponent(evaluation.checklist_version_id)}`}>
              <ChecklistName id={evaluation.checklist_version_id} />
            </Link>
          </dd>
        </div>
        <div>
          <dt>Профиль</dt>
          <dd>
            <ProfileName id={evaluation.profile_id} version={evaluation.profile_version} />
          </dd>
        </div>
        <div>
          <dt>Модель</dt>
          <dd data-testid="run-models">
            {models.length ? models.join('; ') : reusedFrom ? 'не вызывалась' : run ? 'вызовов нет' : 'неизвестна'}
          </dd>
        </div>
        <div>
          <dt>Длительность задания</dt>
          <dd data-testid="run-duration">
            {time.job}
            {run?.calls.length ? <small className="muted"> · сумма вызовов {time.calls}</small> : null}
          </dd>
        </div>
        <div>
          <dt>Вызовы модели</dt>
          <dd data-testid="run-calls">
            {run
              ? `${run.calls.length} · попыток задания ${run.job.attempts.length}`
              : 'неизвестно: нет истории запуска'}
          </dd>
        </div>
        <div>
          <dt>Токены (по данным API)</dt>
          <dd data-testid="run-tokens">{run ? tokenText(tokenTotals(run.calls)) : 'неизвестны'}</dd>
        </div>
        <div>
          <dt>Стоимость запуска</dt>
          <dd data-testid="run-cost">{costText(run)}</dd>
        </div>
      </dl>
      {reusedFrom ? (
        <p className="run-source" data-testid="run-source">
          Исходный результат:{' '}
          {source.isPending
            ? 'загрузка…'
            : source.isError
              ? 'не удалось прочитать исходную оценку.'
              : sourceRun
                ? `${serverTime(source.data.created_at)} · вызовов ${sourceRun.calls.length}${sourceModels.length ? ` · ${sourceModels.join('; ')}` : ''} · токены: ${tokenText(tokenTotals(sourceRun.calls))} · стоимость: ${costText(sourceRun)}. Эти расходы уже были и к текущему запуску не прибавляются.`
                : 'история исходного запуска недоступна; расходы неизвестны.'}
        </p>
      ) : null}
    </section>
  );
}

export function RunDetails({ evaluation }: { evaluation: EvaluationView }) {
  const a = evaluation.artifact;
  const run = evaluation.run;
  const reuse = evaluation.reuse;
  const id = a.identity;
  return (
    <>
      <RunSummary evaluation={evaluation} />
      <details className="panel run-details" data-testid="run-details">
        <summary>Детали запуска: версии, модели, стоимость</summary>
        <p className="hint">Технические подробности: идентификаторы, хеши, попытки и журнал вызовов.</p>
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
          <dt>ID оценки</dt>
          <dd>
            <code>{evaluation.id}</code>
          </dd>
          <dt>Ключ переиспользования</dt>
          <dd>
            <code>{reuse.reuse_key}</code>
          </dd>
          <dt>Хеши входа</dt>
          <dd className="hashes">
            текст <code>{id.conversation_content_hash}</code>
            <br />
            правила (смысл) <code>{id.checklist_semantic_hash}</code>
            <br />
            профиль <code>{id.profile_hash}</code>
            <br />
            корпус <code>{id.corpus_snapshot_hash}</code>
            {id.audio_content_hash ? (
              <>
                <br />
                аудио <code>{id.audio_content_hash}</code>
              </>
            ) : null}
          </dd>
          {run ? (
            <>
              <dt>Задание</dt>
              <dd>
                <code>{run.job.id}</code>
                {run.job.batch_id ? (
                  <>
                    {' · пакет '}
                    <Link to={`/batches/${encodeURIComponent(run.job.batch_id)}`}>
                      <code>{run.job.batch_id}</code>
                    </Link>
                  </>
                ) : null}
              </dd>
            </>
          ) : null}
        </dl>
        <ProfileVersions evaluation={evaluation} />
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
              Расход токенов указан по данным API. Выход включает reasoning-токены; они не прибавляются повторно. Имя,
              возвращённое сторонним шлюзом, само по себе не подтверждает модель за ним.
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
    </>
  );
}

/**
 * Prompt/preprocessing versions belong to the pinned profile id+version. They are shown only
 * when the server still describes exactly that version; otherwise nothing is substituted.
 */
function ProfileVersions({ evaluation }: { evaluation: EvaluationView }) {
  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: ({ signal }) => api.listProfiles(signal),
    staleTime: 60_000,
  });
  const p = profiles.data?.items.find(
    (x) => x.profile.id === evaluation.profile_id && x.profile.version === evaluation.profile_version,
  )?.profile;
  if (profiles.isPending) return null;
  if (!p)
    return (
      <p className="muted" data-testid="profile-versions">
        Описание профиля {evaluation.profile_id} · {evaluation.profile_version} на сервере не найдено; сохранён только
        hash профиля выше.
      </p>
    );
  return (
    <p className="muted" data-testid="profile-versions">
      Профиль {p.id} · {p.version} (закреплённая версия): промпт {p.prompt_version}, обработка текста{' '}
      {p.preprocessing_version}, схема ответа {p.output_schema_version}, основная модель {p.primary.provider} /{' '}
      {p.primary.model}
      {p.reviewer ? `, reviewer ${p.reviewer.provider} / ${p.reviewer.model}` : ', reviewer выключен'}.
    </p>
  );
}
