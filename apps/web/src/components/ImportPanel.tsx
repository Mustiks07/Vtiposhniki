import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Channel, ImportRecord, ImportResult, JSONImport, Language } from '../api/types';
import { channelLabel, languageLabel, speakerLabel } from '../lib/labels';
import {
  newPastedExternalId,
  parsePlainDialog,
  PLAIN_DIALOG_EXAMPLE,
  SUPPORTED_ROLES_TEXT,
  toImportRecord,
} from '../lib/plainDialog';
import { BatchLaunchForm } from './BatchLauncher';
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

type ImportMode = 'paste' | 'json' | 'organizer';

export function ImportPanel({ pasteRequest = null }: { pasteRequest?: { exampleId: string | null } | null } = {}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>('json');
  const [seed, setSeed] = useState<string | null>(null);
  // Opened from the tutorial: plain-text mode; the example text is offered only on request.
  useEffect(() => {
    if (!pasteRequest) return;
    setMode('paste');
    setOpen(true);
    if (!pasteRequest.exampleId) return;
    let cancelled = false;
    void import('../tutorial/example').then(({ tutorialExample, exampleAsPlainText }) => {
      const example = tutorialExample(pasteRequest.exampleId);
      if (!cancelled && example) setSeed(exampleAsPlainText(example));
    });
    return () => {
      cancelled = true;
    };
  }, [pasteRequest]);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMode('paste');
          setOpen(true);
        }}
      >
        <Icon name="chat" />
        Вставить диалог
      </button>
      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === 'paste' ? 'json' : m));
          setOpen(true);
        }}
      >
        <Icon name="upload" />
        Импорт разговоров
      </button>
      <Modal open={open} wide={mode === 'paste'} title="Импорт разговоров" onClose={() => setOpen(false)}>
        <section className="panel" aria-labelledby="import-title">
          <h2 id="import-title">Импорт разговоров</h2>
          <fieldset className="segmented">
            <legend>Источник</legend>
            <label>
              <input type="radio" name="import-mode" checked={mode === 'paste'} onChange={() => setMode('paste')} />{' '}
              Вставить диалог обычным текстом
            </label>
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
          {/* Both forms stay mounted, so switching the source never loses typed input. */}
          <div hidden={mode !== 'paste'}>
            <PasteDialogForm seed={seed} />
          </div>
          <div hidden={mode === 'paste'}>
            <ImportForm mode={mode === 'organizer' ? 'organizer' : 'json'} />
          </div>
        </section>
      </Modal>
    </>
  );
}

function ImportForm({ mode }: { mode: 'json' | 'organizer' }) {
  const queryClient = useQueryClient();
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
    <>
      <form onSubmit={submit} noValidate>
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
    </>
  );
}

const pasteDisposition: Record<string, string> = {
  created: 'Создан новый разговор.',
  new_revision:
    'Разговор с этим ID уже был: сохранена новая revision текста. Прежние оценки относятся к прежнему тексту.',
  unchanged: 'Разговор с этим ID и таким же текстом уже есть — новый не создан, используется существующий.',
};

interface Imported {
  /** Exact record that was sent, to detect later edits under the same external ID. */
  sent: string;
  externalId: string;
  result: ImportResult;
}

/**
 * Plain-text dialog → preview → existing JSONImport v1 via the current API. The generated
 * external ID is created once per draft and reused on retry, so a repeated click or a retry
 * after a network error re-sends the same record; the server's revision rules decide whether
 * anything new is stored. Nothing is kept in browser storage.
 */
