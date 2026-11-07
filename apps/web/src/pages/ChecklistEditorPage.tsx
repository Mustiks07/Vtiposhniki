import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistVersion } from '../api/types';
import { ChecklistEditor } from '../components/ChecklistEditor';
import { checklistVersionLabel } from '../components/ChecklistView';
import { ErrorPanel, Loading } from '../components/States';
import { VersionDiff } from '../components/VersionDiff';
import { blankDraft, draftFromVersion } from '../lib/checklistDraft';

function Saved({ version, base }: { version: ChecklistVersion; base: ChecklistVersion | null }) {
  const history = useQuery({
    queryKey: ['checklist-versions', version.checklist_id],
    queryFn: ({ signal }) => api.listChecklistVersions(version.checklist_id, signal),
  });
  return (
    <div className="page checklist-design checklist-saved-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ПРАВИЛА СОХРАНЕНЫ</p>
          <h1>{version.title}</h1>
        </div>
      </header>
      <p className="notice notice-ok" role="status" data-testid="version-saved">
        {checklistVersionLabel(version, history.data)}. Можно запускать оценку.
      </p>
      <div className="row">
        <Link
          className="button primary"
          to={`/conversations?launch_checklist=${encodeURIComponent(version.checklist_id)}&launch_version=${encodeURIComponent(version.version_id)}`}
        >
          Запустить оценку с этой версией
        </Link>
        <Link
          className="button"
          to={`/checklists/${encodeURIComponent(version.checklist_id)}?version=${encodeURIComponent(version.version_id)}`}
        >
          К версиям чек-листа
        </Link>
      </div>
      {base ? (
        <VersionDiff
          from={base}
          to={version}
          fromLabel={checklistVersionLabel(base, history.data)}
          toLabel={checklistVersionLabel(version, history.data)}
        />
      ) : null}
      <details className="checklist-technical">
        <summary>Технические сведения</summary>
        <p>
          ID сохранённой версии: <code>{version.version_id}</code>
        </p>
      </details>
    </div>
  );
}

/** /checklists/new — a new checklist; /checklists/:id/edit?from=<version> — a new version. */
export function ChecklistEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [saved, setSaved] = useState<ChecklistVersion | null>(null);
  const versions = useQuery({
    queryKey: ['checklist-versions', id],
    queryFn: ({ signal }) => api.listChecklistVersions(id!, signal),
    enabled: Boolean(id),
  });
  // Pinned once, when the draft is created. Later refetches of the version list (another
  // author saving v2, cache invalidation) must not silently move the draft onto v2.
  const [pinned, setPinned] = useState<{
    from: ChecklistVersion;
    expected: string;
    latestTitle: string;
    fromLabel: string;
  } | null>(null);
  const fromParam = params.get('from');
  useEffect(() => {
    if (pinned || !versions.data?.items.length) return;
    const items = versions.data.items;
    const latest = items[0];
    const from = items.find((v) => v.version_id === fromParam) ?? latest;
    setPinned({
      from,
      expected: latest.version_id,
      latestTitle: latest.title,
      fromLabel: checklistVersionLabel(from, versions.data),
    });
  }, [versions.data, pinned, fromParam]);
  if (!id) {
    if (saved) return <Saved version={saved} base={null} />;
    return (
      <div className="page checklist-design checklist-editor-page">
        <p className="crumbs">
          <Link to="/checklists">Чек-листы</Link> / Новый
        </p>
        <h1>Новый чек-лист</h1>
        <p className="page-intro">Ваши критерии. Понятные правила оценки.</p>
        <ChecklistEditor
          initial={blankDraft()}
          base={null}
          expectedLatestVersionId={null}
          checklistId={null}
          onSaved={setSaved}
        />
      </div>
    );
  }
  if (versions.isError && !pinned) return <ErrorPanel error={versions.error} onRetry={() => versions.refetch()} />;
  if (!pinned) return <Loading />;
  const { from, expected, latestTitle, fromLabel } = pinned;
  if (saved) return <Saved version={saved} base={from} />;
  return (
    <div className="page checklist-design checklist-editor-page">
      <p className="crumbs">
        <Link to="/checklists">Чек-листы</Link> /{' '}
        <Link to={`/checklists/${encodeURIComponent(id)}`}>{latestTitle}</Link> / Новая версия
      </p>
      <h1>Новая версия чек-листа</h1>
      <p className="muted" data-testid="draft-base">
        Черновик на основе: {fromLabel}.
        {from.version_id !== expected
          ? ' Выбрана не последняя версия; перед сохранением будут проверены изменения.'
          : ''}
      </p>
      <ChecklistEditor
        key={`${from.version_id}:${expected}`}
        initial={draftFromVersion(from)}
        base={from}
        expectedLatestVersionId={expected}
        checklistId={id}
        onSaved={setSaved}
      />
    </div>
  );
}
