import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { api, newIdempotencyKey } from '../api/client';
import type { ConversationQuestionRequest, EvaluationView, Message } from '../api/types';
import { scopeLabel } from '../lib/presentation';
import { serverTime } from '../lib/format';
import { tokenText, tokenTotals } from '../lib/runSummary';
import { CallTable } from './RunDetails';
import { ErrorPanel } from './States';

export function ConversationAssistant({ evaluation, scope, messages, onShow }: {
  evaluation: EvaluationView; scope: 'automatic' | 'effective'; messages: Message[]; onShow: (ids: string[]) => void;
}) {
  const uid = useId();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const key = useRef<{ signature: string; value: string } | null>(null);
  const queryKey = ['conversation-questions', evaluation.id];
  const history = useQuery({ queryKey, queryFn: ({ signal }) => api.listConversationQuestions(evaluation.id, signal), enabled: open, retry: 0,
    refetchInterval: (q) => q.state.data?.items.some((r) => r.state === 'running') ? 1500 : false });
  const mutation = useMutation({
    mutationFn: () => {
      const body: ConversationQuestionRequest = { schema_version: '1.0', question: question.trim(), scope, expected_revision: evaluation.revision };
      const signature = JSON.stringify(body);
      if (key.current?.signature !== signature) key.current = { signature, value: newIdempotencyKey() };
      return api.askConversation(evaluation.id, body, key.current.value);
    },
    onSuccess: async () => { key.current = null; await client.invalidateQueries({ queryKey }); },
  });
  const pending = mutation.isPending || history.data?.items.some((r) => r.state === 'running');
  const byId = new Map(messages.map((m) => [m.id, m]));
  return <details className="ai-advice conversation-assistant" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary>✦ Спросить AI про этот разговор</summary>
    <p className="hint">Подсказка AI только по транскрипту и сохранённой оценке. Вопросы не по теме — вне её возможностей. Ответы, баллы и решения людей не меняются.</p>
    <p className="hint">Контекст вопроса: {scopeLabel(scope)} · версия оценки {evaluation.revision}. Модель — из профиля этой оценки.</p>
    <label htmlFor={`${uid}-question`}>Вопрос о разговоре или оценке</label>
    <textarea id={`${uid}-question`} rows={3} maxLength={2000} value={question} disabled={Boolean(pending)} onChange={(e) => setQuestion(e.target.value)}
      placeholder="Например: какие реплики объясняют ответ по завершению разговора?" />
    <button type="button" disabled={Boolean(pending) || !question.trim()} onClick={() => mutation.mutate()}>{pending ? 'Ищем ответ в разговоре…' : 'Спросить AI'}</button>
    {mutation.isError ? <ErrorPanel error={mutation.error} onRetry={() => mutation.mutate()} retryLabel="Проверить тот же запрос" /> : null}
    {history.isError ? <p className="hint" role="status">История подсказок недоступна. Оценка и апелляции работают как обычно.</p> : null}
    <section aria-label="Ответы AI на вопросы">
      {history.data?.items.map((r) => {
        const calls = r.calls ?? [];
        const actual = calls.at(-1)?.actual;
        const current = r.evaluation_revision === evaluation.revision && r.scope === scope;
        return <article key={r.id} className="ai-advice-result" data-testid="conversation-answer">
          <p className="assistant-question"><strong>{r.question}</strong></p>
          <p className="hint">{scopeLabel(r.scope)} · версия оценки {r.evaluation_revision} · {serverTime(r.created_at)}{current ? '' : ' · другое сохранённое состояние'}</p>
          <p><strong>{r.mode === 'test' ? 'Тестовая подсказка · не AI-анализ' : 'Подсказка AI'}</strong></p>
          <p className="hint">Модель по API: {actual ? `${actual.provider} / ${actual.model}` : 'неизвестна'}{actual?.provider === 'xerosharc' ? ' · внутренняя модель шлюза не подтверждена' : ''}</p>
          {r.state === 'running' ? <p role="status">Ответ ещё выполняется.</p> : null}
          {r.error ? <p className="notice notice-warn" role="status">{r.error.message}</p> : null}
          {r.answer ? <>
            {r.answer.status !== 'answered' ? <p className="hint">{r.answer.status === 'off_topic' ? 'Вопрос не относится к разговору' : 'Недостаточно данных в сохранённом контексте'}</p> : null}
            <p className="rationale">{r.answer.text}</p>
            <div className="row assistant-evidence">{r.answer.message_ids.map((id) => <button type="button" className="link" key={id} onClick={() => onShow([id])}>
              Реплика {byId.get(id)?.ordinal ?? 'недоступна'}
            </button>)}</div>
          </> : null}
          <details className="technical-details"><summary>Вызовы и расход подсказки</summary>
            <p>{tokenText(tokenTotals(calls))} · профиль {r.profile_id} / {r.profile_version}</p>
            {calls.length ? <CallTable calls={calls} /> : <p>Вызовов модели не было.</p>}
          </details>
        </article>;
      })}
    </section>
    {history.data?.total ? <p className="hint">В журнале {history.data.total} запросов. Показаны последние {history.data.items.length}.</p> : null}
  </details>;
}
