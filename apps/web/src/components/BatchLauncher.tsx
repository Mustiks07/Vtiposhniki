import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, newIdempotencyKey } from '../api/client';
import type { CreateBatch } from '../api/types';
import { serverTime, shortId } from '../lib/format';
import { ErrorPanel, Loading } from './States';

/**
 * Launches one evaluation batch. The idempotency key is bound to the exact payload, so a
 * double click or a resubmission after a network error replays the same logical request
 * instead of creating a second batch.
 */
export function BatchLauncher({
  conversationIds,
  initialChecklistId,
  initialVersionId,
}: {
  conversationIds: string[];
  initialChecklistId?: string | null;
  initialVersionId?: string | null;
}) {
  const navigate = useNavigate();
  const ids = { checklist: useId(), version: useId(), profile: useId() };
  const checklists = useQuery({ queryKey: ['checklists'], queryFn: ({ signal }) => api.listChecklists(signal) });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: ({ signal }) => api.listProfiles(signal) });
  const [checklistId, setChecklistId] = useState(initialChecklistId ?? '');
  const [versionId, setVersionId] = useState(initialVersionId ?? '');
  const [profileId, setProfileId] = useState('');
  const [mode, setMode] = useState<CreateBatch['mode']>('fresh');

  useEffect(() => {
    if (!checklistId && checklists.data?.items.length) setChecklistId(checklists.data.items[0].checklist_id);
  }, [checklists.data, checklistId]);
  useEffect(() => {
    const configured = profiles.data?.items.find((p) => p.configured);
    if (!profileId && configured) setProfileId(configured.profile.id);
  }, [profiles.data, profileId]);

  const versions = useQuery({
    queryKey: ['checklist-versions', checklistId],
    queryFn: ({ signal }) => api.listChecklistVersions(checklistId, signal),
    enabled: Boolean(checklistId),
  });
  useEffect(() => {
    const items = versions.data?.items;
    if (!items?.length) return;
    if (!versionId || !items.some((v) => v.version_id === versionId)) {
      const latest = checklists.data?.items.find((c) => c.checklist_id === checklistId)?.latest_version_id;
      setVersionId(latest ?? items[items.length - 1].version_id);
    }
  }, [versions.data, checklistId, checklists.data, versionId]);

  const payload: CreateBatch | null = useMemo(
    () =>
      versionId && profileId && conversationIds.length
        ? { schema_version: '1.0', conversation_ids: conversationIds, checklist_version_id: versionId, profile_id: profileId, mode }
        : null,
    [conversationIds, versionId, profileId, mode],
  );
  const keyRef = useRef<{ payload: string; key: string } | null>(null);
  function keyFor(body: CreateBatch): string {
    const serialized = JSON.stringify(body);
    if (keyRef.current?.payload !== serialized) keyRef.current = { payload: serialized, key: newIdempotencyKey() };
    return keyRef.current.key;
  }

  // Synchronous guard: React state updates after the first click, a ref does not lag.
  const inFlight = useRef(false);
  const mutation = useMutation({
    mutationFn: (body: CreateBatch) => api.createBatch(body, keyFor(body)),
    onSuccess: (batch) => navigate(`/batches/${encodeURIComponent(batch.id)}`),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!payload || inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(payload);
  }

  const selectedProfile = profiles.data?.items.find((p) => p.profile.id === profileId);

  return (
    <section className="panel" aria-labelledby="batch-title">
      <h2 id="batch-title">Запуск оценки</h2>
      <p>
        Выбрано разговоров: <strong data-testid="selected-count">{conversationIds.length}</strong>
      </p>
      {checklists.isPending || profiles.isPending ? <Loading /> : null}
      {checklists.isError ? <ErrorPanel error={checklists.error} onRetry={() => checklists.refetch()} /> : null}
      {profiles.isError ? <ErrorPanel error={profiles.error} onRetry={() => profiles.refetch()} /> : null}
      {checklists.data && checklists.data.items.length === 0 ? (
        <p className="notice">Нет чек-листов. Создайте чек-лист в разделе «Чек-листы».</p>
      ) : null}
      <form onSubmit={submit}>
        <label htmlFor={ids.checklist}>Чек-лист</label>
        <select id={ids.checklist} value={checklistId} onChange={(e) => { setChecklistId(e.target.value); setVersionId(''); }}>
          {checklists.data?.items.map((c) => (
            <option key={c.checklist_id} value={c.checklist_id}>
              {c.title}
            </option>
          ))}
        </select>
        <label htmlFor={ids.version}>Версия чек-листа (закрепляется при запуске)</label>
        <select id={ids.version} value={versionId} onChange={(e) => setVersionId(e.target.value)}>
          {versions.data?.items.map((v) => (
            <option key={v.version_id} value={v.version_id}>
              {shortId(v.version_id)} · {serverTime(v.created_at)} · критериев: {v.criteria.length}
            </option>
          ))}
        </select>
        <label htmlFor={ids.profile}>Профиль оценщика</label>
        <select id={ids.profile} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          {profiles.data?.items.map((p) => (
            <option key={`${p.profile.id}-${p.profile.version}`} value={p.profile.id} disabled={!p.configured}>
              {p.profile.id} · {p.profile.version} · {p.profile.mode === 'test' ? 'тестовый' : 'production'}
              {p.configured ? '' : ' · не настроен'}
            </option>
          ))}
        </select>
        {selectedProfile?.profile.mode === 'test' ? (
          <p className="hint">Тестовый профиль выдаёт синтетические ответы без семантической оценки.</p>
        ) : null}
        <fieldset className="segmented">
          <legend>Режим</legend>
          <label>
            <input type="radio" name="batch-mode" checked={mode === 'fresh'} onChange={() => setMode('fresh')} /> fresh —
            новый вызов оценщика
          </label>
          <label>
            <input
              type="radio"
              name="batch-mode"
              checked={mode === 'reuse_if_compatible'}
              onChange={() => setMode('reuse_if_compatible')}
            />{' '}
            reuse_if_compatible — переиспользовать совместимый результат, если сервер подтвердит
          </label>
        </fieldset>
        <div className="row">
          <button type="submit" className="primary" disabled={!payload || mutation.isPending}>
            {mutation.isPending ? 'Запуск…' : 'Запустить пакет'}
          </button>
        </div>
      </form>
      {mutation.isError ? (
        <ErrorPanel error={mutation.error} onRetry={() => payload && mutation.mutate(payload)} retryLabel="Повторить тот же запрос">
          <p className="hint">Повтор использует тот же ключ идемпотентности: второй пакет не будет создан.</p>
        </ErrorPanel>
      ) : null}
    </section>
  );
}
