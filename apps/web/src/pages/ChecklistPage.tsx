import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { ChecklistView, checklistVersionLabel } from '../components/ChecklistView';
import { Empty, ErrorPanel, Loading } from '../components/States';
import { VersionDiff } from '../components/VersionDiff';

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
  const latest = items[0];
  const selectedId = params.get('version') ?? latest.version_id;
  const selected = items.find((v) => v.version_id === selectedId) ?? latest;
  const compareId = params.get('compare');
  const compare = items.find((v) => v.version_id === compareId && v.version_id !== selected.version_id);
  const label = (v: typeof selected) => checklistVersionLabel(v, versions.data);
  // Use the server's creation order even when timestamps coincide.
  const selectedIndex = items.indexOf(selected);
  const compareIndex = compare ? items.indexOf(compare) : -1;
  const before = compare && compareIndex > selectedIndex ? compare : selected;
  const after = compare && compareIndex > selectedIndex ? selected : compare;

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <div className="page checklist-design checklist-version-page">
      <p className="crumbs">
        <Link to="/checklists">Чек-листы</Link> / {selected.title}
      </p>
      <header className="page-heading">
        <div>
          <h1>{selected.title}</h1>
          <p className="page-intro">Правила, на которых основана оценка.</p>
        </div>
        <div className="page-actions">
          <Link
            className="button"
            to={
              '/conversations?launch_checklist=' +
              encodeURIComponent(id) +
              '&launch_version=' +
              encodeURIComponent(selected.version_id)
            }
          >
            Запустить оценку с этой версией
          </Link>
          <Link
            className="button primary"
            to={'/checklists/' + encodeURIComponent(id) + '/edit?from=' + encodeURIComponent(selected.version_id)}
          >
            Создать новую версию
          </Link>
        </div>
      </header>
      <div className="checklist-version-toolbar">
        <div>
          <label htmlFor="checklist-version-select">Версия правил</label>
          <select
            id="checklist-version-select"
            value={selected.version_id}
            onChange={(e) => set('version', e.target.value)}
          >
            {items.map((v) => (
              <option key={v.version_id} value={v.version_id}>
                {label(v)}
                {v.version_id === latest.version_id ? ' · последняя' : ''}
              </option>
            ))}
          </select>
        </div>
        {items.length > 1 ? (
          <div>
            <label htmlFor="compare-with">Сравнить выбранную версию с</label>
            <select
              id="compare-with"
              value={compare?.version_id ?? ''}
              onChange={(e) => set('compare', e.target.value || null)}
            >
              <option value="">Не сравнивать</option>
              {items
                .filter((v) => v.version_id !== selected.version_id)
                .map((v) => (
                  <option key={v.version_id} value={v.version_id}>
                    {label(v)}
                  </option>
                ))}
            </select>
          </div>
        ) : null}
      </div>
      <p className="checklist-history-note">
        <span aria-hidden="true">◇</span> Сохранённая версия неизменяема. Старые оценки продолжают использовать свои
        правила.
      </p>
      {compare && after ? (
        <VersionDiff from={before} to={after} fromLabel={label(before)} toLabel={label(after)} />
      ) : null}
      <ChecklistView version={selected} label={label(selected)} showTitle={false} />
      <details className="checklist-version-history">
        <summary>
          История версий <span>{versions.data.total}</span>
        </summary>
        <ol className="version-list">
          {items.map((v) => (
            <li key={v.version_id} data-testid="version-item">
              <button
                type="button"
                className="link"
                aria-pressed={v.version_id === selected.version_id}
                onClick={() => set('version', v.version_id)}
              >
                {label(v)}
              </button>
              <span>
                {v.title} · Критериев: {v.criteria.length}
                {v.version_id === latest.version_id ? ' · последняя версия' : ''}
              </span>
            </li>
          ))}
        </ol>
        {versions.data.total > items.length ? (
          <p className="hint">
            Показаны последние {items.length} версий из {versions.data.total}.
          </p>
        ) : null}
      </details>
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
    <div className="page checklist-design">
      <p className="crumbs">
        <Link to="/checklists">Чек-листы</Link> /{' '}
        <Link
          to={
            '/checklists/' + encodeURIComponent(version.data.checklist_id) + '?version=' + encodeURIComponent(versionId)
          }
        >
          {version.data.title}
        </Link>
      </p>
      <ChecklistView version={version.data} />
    </div>
  );
}
