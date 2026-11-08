import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api, newIdempotencyKey } from '../api/client';
import type { AssistantRun, CoachingRequest, ScoreContribution } from '../api/types';
import { tokenText, tokenTotals } from '../lib/runSummary';
import { CallTable } from './RunDetails';
import { ErrorPanel } from './States';

function modelText(run: AssistantRun): string {
  const call = run.calls?.at(-1);
  const actual = call?.actual;
  return actual ? `${actual.provider} / ${actual.model}${actual.provider === 'xerosharc' ? ' · внутренняя модель шлюза не подтверждена' : ''}` : 'модель неизвестна';
}

export function CoachingInline({ run, messageId }: { run: AssistantRun | undefined; messageId: string }) {
  const suggestions = run?.coaching?.suggestions.filter((s) => s.message_id === messageId) ?? [];
  if (!run || !suggestions.length) return null;
  return <aside className="coaching-inline" aria-label="Как надо было сказать">
    <p className="coaching-label" lang="ru">✦ {run.mode === 'test' ? 'Тестовая подсказка · не AI-анализ' : 'Подсказка AI'}</p>
    {suggestions.map((s, index) => <div key={index}>
      <blockquote>{s.text}</blockquote>
      <p lang="ru">{s.explanation}</p>
    </div>)}
    <p className="hint" lang="ru">{modelText(run)}. Поля в [скобках] заполните по данным компании. Исходная реплика и оценка сохранены.</p>
  </aside>;
}

export function CoachingPanel({ evaluationId, request, contribution, runs, onShow }: {
  evaluationId: string; request: CoachingRequest; contribution: ScoreContribution | undefined;
  runs: AssistantRun[]; onShow: (ids: string[]) => void;
}) {
  const client = useQueryClient();
  const key = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const mutation = useMutation({
    mutationFn: () => {
      key.current ??= newIdempotencyKey();
      return api.createCoaching(evaluationId, request, key.current);
    },
    onSuccess: async (result) => {
      key.current = null;
      await client.invalidateQueries({ queryKey: ['assistant-runs', evaluationId] });
      if (mounted.current && result.coaching) onShow(result.coaching.suggestions.map((s) => s.message_id));
    },
  });
  const eligible = contribution?.applicability === 'applicable' && contribution.earned_weight != null
    && Number(contribution.original_weight) > 0 && Number(contribution.earned_weight) < Number(contribution.original_weight);
  const latest = runs[0];
  const successful = runs.find((r) => r.coaching);
  if (!eligible && !runs.length) return null;
  const pending = mutation.isPending || runs.some((r) => r.state === 'running');
  return <section className="ai-advice coaching-panel" aria-label="Подсказка оператору">
    <h3>Как надо было сказать</h3>
    <p className="hint">Один или два варианта реплики по этому правилу, на языке клиента. Подсказка AI появится прямо в разговоре. Баллы и решения не меняются.</p>
    {eligible ? <button type="button" disabled={pending} onClick={() => mutation.mutate()}>
      {pending ? 'Готовим формулировку…' : 'Как надо было сказать'}
    </button> : null}
    {successful?.coaching ? <button type="button" className="link" onClick={() => onShow(successful.coaching!.suggestions.map((s) => s.message_id))}>Показать подсказку в разговоре</button> : null}
    {mutation.isError ? <ErrorPanel error={mutation.error} onRetry={() => mutation.mutate()} retryLabel="Проверить тот же запрос" /> : null}
    {latest?.error ? <p className="notice notice-warn" role="status">{latest.error.message}</p> : null}
    {runs.length ? <details className="technical-details"><summary>Журнал подсказок и расходов ({runs.length})</summary>
      {runs.map((r) => <div key={r.id}>
        <p><strong>{r.mode === 'test' ? 'Тестовая подсказка · не AI-анализ' : 'Подсказка AI'}</strong> · {modelText(r)}</p>
        <p className="hint">{tokenText(tokenTotals(r.calls ?? []))} · профиль {r.profile_id} / {r.profile_version} · версия оценки {r.evaluation_revision}</p>
        {r.calls?.length ? <CallTable calls={r.calls} /> : <p>Вызовов модели не было.</p>}
      </div>)}
    </details> : null}
  </section>;
}
