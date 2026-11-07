import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { ChecklistView } from '../components/ChecklistView';
import { Empty, ErrorPanel, Loading } from '../components/States';
import { VersionDiff } from '../components/VersionDiff';
import { serverTime, shortId } from '../lib/format';

export function ChecklistPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const versions = useQuery({
    queryKey: ['checklist-versions', id],
    queryFn: ({ signal }) => api.listChecklistVersions(id, signal),
  });
  if (versions.isPending) return <Loading label="Загрузка версий…" />;
  if (versions.isError) return <ErrorPanel error={versions.error} onRetry={() => versions.refetch()} />;
  const items = versions.data.items;
  if (!items.length) return <Empty title="У чек-листа нет версий" />;
  const latest = items.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
  const selectedId = params.get('version') ?? latest.version_id;
  const selected = items.find((v) => v.version_id === selectedId) ?? latest;
  const compareId = params.get('compare');
  const compare = items.find((v) => v.version_id === compareId && v.version_id !== selected.version_id);

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <div className="page">
      <p className="crumbs">
        <Link to="/checklists">Чек-листы</Link> / {latest.title}
      </p>
      <h1>{latest.title}</h1>
      <div className="layout-split">
        <aside className="side panel">
          <h2>Версии</h2>
          <p className="hint">Версии неизменяемы: старые оценки продолжают использовать свои версии.</p>
          <ol className="version-list">
            {[...items]
              .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
              .map((v) => (
                <li key={v.version_id} data-testid="version-item">
                  <button
                    type="button"
                    className={`link${v.version_id === selected.version_id ? ' active' : ''}`}
                    aria-pressed={v.version_id === selected.version_id}
                    onClick={() => set('version', v.version_id)}
                  >
                    {shortId(v.version_id)}
                  </button>{' '}
                  {v.version_id === latest.version_id ? <strong>последняя</strong> : null}
                  <div className="muted">
                    {serverTime(v.created_at)} · критериев {v.criteria.length}
                  </div>
                </li>
              ))}
          </ol>
          <div className="row">
            <Link
              className="button primary"
              to={`/conversations?checklist=${encodeURIComponent(id)}&version=${encodeURIComponent(selected.version_id)}`}
            >
              Запустить оценку с этой версией
            </Link>
            <Link className="button" to={`/checklists/${encodeURIComponent(id)}/edit?from=${encodeURIComponent(selected.version_id)}`}>
              Редактировать (новая версия)
            </Link>
          </div>
          {items.length > 1 ? (
            <>
              <label htmlFor="compare-with">Сравнить выбранную версию с</label>
              <select id="compare-with" value={compareId ?? ''} onChange={(e) => set('compare', e.target.value || null)}>
                <option value="">— не сравнивать —</option>
                {items
                  .filter((v) => v.version_id !== selected.version_id)
                  .map((v) => (
                    <option key={v.version_id} value={v.version_id}>
                      {shortId(v.version_id)} · {serverTime(v.created_at)}
                    </option>
                  ))}
              </select>
            </>
          ) : null}
        </aside>
        <section className="grow">
          {compare ? (
            <VersionDiff
              from={compare.created_at <= selected.created_at ? compare : selected}
              to={compare.created_at <= selected.created_at ? selected : compare}
            />
          ) : null}
          <ChecklistView version={selected} />
        </section>
      </div>
    </div>
  );
}

export function ChecklistVersionRedirect() {
  const { versionId = '' } = useParams();
  const version = useQuery({
    queryKey: ['checklist-version', versionId],
    queryFn: ({ signal }) => api.getChecklistVersion(versionId, signal),
    staleTime: Infinity,
  });
  if (version.isPending) return <Loading />;
  if (version.isError) return <ErrorPanel error={version.error} onRetry={() => version.refetch()} />;
  return (
    <div className="page">
      <p className="crumbs">
        <Link to="/checklists">Чек-листы</Link> /{' '}
        <Link to={`/checklists/${encodeURIComponent(version.data.checklist_id)}?version=${encodeURIComponent(versionId)}`}>
          {version.data.title}
        </Link>
      </p>
      <ChecklistView version={version.data} />
    </div>
  );
}
