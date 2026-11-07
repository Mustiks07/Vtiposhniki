import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistDraft } from '../api/types';
import { Empty, ErrorPanel, Loading } from '../components/States';
import { serverTime, shortId } from '../lib/format';

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
    const { checklist_id: _c, version_id: _v, semantic_hash: _s, scoring_config_hash: _h, created_at: _t, ...draft } =
      value as Record<string, unknown>;
    mutation.mutate({ ...(draft as ChecklistDraft), schema_version: '1.0' });
  }
  async function loadFile(file: File | undefined) {
    if (file) setText(await file.text());
  }
  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={`${id}-f`}>Файл ChecklistDraft (JSON)</label>
      <input id={`${id}-f`} type="file" accept="application/json,.json" onChange={(e) => loadFile(e.target.files?.[0])} />
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

export function ChecklistsPage() {
  const list = useQuery({ queryKey: ['checklists'], queryFn: ({ signal }) => api.listChecklists(signal) });
  return (
    <div className="page">
      <h1>Чек-листы</h1>
      <div className="layout-split">
        <section className="grow" aria-label="Список чек-листов">
          {list.isPending ? <Loading /> : null}
          {list.isError ? <ErrorPanel error={list.error} onRetry={() => list.refetch()} /> : null}
          {list.data && list.data.items.length === 0 ? (
            <Empty title="Чек-листов пока нет">Создайте чек-лист в редакторе или загрузите JSON.</Empty>
          ) : null}
          <ul className="card-list">
            {list.data?.items.map((c) => (
              <li key={c.checklist_id} data-testid="checklist-item">
                <Link to={`/checklists/${encodeURIComponent(c.checklist_id)}`}>{c.title}</Link>
                <div className="muted">
                  последняя версия {shortId(c.latest_version_id)} · создан {serverTime(c.created_at)}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <aside className="side panel">
          <h2>Загрузить из JSON</h2>
          <CreateFromJson />
        </aside>
      </div>
    </div>
  );
}
