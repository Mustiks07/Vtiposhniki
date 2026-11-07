import { Link } from 'react-router-dom';
import type { EvaluationView } from '../api/types';
import { totalCost } from '../lib/cost';
import { decimalRu, durationText, serverTime } from '../lib/format';
import { callOutcomeLabel, callPurposeLabel, errorCodeLabel } from '../lib/labels';

export function RunDetails({ evaluation }: { evaluation: EvaluationView }) {
  const a = evaluation.artifact;
  const cost = totalCost(a.calls);
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
            <>Новый вызов оценщика (режим {reuse.mode}).</>
          )}
        </dd>
        <dt>Revision карточки</dt>
        <dd>{evaluation.revision}</dd>
      </dl>
      <h3>Вызовы моделей</h3>
      {a.calls.length === 0 ? (
        <p className="muted">
          {reuse.reused_from_evaluation_id ? 'Новых вызовов не было: результат переиспользован.' : 'Вызовы не записаны.'}
        </p>
      ) : (
        <div className="table-wrap" tabIndex={0} aria-label="Вызовы моделей">
          <table className="table compact">
            <thead>
              <tr>
                <th scope="col">Назначение</th>
                <th scope="col">Запрошенная модель</th>
                <th scope="col">Фактическая модель</th>
                <th scope="col">Длительность</th>
                <th scope="col">Результат</th>
                <th scope="col">Стоимость</th>
              </tr>
            </thead>
            <tbody>
              {a.calls.map((c) => (
                <tr key={c.call_id}>
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
                  <td>{c.cost === null || c.cost === undefined ? 'неизвестна' : `${decimalRu(c.cost)} ${c.currency}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p data-testid="total-cost">
        Полная стоимость (все попытки, reviewer, исправления, резерв):{' '}
        {cost.complete && cost.known !== null
          ? `${decimalRu(cost.known)} ${cost.currency}`
          : cost.known !== null
            ? `неизвестна полностью; известная часть ${decimalRu(cost.known)} ${cost.currency}`
            : 'неизвестна'}
      </p>
      {(a.limitations ?? []).length ? (
        <>
          <h3>Ограничения запуска</h3>
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
