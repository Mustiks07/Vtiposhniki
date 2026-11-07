import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistDraft, ChecklistSummary } from '../api/types';
import { Empty, ErrorPanel, Loading } from '../components/States';
import { serverTime } from '../lib/format';
import { checklistVersionLabel } from '../components/ChecklistView';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';

function CreateFromJson() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const mutation = useMutation({
    mutationFn: api.createChecklist,
    onSuccess: async (version) => {
      await queryClient.invalidateQueries({ queryKey: ['checklists'] });
      navigate(`/checklists/${encodeURIComponent(version.checklist_id)}`);
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (mutation.isPending) return;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      setError('Некорректный JSON.');
      return;
    }
    if (typeof value !== 'object' || value === null || !Array.isArray((value as { criteria?: unknown }).criteria)) {
      setError('Ожидается объект ChecklistDraft с массивом criteria.');
      return;
    }
    setError(null);
    // Server-assigned fields of a published version are not part of a draft.
    const {
      checklist_id: _c,
      version_id: _v,
      semantic_hash: _s,
      scoring_config_hash: _h,
      created_at: _t,
      ...draft
    } = value as Record<string, unknown>;
    mutation.mutate({ ...(draft as ChecklistDraft), schema_version: '1.0' });
  }
  async function loadFile(file: File | undefined) {
    if (file) setText(await file.text());
  }
  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={`${id}-f`}>Файл ChecklistDraft (JSON)</label>
      <input
        id={`${id}-f`}
        type="file"
        accept="application/json,.json"
        onChange={(e) => loadFile(e.target.files?.[0])}
      />
      <label htmlFor={id}>Или вставьте JSON</label>
      <textarea id={id} rows={5} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Создание…' : 'Создать чек-лист из JSON'}
        </button>
      </div>
      {mutation.isError ? <ErrorPanel error={mutation.error} /> : null}
    </form>
  );
}

function ChecklistCard({ checklist, index }: { checklist: ChecklistSummary; index: number }) {
  const versions = useQuery({
    queryKey: ['checklist-versions', checklist.checklist_id],
    queryFn: ({ signal }) => api.listChecklistVersions(checklist.checklist_id, signal),
    staleTime: 60_000,
  });
  const latest = versions.data?.items.find((v) => v.version_id === checklist.latest_version_id);
  return (
    <li className="checklist-library-card" data-testid="checklist-item">
      <span className="checklist-library-number" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="checklist-library-content">
        <h2>
          <Link to={`/checklists/${encodeURIComponent(checklist.checklist_id)}`}>{checklist.title}</Link>
        </h2>
        <p className="muted">
          {latest ? checklistVersionLabel(latest, versions.data) : `Создан ${serverTime(checklist.created_at)}`}
        </p>
        {latest ? (
          <>
            <p className="checklist-library-counts">
              Критериев: {latest.criteria.length} · Разделов: {(latest.sections ?? []).length}
            </p>
            {(latest.sections ?? []).length ? (
              <div className="checklist-section-tags">
                {latest.sections?.map((s) => (
                  <span key={s.id}>{s.title}</span>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
        {versions.isError ? (
          <p className="hint">
            Сведения о версии не загрузились.{' '}
            <button type="button" className="link" onClick={() => versions.refetch()}>
              Повторить
            </button>
          </p>
        ) : null}
        <details className="checklist-technical">
          <summary>Технические сведения</summary>
          <dl className="meta">
            <dt>ID чек-листа</dt>
            <dd>
              <code>{checklist.checklist_id}</code>
            </dd>
            <dt>ID последней версии</dt>
            <dd>
              <code>{checklist.latest_version_id}</code>
            </dd>
          </dl>
        </details>
      </div>
      <Link
        className="button checklist-open"
        to={`/checklists/${encodeURIComponent(checklist.checklist_id)}`}
        aria-label={`Открыть чек-лист «${checklist.title}»`}
      >
        Открыть <span aria-hidden="true">→</span>
      </Link>
    </li>
  );
}

export function ChecklistsPage() {
  const [importOpen, setImportOpen] = useState(false);
  const list = useQuery({
    queryKey: ['checklists'],
    queryFn: ({ signal }) => api.listChecklists(signal),
  });
  return (
    <div className="page checklists-page checklist-design">
      <header className="page-heading">
        <div>
          <p className="eyebrow">ПРАВИЛА ОЦЕНКИ</p>
          <h1>Чек-листы</h1>
          <p className="page-intro">Правила меняются. История сохраняется.</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={() => setImportOpen(true)}>
            <Icon name="upload" />
            Загрузить из JSON
          </button>
          <Link className="button primary" to="/checklists/new">
            <span aria-hidden="true">＋</span> Новый чек-лист
          </Link>
        </div>
      </header>
      <div className="checklist-library">
        <section aria-label="Список чек-листов">
          {list.isPending ? <Loading /> : null}
          {list.isError ? <ErrorPanel error={list.error} onRetry={() => list.refetch()} /> : null}
          {list.data && list.data.items.length === 0 ? (
            <Empty title="Чек-листов пока нет">Создайте чек-лист в редакторе или загрузите JSON.</Empty>
          ) : null}
          <ul className="checklist-library-list">
            {list.data?.items.map((c, i) => (
              <ChecklistCard key={c.checklist_id} checklist={c} index={i} />
            ))}
          </ul>
        </section>
        <Modal open={importOpen} title="Загрузить чек-лист из JSON" onClose={() => setImportOpen(false)}>
          <CreateFromJson />
        </Modal>
      </div>
      <p className="checklist-history-note">
        <span aria-hidden="true">ⓘ</span> Каждая сохранённая версия неизменяема. Новые правила не переписывают старые
        оценки.
      </p>
    </div>
  );
}
