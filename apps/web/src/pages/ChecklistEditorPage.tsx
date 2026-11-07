import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
  if (!id) {
    if (saved) return <Saved version={saved} base={null} />;
    return (
      <div className="page">
        <p className="crumbs">
          <Link to="/checklists">Чек-листы</Link> / Новый
        </p>
        <h1>Новый чек-лист</h1>
        <ChecklistEditor initial={blankDraft()} base={null} checklistId={null} onSaved={setSaved} />
      </div>
    );
  }
  if (versions.isPending) return <Loading />;
  if (versions.isError) return <ErrorPanel error={versions.error} onRetry={() => versions.refetch()} />;
  const items = versions.data.items;
  const latest = items.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
  const from = items.find((v) => v.version_id === params.get('from')) ?? latest;
  if (saved) return <Saved version={saved} base={from} />;
  return (
    <div className="page">
      <p className="crumbs">
        <Link to="/checklists">Чек-листы</Link> / <Link to={`/checklists/${encodeURIComponent(id)}`}>{latest.title}</Link> / Новая
        версия
      </p>
      <h1>Новая версия чек-листа</h1>
      <p className="muted">
        Черновик создан из версии <code>{shortId(from.version_id)}</code>
        {from.version_id !== latest.version_id ? ' (не последней: сохранение будет сверено с последней версией)' : ''}.
      </p>
      {/* expected_latest_version_id is always the latest known version; the server rejects stale drafts. */}
      <ChecklistEditor initial={draftFromVersion(from)} base={{ ...from, version_id: latest.version_id }} checklistId={id} onSaved={setSaved} />
    </div>
  );
}
