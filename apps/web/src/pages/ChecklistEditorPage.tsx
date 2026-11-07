import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistVersion } from '../api/types';
import { ChecklistEditor } from '../components/ChecklistEditor';
import { ErrorPanel, Loading } from '../components/States';
import { VersionDiff } from '../components/VersionDiff';
import { blankDraft, draftFromVersion } from '../lib/checklistDraft';
import { shortId } from '../lib/format';

function Saved({ version, base }: { version: ChecklistVersion; base: ChecklistVersion | null }) {
  return (
    <div className="page">
      <p className="notice notice-ok" role="status" data-testid="version-saved">
        Сохранена версия <code>{version.version_id}</code>.
      </p>
      <div className="row">
        <Link
          className="button primary"
          to={`/conversations?checklist=${encodeURIComponent(version.checklist_id)}&version=${encodeURIComponent(version.version_id)}`}
        >
          Запустить оценку с этой версией
        </Link>
        <Link className="button" to={`/checklists/${encodeURIComponent(version.checklist_id)}?version=${encodeURIComponent(version.version_id)}`}>
          К версиям чек-листа
        </Link>
      </div>
      {base ? <VersionDiff from={base} to={version} /> : null}
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
  const [pinned, setPinned] = useState<{ from: ChecklistVersion; expected: string; latestTitle: string } | null>(null);
  const fromParam = params.get('from');
  useEffect(() => {
    if (pinned || !versions.data?.items.length) return;
    const items = versions.data.items;
    const latest = items.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
    const from = items.find((v) => v.version_id === fromParam) ?? latest;
    setPinned({ from, expected: latest.version_id, latestTitle: latest.title });
  }, [versions.data, pinned, fromParam]);
  if (!id) {
    if (saved) return <Saved version={saved} base={null} />;
    return (
      <div className="page">
        <p className="crumbs">
          <Link to="/checklists">Чек-листы</Link> / Новый
        </p>
        <h1>Новый чек-лист</h1>
        <ChecklistEditor initial={blankDraft()} base={null} expectedLatestVersionId={null} checklistId={null} onSaved={setSaved} />
      </div>
    );
  }
  if (versions.isError && !pinned) return <ErrorPanel error={versions.error} onRetry={() => versions.refetch()} />;
  if (!pinned) return <Loading />;
  const { from, expected, latestTitle } = pinned;
  if (saved) return <Saved version={saved} base={from} />;
  return (
    <div className="page">
      <p className="crumbs">
        <Link to="/checklists">Чек-листы</Link> / <Link to={`/checklists/${encodeURIComponent(id)}`}>{latestTitle}</Link> / Новая
        версия
      </p>
      <h1>Новая версия чек-листа</h1>
      <p className="muted" data-testid="draft-base">
        Черновик создан из версии <code>{shortId(from.version_id)}</code>
        {from.version_id !== expected ? ` (не последней; сохранение сверяется с ${shortId(expected)})` : ''}.
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
