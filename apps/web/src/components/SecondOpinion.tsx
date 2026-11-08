import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, newIdempotencyKey } from '../api/client';
import type { Appeal, Criterion, Message } from '../api/types';
import { serverTime } from '../lib/format';
import { tokenText, tokenTotals } from '../lib/runSummary';
import { answerText, EvidenceList } from './CriterionDetail';
import { CallTable } from './RunDetails';
import { ErrorPanel } from './States';

export function SecondOpinionPanel({ appeal, criterion, messages, onShow }: {
  appeal: Appeal; criterion: Criterion; messages: Message[]; onShow: (ids: string[]) => void;
}) {
  const client = useQueryClient();
  const key = useRef<string | null>(null);
  const [openSource, setOpenSource] = useState<string | null>(null);
  const queryKey = ['second-opinions', appeal.id];
  const history = useQuery({
    queryKey, queryFn: ({ signal }) => api.listSecondOpinions(appeal.id, signal), retry: 0,
    refetchInterval: (query) => query.state.data?.items.some((item) => item.state === 'running') ? 1500 : false,
  });
  const mutation = useMutation({
    mutationFn: () => {
      key.current ??= newIdempotencyKey();
      return api.createSecondOpinion(appeal.id, key.current);
    },
    onSuccess: async () => {
      key.current = null;
      await client.invalidateQueries({ queryKey });
    },
  });
  const running = mutation.isPending || history.data?.items.some((item) => item.state === 'running');
  return <section className="ai-advice" aria-label="Второе мнение AI">
    <h3>Второе мнение</h3>
    <p className="hint">Подсказка AI по одному критерию, профилем этой оценки. Исходный ответ AI не передаётся. Комментарий апелляции учитывается как утверждение для проверки. Ответы, баллы и решение человека не меняются.</p>
    {appeal.state === 'open' ? <button type="button" disabled={Boolean(running)} onClick={() => mutation.mutate()}>
      {running ? 'Получаем подсказку…' : (history.data?.items.length ? 'Запросить ещё одно мнение' : 'Получить второе мнение')}
    </button> : null}
    {mutation.isError ? <ErrorPanel error={mutation.error} onRetry={() => mutation.mutate()} retryLabel="Проверить тот же запрос" /> : null}
    {history.isError ? <p className="hint" role="status">Журнал подсказок недоступен. Рассмотрение апелляции можно продолжить.</p> : null}
    {history.data?.items.map((item) => {
      const calls = item.calls ?? [];
      const actual = calls.at(-1)?.actual;
      const requested = calls.at(-1)?.requested;
      return <article className="ai-advice-result" key={item.id}>
        <p><strong>{item.mode === 'test' ? 'Тестовая подсказка · не AI-анализ' : 'Подсказка AI'}</strong> · {serverTime(item.created_at)}</p>
        <p className="hint">Модель по API: {actual ? `${actual.provider} / ${actual.model}` : 'неизвестна'}
          {actual?.provider === 'xerosharc' ? ' · внутренняя модель шлюза не подтверждена' : ''}
          {requested ? ` · запрошена ${requested.model}` : ''}</p>
        {item.state === 'running' ? <p role="status">Подсказка выполняется. Журнал сохранится после завершения.</p> : null}
        {item.error ? <p className="notice notice-warn" role="status">Подсказка недоступна: {item.error.message}</p> : null}
        {item.proposal ? <>
          <p><strong>Предлагаемый ответ: {answerText(criterion, item.proposal)}</strong></p>
          <p className="rationale">{item.proposal.rationale}</p>
          <EvidenceList evidence={item.proposal.evidence} messages={messages} fragments={item.source_fragments ?? []}
            onShow={onShow} openSource={openSource} onToggleSource={(id) => setOpenSource((current) => current === id ? null : id)} />
        </> : null}
        <p className="hint">Вызовов: {calls.length} · {tokenText(tokenTotals(calls))}. Расходы этой подсказки учитываются отдельно от исходной оценки.</p>
        <details className="technical-details"><summary>Журнал вызовов и расходов подсказки</summary>
          <p>Профиль: {item.profile_id} / {item.profile_version}</p>
          {calls.length ? <CallTable calls={calls} /> : <p>Вызовов модели не было.</p>}
        </details>
      </article>;
    })}
  </section>;
}