function PasteDialogForm({ seed = null }: { seed?: string | null }) {
  const queryClient = useQueryClient();
  const ids = {
    text: useId(),
    lang: useId(),
    chan: useId(),
    ext: useId(),
    hint: useId(),
    errors: useId(),
  };
  const [text, setText] = useState('');
  const [seedNote, setSeedNote] = useState<string | null>(null);
  // A seed never overwrites a draft the user already typed.
  useEffect(() => {
    if (!seed) return;
    setText((current) => {
      if (current.trim()) {
        setSeedNote('В поле уже есть ваш текст — пример не перенесён.');
        return current;
      }
      setSeedNote('Текст учебного примера перенесён для редактирования. Импорт и оценка выполняются только по вашей команде.');
      return seed;
    });
  }, [seed]);
  const [language, setLanguage] = useState<Language>('RU');
  const [channel, setChannel] = useState<Channel>('agent_chat');
  const [externalId, setExternalId] = useState(() => newPastedExternalId());
  const [imported, setImported] = useState<Imported | null>(null);
  const [touched, setTouched] = useState(false);

  // Preview and validation are derived from the current text on every render: they can
  // never describe an older version of the input.
  const parsed = useMemo(() => parsePlainDialog(text), [text]);
  const idProblem = !externalId.trim()
    ? 'Укажите внешний ID или создайте новый.'
    : externalId.trim().length > 200
      ? 'Внешний ID не длиннее 200 символов.'
      : null;
  const record: ImportRecord | null =
    parsed.errors.length || idProblem
      ? null
      : toImportRecord(parsed.messages, { externalId: externalId.trim(), language, channel });
  const serialized = record ? JSON.stringify(record) : null;
  const sameAsImported = imported !== null && serialized === imported.sent;
  const editedAfterImport =
    imported !== null && !sameAsImported && externalId.trim() === imported.externalId && text.trim() !== '';

  const inFlight = useRef(false);
  const resultRef = useRef<HTMLElement>(null);
  const mutation = useMutation({
    mutationFn: (body: { record: ImportRecord; sent: string }) =>
      api.importConversations({ schema_version: '1.0', source: 'json', records: [body.record] }),
    onSuccess: (result, body) => {
      setImported({ sent: body.sent, externalId: body.record.external_id, result });
      // Bring the outcome and the next step (launch) into view; focus for screen readers.
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        resultRef.current?.focus({ preventScroll: true });
      });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  function send() {
    if (!record || !serialized || inFlight.current || sameAsImported) return;
    inFlight.current = true;
    mutation.mutate({ record, sent: serialized });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    send();
  }

  function startNew() {
    setText('');
    setExternalId(newPastedExternalId());
    setImported(null);
    setTouched(false);
    mutation.reset();
  }

  const showErrors = parsed.errors.length > 0 && (touched || text.trim() !== '');
  const item = imported?.result.items[0];

  return (
    <div className="paste-import">
      <form onSubmit={submit} noValidate className="paste-form">
        <div className="paste-meta">
          <div>
            <label htmlFor={ids.lang}>Язык разговора</label>
            <select id={ids.lang} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              {(['RU', 'KZ', 'EN'] as const).map((v) => (
                <option key={v} value={v}>{`${v} · ${languageLabel[v]}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.chan}>Канал</label>
            <select id={ids.chan} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              <option value="agent_chat">{channelLabel.agent_chat}</option>
              <option value="voice_call">Расшифровка звонка</option>
            </select>
          </div>
          <div className="paste-id">
            <label htmlFor={ids.ext}>Внешний ID разговора</label>
            <div className="row nowrap">
              <input
                id={ids.ext}
                value={externalId}
                maxLength={200}
                spellCheck={false}
                onChange={(e) => setExternalId(e.target.value)}
                aria-describedby={`${ids.ext}-hint`}
                aria-invalid={idProblem ? true : undefined}
              />
              <button type="button" onClick={() => setExternalId(newPastedExternalId())}>
                Новый ID
              </button>
            </div>
            <small id={`${ids.ext}-hint`} className="hint">
              {idProblem ??
                'Создан автоматически и не меняется при повторе. Существующий ID создаст новую revision этого разговора.'}
            </small>
          </div>
        </div>

        <label htmlFor={ids.text}>Текст диалога</label>
        {seedNote ? (
          <p className="hint" data-testid="paste-seed-note">
            {seedNote}
          </p>
        ) : null}
        <textarea
          id={ids.text}
          className="paste-text"
          rows={12}
          value={text}
          spellCheck={false}
          placeholder={PLAIN_DIALOG_EXAMPLE}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={`${ids.hint}${showErrors ? ` ${ids.errors}` : ''}`}
          aria-invalid={showErrors ? true : undefined}
        />
        <div id={ids.hint} className="hint paste-hint">
          <p>
            Одна реплика начинается с новой строки: <code>[время] роль: текст</code>. Время в квадратных скобках
            необязательно: <code>ММ:СС</code>, <code>Ч:ММ:СС</code> или ISO 8601 с часовым поясом. Роли:{' '}
            {SUPPORTED_ROLES_TEXT}.
          </p>
          <p>
            Строка с отступом (пробел или Tab) продолжает предыдущую реплику с переводом строки. Двоеточия внутри
            текста сохраняются. Без времени реплика сохраняется без метки, а не как 00:00.
          </p>
          <details>
            <summary>Пример</summary>
            <pre className="paste-example">{PLAIN_DIALOG_EXAMPLE}</pre>
            <button type="button" className="link" onClick={() => setText(PLAIN_DIALOG_EXAMPLE)} disabled={text !== ''}>
              Вставить пример в пустое поле
            </button>
          </details>
        </div>

        {showErrors ? (
          <div id={ids.errors} className="paste-errors" role="alert" data-testid="paste-errors">
            <p>
              <strong>Исправьте ошибки ({parsed.errors.length}) — импорт недоступен, пока они есть.</strong> Текст в
              поле сохранён.
            </p>
            <ul>
              {parsed.errors.map((e, i) => (
                <li key={`${e.line}-${i}`}>
                  Строка {e.line}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {editedAfterImport ? (
          <p className="notice notice-warn" data-testid="paste-edited">
            Текст изменён после импорта. Повторный импорт с тем же ID сохранит новую revision разговора. Чтобы
            создать отдельный разговор, нажмите «Новый ID».
          </p>
        ) : null}

        <div className="row paste-actions">
          <button
            type="submit"
            className="primary"
            disabled={mutation.isPending || !record || sameAsImported}
            aria-describedby={!record && text.trim() ? ids.errors : undefined}
          >
            {mutation.isPending
              ? 'Импорт…'
              : sameAsImported
                ? 'Диалог импортирован'
                : `Импортировать диалог${record ? ` (${record.messages.length})` : ''}`}
          </button>
          {imported ? (
            <button type="button" onClick={startNew}>
              Вставить новый диалог
            </button>
          ) : null}
        </div>
        {mutation.isError ? (
          <ErrorPanel
            error={mutation.error}
            onRetry={record ? send : undefined}
            retryLabel="Повторить с тем же ID"
          >
            <p className="hint">
              Текст сохранён в поле. Повтор отправит ту же запись с тем же ID: если сервер уже сохранил её,
              второй разговор не появится.
            </p>
          </ErrorPanel>
        ) : null}
      </form>

      <section className="paste-preview" aria-labelledby={`${ids.text}-preview`} data-testid="paste-preview">
        <h3 id={`${ids.text}-preview`}>
          Предпросмотр{' '}
          <span className="muted" data-testid="paste-count">
            · сообщений: {parsed.messages.length}
          </span>
        </h3>
        {parsed.messages.length === 0 ? (
          <p className="muted">Здесь появятся реплики в том виде, в каком они будут сохранены.</p>
        ) : (
          <ol className="paste-messages">
            {parsed.messages.map((m) => (
              <li key={m.number} data-testid="paste-message" data-speaker={m.speaker} className={`msg-${m.speaker}`}>
                <div className="paste-message-head">
                  <span className="paste-number">№{m.number}</span>
                  <strong>{speakerLabel[m.speaker]}</strong>
                  <code className="muted">{m.speaker}</code>
                  <span className={m.time ? 'paste-time' : 'paste-time muted'} data-testid="paste-time">
                    {m.time ?? 'время не указано'}
                  </span>
                </div>
                <p className="paste-message-text" lang={language === 'KZ' ? 'kk' : language.toLowerCase()}>
                  {m.text}
                </p>
              </li>
            ))}
          </ol>
        )}
        {parsed.errors.length && parsed.messages.length ? (
          <p className="hint">Строки с ошибками в предпросмотр не попали.</p>
        ) : null}
      </section>

      {imported && item ? (
        <section
          ref={resultRef}
          tabIndex={-1}
          className="paste-result"
          aria-labelledby={`${ids.text}-done`}
          data-testid="paste-result"
        >
          <div className="notice notice-ok" role="status">
            <p id={`${ids.text}-done`}>
              <strong>Готово.</strong> {pasteDisposition[item.disposition] ?? item.disposition} ID{' '}
              <code>{imported.externalId}</code>, revision {item.revision}, сообщений:{' '}
              {JSON.parse(imported.sent).messages.length}.
            </p>
            <p>
              <Link to={`/conversations/${encodeURIComponent(item.conversation_id)}?revision=${item.revision}`}>
                Открыть разговор
              </Link>
            </p>
          </div>
          <BatchLaunchForm conversationIds={[item.conversation_id]} />
        </section>
      ) : null}
    </div>
  );
}
