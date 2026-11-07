import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { ImportResult, JSONImport } from '../api/types';
import { ErrorPanel } from './States';
import { Modal } from './Modal';
import { Icon } from './Icon';

const dispositionLabel: Record<string, string> = {
  created: 'новый разговор',
  new_revision: 'новая revision',
  unchanged: 'без изменений',
};

/**
 * Parses only JSON readability and the envelope. Field-level validation is the server's
 * job (atomic import v1): its indexed errors are shown verbatim.
 */
export function parseImportJson(text: string): { ok: true; body: JSONImport } | { ok: false; error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Файл не является корректным JSON.' };
  }
  if (Array.isArray(value)) {
    return { ok: true, body: { schema_version: '1.0', source: 'json', records: value as JSONImport['records'] } };
  }
  if (typeof value === 'object' && value !== null && Array.isArray((value as { records?: unknown }).records)) {
    const obj = value as Partial<JSONImport>;
    if (obj.source !== undefined && obj.source !== 'json') {
      return { ok: false, error: 'Поле source должно быть "json".' };
    }
    return { ok: true, body: { ...(obj as JSONImport), schema_version: '1.0', source: 'json' } };
  }
  return { ok: false, error: 'Ожидается объект с массивом records (формат JSONImport v1) или массив записей.' };
}

function ImportResultView({ result }: { result: ImportResult }) {
  return (
    <div className="notice notice-ok" role="status">
      <p>
        Импорт выполнен атомарно: получено записей — {result.received_count}, свернуто дублей —{' '}
        {result.deduplicated_count}.
      </p>
      <ul>
        {result.items.map((item) => (
          <li key={`${item.conversation_id}-${item.revision}`}>
            <Link to={`/conversations/${encodeURIComponent(item.conversation_id)}?revision=${item.revision}`}>
              {item.conversation_id}
            </Link>{' '}
            · revision {item.revision} · {dispositionLabel[item.disposition] ?? item.disposition} · записи №
            {item.source_indices.map((i) => i + 1).join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ImportPanel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        <Icon name="upload" />
        Импорт разговоров
      </button>
      <Modal open={open} title="Импорт разговоров" onClose={() => setOpen(false)}>
        <ImportForm />
      </Modal>
    </>
  );
}

function ImportForm() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'json' | 'organizer'>('json');
  const [jsonText, setJsonText] = useState('');
  const [groupId, setGroupId] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const ids = { json: useId(), group: useId(), file: useId(), err: useId() };

  const mutation = useMutation({
    mutationFn: api.importConversations,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    setLocalError(null);
    if (mode === 'organizer') {
      if (!groupId.trim()) {
        setLocalError('Укажите group_id.');
        return;
      }
      mutation.mutate({ schema_version: '1.0', source: 'organizer_api', group_id: groupId.trim() });
      return;
    }
    const parsed = parseImportJson(jsonText);
    if (!parsed.ok) {
      setLocalError(parsed.error);
      return;
    }
    mutation.mutate(parsed.body);
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setJsonText(await file.text());
  }

  return (
    <section className="panel" aria-labelledby="import-title">
      <h2 id="import-title">Импорт разговоров</h2>
      <form onSubmit={submit} noValidate>
        <fieldset className="segmented">
          <legend>Источник</legend>
          <label>
            <input type="radio" name="import-mode" checked={mode === 'json'} onChange={() => setMode('json')} /> JSON
            (формат JSONImport v1)
          </label>
          <label>
            <input
              type="radio"
              name="import-mode"
              checked={mode === 'organizer'}
              onChange={() => setMode('organizer')}
            />{' '}
            API организаторов
          </label>
        </fieldset>
        {mode === 'json' ? (
          <>
            <label htmlFor={ids.file}>Файл JSON</label>
            <input
              id={ids.file}
              type="file"
              accept="application/json,.json"
              onChange={(e) => loadFile(e.target.files?.[0])}
            />
            <label htmlFor={ids.json}>Или вставьте JSON</label>
            <textarea
              id={ids.json}
              rows={6}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              aria-describedby={`${ids.json}-hint ${localError ? ids.err : ''}`}
              spellCheck={false}
            />
            <small id={`${ids.json}-hint`} className="hint">
              {
                '{"source":"json","records":[{"external_id":"…","channel":"agent_chat","language":"RU","messages":[{"speaker":"client","text":"…","timestamp_original":"00:01"}]}]}'
              }
            </small>
          </>
        ) : (
          <>
            <label htmlFor={ids.group}>group_id</label>
            <input
              id={ids.group}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              aria-describedby={`${ids.group}-hint ${localError ? ids.err : ''}`}
            />
            <small id={`${ids.group}-hint`} className="hint">
              Адрес API организаторов хранится на сервере; здесь задаётся только группа.
            </small>
          </>
        )}
        {localError ? (
          <p id={ids.err} className="field-error" role="alert">
            {localError}
          </p>
        ) : null}
        <div className="row">
          <button type="submit" className="primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Импорт…' : 'Импортировать'}
          </button>
        </div>
      </form>
      {mutation.isError ? (
        <ErrorPanel error={mutation.error}>
          <p>Импорт атомарный: при ошибке любой записи ни одна запись этого запроса не сохранена.</p>
        </ErrorPanel>
      ) : null}
      {mutation.data ? <ImportResultView result={mutation.data} /> : null}
    </section>
  );
}
