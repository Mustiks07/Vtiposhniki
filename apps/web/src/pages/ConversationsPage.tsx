import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { BatchLauncher } from '../components/BatchLauncher';
import { FlagCell, FlagFilters, SearchScope, flagCriteria, useSelectedVersion } from '../components/FlagSearch';
import { ImportPanel } from '../components/ImportPanel';
import { Badge, Empty, ErrorPanel, Loading } from '../components/States';
import { FILTER_KEYS, PAGE_SIZE, parseConversationQuery, withFilter } from '../lib/conversationQuery';
import { channelLabel, evaluationListStatusLabel, languageLabel } from '../lib/labels';
import { totalRu } from '../lib/format';
import { conversationTitle } from '../lib/presentation';

const reviewLabels = {
  incomplete: 'Неполная оценка',
  conflict: 'Спорный вывод',
  open_appeal: 'Открытая апелляция',
  evaluation_failed: 'Ошибка оценки',
};

export function ConversationsPage() {
  const [params, setParams] = useSearchParams();
  const parsed = parseConversationQuery(params);
  const { query, offset } = parsed;
  const language = query.language ?? null;
  const channel = query.channel ?? null;
  const status = query.status ?? null;
  const [selected, setSelected] = useState<string[]>([]);
  const ids = { lang: useId(), chan: useId(), status: useId() };
  const version = useSelectedVersion(parsed.versionId);
  const flagTitle = new Map(flagCriteria(version.data).map((c) => [c.id, c.title]));

  // Filtering, counting and paging happen on the server (API 1.4.0), never on this page.
  const list = useQuery({
    queryKey: ['conversations', query],
    queryFn: ({ signal }) => api.listConversations(query, signal),
    // A new scope/filter/page must not display the previous query's rows or total.
  });

  function setFilter(key: (typeof FILTER_KEYS)[number], value: string | null, extra?: Record<string, string>) {
    let next = withFilter(params, key, value);
    if (key === 'flag_scope') next = withFilter(next, 'result_scope', value);
    if (key === 'result_scope' && parsed.flagCriterionId) next = withFilter(next, 'flag_scope', value);
    if (key === 'flag_criterion_id' && value)
      next = withFilter(next, 'flag_scope', query.result_scope ?? 'automatic');
    for (const [k, v] of Object.entries(extra ?? {}))
      next = new URLSearchParams(withFilter(next, k as (typeof FILTER_KEYS)[number], v));
    setParams(next);
  }
  function setOffset(value: number) {
    const next = new URLSearchParams(params);
    if (value > 0) next.set('offset', String(value));
    else next.delete('offset');
    setParams(next);
  }
  const hasFilters = Boolean(
    language || channel || status || parsed.versionId || query.q || query.work_queue || query.max_score != null,
  );
  function quickFilter(queue: 'flagged' | 'needs_review' | 'open_appeals' | 'unevaluated' | null) {
    let next = withFilter(params, 'work_queue', queue === 'unevaluated' ? null : queue);
    next = withFilter(next, 'status', queue === 'unevaluated' ? 'unevaluated' : null);
    setParams(next);
  }
  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const items = list.data?.items ?? [];
  const pageIds = items.map((i) => i.conversation.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  return (
    <div className="page conversations-page">
      <header className="page-heading">
        <div>
          <h1>Диалоги</h1>
          <p className="page-intro">Каждая оценка — с доказательством.</p>
        </div>
        <div className="page-actions">
          <ImportPanel />
          <BatchLauncher
            conversationIds={selected}
            initialChecklistId={params.get('launch_checklist')}
            initialVersionId={params.get('launch_version')}
          />
        </div>
      </header>
      <div className="layout-split">
        <section aria-labelledby="list-title" className="grow">
          <h2 id="list-title" className="visually-hidden">
            Список разговоров
          </h2>
          <div className="filter-panel">
            <div className="worklist-toolbar">
              <form
                className="worklist-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = new FormData(event.currentTarget).get('q');
                  setFilter('q', typeof value === 'string' ? value.trim() || null : null);
                }}
              >
                <label className="visually-hidden" htmlFor={`${ids.lang}-search`}>
                  Поиск по ID или тексту
                </label>
                <input
                  id={`${ids.lang}-search`}
                  key={query.q ?? ''}
                  name="q"
                  type="search"
                  maxLength={200}
                  defaultValue={query.q ?? ''}
                  placeholder="Поиск по тексту или номеру диалога"
                />
                <button type="submit">Найти</button>
                {query.q ? (
                  <button type="button" className="link" onClick={() => setFilter('q', null)}>
                    Сбросить
                  </button>
                ) : null}
              </form>
              <label className="worklist-select">
                Порядок
                <select value={query.sort ?? 'newest'} onChange={(e) => setFilter('sort', e.target.value)}>
                  <option value="newest">Сначала новые</option>
                  <option value="score_asc">Сначала низкий балл</option>
                  <option value="score_desc">Сначала высокий балл</option>
                </select>
              </label>
              <label className="worklist-select">
                Оценка в списке
                <select
                  value={query.result_scope ?? parsed.flagScope}
                  onChange={(e) => setFilter('result_scope', e.target.value)}
                >
                  <option value="automatic">Исходная AI-оценка</option>
                  <option value="effective">С учётом пересмотра</option>
                </select>
              </label>
            </div>
            <div className="quick-filters" role="group" aria-label="Быстрый отбор">
              <button type="button" aria-pressed={!query.work_queue && !status} onClick={() => quickFilter(null)}>
                Все диалоги
              </button>
              <button
                type="button"
                aria-pressed={query.work_queue === 'flagged'}
                onClick={() => quickFilter('flagged')}
              >
                Есть нарушения
              </button>
              <button
                type="button"
                aria-pressed={query.work_queue === 'needs_review'}
                onClick={() => quickFilter('needs_review')}
              >
                Нужна проверка
              </button>
              <button type="button" aria-pressed={status === 'unevaluated'} onClick={() => quickFilter('unevaluated')}>
                Без оценки
              </button>
              <button
                type="button"
                aria-pressed={query.work_queue === 'open_appeals'}
                onClick={() => quickFilter('open_appeals')}
              >
                Открытые апелляции
              </button>
            </div>
            <div className="filters" role="group" aria-label="Фильтры">
              <div>
                <label htmlFor={ids.lang}>Язык</label>
                <select
                  id={ids.lang}
                  value={language ?? ''}
                  onChange={(e) => setFilter('language', e.target.value || null)}
                >
                  <option value="">Все</option>
                  {Object.entries(languageLabel).map(([v, l]) => (
                    <option key={v} value={v}>{`${v} · ${l}`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={ids.chan}>Канал</label>
                <select
                  id={ids.chan}
                  value={channel ?? ''}
                  onChange={(e) => setFilter('channel', e.target.value || null)}
                >
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
                <select
                  id={ids.status}
                  value={status ?? ''}
                  onChange={(e) => setFilter('status', e.target.value || null)}
                >
                  <option value="">Все</option>
                  {Object.entries(evaluationListStatusLabel).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${ids.status}-max`}>Баллы не выше</label>
                <input
                  id={`${ids.status}-max`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={params.get('max_score') ?? ''}
                  placeholder="Любые"
                  onChange={(e) => setFilter('max_score', e.target.value || null)}
                />
              </div>
            </div>
            <FlagFilters parsed={parsed} onChange={setFilter} />
          </div>
          <SearchScope parsed={parsed} total={list.isError ? undefined : list.data?.total} />
          {selected.length ? (
            <div className="bulk-bar" role="status">
              <span>
                Выбрано: <strong data-testid="selection-count">{selected.length}</strong>
              </span>
              <button type="button" className="link" onClick={() => setSelected([])}>
                Снять выделение
              </button>
            </div>
          ) : null}

          {list.isPending ? <Loading /> : null}
          {list.isError ? <ErrorPanel error={list.error} onRetry={() => list.refetch()} /> : null}
          {list.data && !list.isError && items.length === 0 ? (
            <Empty title={hasFilters ? 'Нет разговоров по выбранным условиям' : 'Разговоров пока нет'}>
              {hasFilters ? 'Измените условия поиска.' : 'Импортируйте разговоры через JSON или API организаторов.'}
            </Empty>
          ) : null}
          {items.length > 0 && !list.isError ? (
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
                    <th scope="col">Балл / 100</th>
                    <th scope="col">{parsed.flagCriterionId ? 'Флаг' : 'Нарушения'}</th>
                    <th scope="col">Статус</th>
                    <th scope="col">Проверка</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((summary) => {
                    const c = summary.conversation;
                    return (
                      <tr
                        key={c.id}
                        data-testid="conversation-row"
                        className={selected.includes(c.id) ? 'row-selected' : undefined}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Выбрать: ${conversationTitle(c)}`}
                            checked={selected.includes(c.id)}
                            onChange={() => toggle(c.id)}
                          />
                        </td>
                        <td className="cell-main">
                          <Link className="conversation-title" title={conversationTitle(c)} to={`/conversations/${encodeURIComponent(c.id)}`}>{conversationTitle(c)}</Link>
                          <div
                            className="muted clamp"
                            lang={c.language.toLowerCase() === 'kz' ? 'kk' : c.language.toLowerCase()}
                          >
                            {c.messages.length} реплик · версия текста {c.revision}
                            {query.q === c.external_id ? ` · номер источника ${c.external_id}` : ''}
                          </div>
                        </td>
                        <td>
                          {channelLabel[c.channel]} · {c.language}
                        </td>
                        <td className="score-cell">
                          <strong data-testid="row-score">{totalRu(summary.total_score)}</strong>
                          <small className="muted">
                            {summary.checklist_version_id ? (query.result_scope === 'effective' ? 'После пересмотра' : 'Оценка AI') : 'Нет запуска'}
                          </small>
                        </td>
                        <td>
                          {parsed.flagCriterionId && summary.flag_summary ? (
                            <FlagCell
                              summary={summary.flag_summary}
                              evaluationId={summary.latest_evaluation_id}
                              title={
                                flagTitle.get(summary.flag_summary.result.criterion_id) ??
                                'Нарушение'
                              }
                            />
                          ) : (
                            <Badge
                              status={
                                summary.detected_flag === true
                                  ? 'failed'
                                  : summary.detected_flag === false
                                    ? 'complete'
                                    : 'unevaluated'
                              }
                            >
                              {summary.detected_flag === true
                                ? 'Обнаружены'
                                : summary.detected_flag === false
                                  ? 'Не обнаружены'
                                  : 'Неизвестно'}
                            </Badge>
                          )}
                        </td>
                        <td>
                          <Badge status={summary.evaluation_status}>
                            {evaluationListStatusLabel[summary.evaluation_status]}
                          </Badge>
                          {summary.latest_evaluation_id ? (
                            <>
                              {' '}
                              <Link to={`/evaluations/${encodeURIComponent(summary.latest_evaluation_id)}`}>
                                Открыть оценку
                              </Link>
                            </>
                          ) : null}
                        </td>
                        <td className="review-cell">
                          {(summary.review_reasons ?? []).map((reason) => (
                            <small key={reason} className="review-reason">
                              {reviewLabels[reason]}
                            </small>
                          ))}
                          {summary.open_appeals && summary.latest_evaluation_id ? (
                            <Link to={`/appeals?evaluation_id=${encodeURIComponent(summary.latest_evaluation_id)}`}>
                              Апелляций: {summary.open_appeals}
                            </Link>
                          ) : null}
                          {!summary.review_reasons?.length ? <span className="muted">—</span> : null}
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
              <span data-testid="pager-range">
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
      </div>
    </div>
  );
}
