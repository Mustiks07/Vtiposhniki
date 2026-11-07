import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { ConversationSummary } from '../api/types';
import { BatchLauncher } from '../components/BatchLauncher';
import { ImportPanel } from '../components/ImportPanel';
import { Badge, Empty, ErrorPanel, Loading } from '../components/States';
import { channelLabel, evaluationListStatusLabel, languageLabel } from '../lib/labels';

const PAGE_SIZE = 25;

function preview(summary: ConversationSummary): string {
  const first = summary.conversation.messages.find((m) => m.text.trim()) ?? summary.conversation.messages[0];
  return first ? first.text : '';
}

export function ConversationsPage() {
  const [params, setParams] = useSearchParams();
  const language = params.get('language');
  const channel = params.get('channel');
  const status = params.get('status');
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const [selected, setSelected] = useState<string[]>([]);
  const ids = { lang: useId(), chan: useId(), status: useId() };

  const list = useQuery({
    queryKey: ['conversations', { language, channel, status, offset }],
    queryFn: ({ signal }) => api.listConversations({ language, channel, status, offset, limit: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('offset');
    setParams(next);
  }
  function setOffset(value: number) {
    const next = new URLSearchParams(params);
    if (value > 0) next.set('offset', String(value));
    else next.delete('offset');
    setParams(next);
  }
  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const items = list.data?.items ?? [];
  const pageIds = items.map((i) => i.conversation.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  return (
    <div className="page">
      <h1>Диалоги</h1>
      <div className="layout-split">
        <section aria-labelledby="list-title" className="grow">
          <h2 id="list-title" className="visually-hidden">
            Список разговоров
          </h2>
          <div className="filters" role="group" aria-label="Фильтры">
            <div>
              <label htmlFor={ids.lang}>Язык</label>
              <select id={ids.lang} value={language ?? ''} onChange={(e) => setFilter('language', e.target.value)}>
                <option value="">Все</option>
                {Object.entries(languageLabel).map(([v, l]) => (
                  <option key={v} value={v}>{`${v} · ${l}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.chan}>Канал</label>
              <select id={ids.chan} value={channel ?? ''} onChange={(e) => setFilter('channel', e.target.value)}>
                <option value="">Все</option>
                {Object.entries(channelLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.status}>Статус оценки</label>
              <select id={ids.status} value={status ?? ''} onChange={(e) => setFilter('status', e.target.value)}>
                <option value="">Все</option>
                {Object.entries(evaluationListStatusLabel).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {list.isPending ? <Loading /> : null}
          {list.isError ? <ErrorPanel error={list.error} onRetry={() => list.refetch()} /> : null}
          {list.data && items.length === 0 ? (
            <Empty title={language || channel || status ? 'Нет разговоров по выбранным фильтрам' : 'Разговоров пока нет'}>
              {language || channel || status ? 'Сбросьте фильтры.' : 'Импортируйте разговоры через JSON или API организаторов.'}
            </Empty>
          ) : null}
          {items.length > 0 ? (
            <div className="table-wrap" tabIndex={0} aria-label="Таблица разговоров, прокручивается горизонтально">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label="Выбрать все на странице"
                        checked={allOnPage}
                        onChange={() =>
                          setSelected((s) =>
                            allOnPage ? s.filter((id) => !pageIds.includes(id)) : [...new Set([...s, ...pageIds])],
                          )
                        }
                      />
                    </th>
                    <th scope="col">Разговор</th>
                    <th scope="col">Канал / язык</th>
                    <th scope="col">Revision</th>
                    <th scope="col">Реплик</th>
                    <th scope="col">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((summary) => {
                    const c = summary.conversation;
                    return (
                      <tr key={c.id} data-testid="conversation-row">
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Выбрать ${c.external_id}`}
                            checked={selected.includes(c.id)}
                            onChange={() => toggle(c.id)}
                          />
                        </td>
                        <td className="cell-main">
                          <Link to={`/conversations/${encodeURIComponent(c.id)}`}>{c.external_id}</Link>
                          <div className="muted clamp" lang={c.language.toLowerCase() === 'kz' ? 'kk' : c.language.toLowerCase()}>
                            {preview(summary)}
                          </div>
                        </td>
                        <td>
                          {channelLabel[c.channel]} · {c.language}
                        </td>
                        <td>{c.revision}</td>
                        <td>{c.messages.length}</td>
                        <td>
                          <Badge status={summary.evaluation_status}>{evaluationListStatusLabel[summary.evaluation_status]}</Badge>
                          {summary.latest_evaluation_id ? (
                            <>
                              {' '}
                              <Link to={`/evaluations/${encodeURIComponent(summary.latest_evaluation_id)}`}>карточка</Link>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {list.data && list.data.total > PAGE_SIZE ? (
            <nav className="pager" aria-label="Страницы">
              <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                ← Назад
              </button>
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, list.data.total)} из {list.data.total}
              </span>
              <button
                type="button"
                disabled={offset + PAGE_SIZE >= list.data.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Вперёд →
              </button>
            </nav>
          ) : list.data ? (
            <p className="muted">Всего: {list.data.total}</p>
          ) : null}
        </section>
        <aside className="side">
          <BatchLauncher
            conversationIds={selected}
            initialChecklistId={params.get('checklist')}
            initialVersionId={params.get('version')}
          />
          <ImportPanel />
        </aside>
      </div>
    </div>
  );
}
