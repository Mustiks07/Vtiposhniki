import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { api, newIdempotencyKey } from '../api/client';
import type { Criterion, CriterionSuggestionRun, SuggestCriterionRequest } from '../api/types';
import { criterionFromBlueprint } from '../lib/criterionDesign';
import { responseTypeLabel } from '../lib/labels';
import { decimalRu } from '../lib/format';
import { profileLabel } from '../lib/presentation';
import { tokenText, tokenTotals } from '../lib/runSummary';
import { CallTable } from './RunDetails';
import { ErrorPanel } from './States';

function modelText(run: CriterionSuggestionRun): string {
  const actual = run.calls?.at(-1)?.actual;
  return actual ? `${actual.provider} / ${actual.model}${(actual.provider === 'xerosharc' || actual.provider === 'basisweb') ? ' · внутренняя модель шлюза не подтверждена' : ''}` : 'модель неизвестна';
}

export function CriterionDesigner({ onAdd }: { onAdd: (criterion: Criterion) => void }) {
  const uid = useId();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [profileId, setProfileId] = useState('');
  const [chosen, setChosen] = useState<CriterionSuggestionRun | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const key = useRef<{ signature: string; value: string } | null>(null);
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: ({ signal }) => api.listProfiles(signal), enabled: open });
  const history = useQuery({ queryKey: ['criterion-suggestions'], queryFn: ({ signal }) => api.listCriterionSuggestions(signal), enabled: open, retry: 0,
    refetchInterval: (q) => q.state.data?.items.some((r) => r.state === 'running') ? 1500 : false });
  useEffect(() => {
    if (!profileId) {
      const profile = profiles.data?.items.find((p) => p.preferred) ?? profiles.data?.items.find((p) => p.configured);
      if (profile) setProfileId(profile.profile.id);
    }
  }, [profiles.data, profileId]);
  const mutation = useMutation({
    mutationFn: () => {
      const body: SuggestCriterionRequest = { schema_version: '1.0', title: title.trim(), description: description.trim(), profile_id: profileId };
      const signature = JSON.stringify(body);
      if (key.current?.signature !== signature) key.current = { signature, value: newIdempotencyKey() };
      return api.suggestCriterion(body, key.current.value);
    },
    onSuccess: async (result) => {
      key.current = null;
      setChosen(result);
      await client.invalidateQueries({ queryKey: ['criterion-suggestions'] });
    },
  });
  const suggestion = chosen?.suggestion;
  return <details className="ai-advice criterion-designer" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}
    onKeyDown={(e) => { if (e.key === 'Enter' && (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) e.preventDefault(); }}>
    <summary>✦ Создать критерий с помощью ИИ</summary>
    <p className="hint">Подсказка AI: предложение правила и шкалы. Сохранение — только через обычный редактор. Вес задаёте вы; доли шкалы нужно проверить и подтвердить.</p>
    <div className="grid-2">
      <div><label htmlFor={`${uid}-title`}>Название будущего критерия</label>
        <input id={`${uid}-title`} maxLength={200} value={title} disabled={mutation.isPending} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><label htmlFor={`${uid}-profile`}>Профиль для подсказки</label>
        <select id={`${uid}-profile`} value={profileId} disabled={mutation.isPending} onChange={(e) => setProfileId(e.target.value)}>
          <option value="">Выберите профиль</option>
          {profiles.data?.items.map((p) => <option key={p.profile.id} value={p.profile.id}>{profileLabel(p.profile)}{p.configured ? '' : ' · ключ недоступен'}</option>)}
        </select></div>
    </div>
    <label htmlFor={`${uid}-description`}>Какое действие нужно оценить — одной фразой</label>
    <textarea id={`${uid}-description`} rows={2} maxLength={2000} value={description} disabled={mutation.isPending} onChange={(e) => setDescription(e.target.value)} />
    <button type="button" disabled={mutation.isPending || !title.trim() || !description.trim() || !profileId} onClick={() => mutation.mutate()}>
      {mutation.isPending ? 'Готовим предложение…' : 'Предложить правило и шкалу'}
    </button>
    {profiles.isError ? <p className="hint" role="status">Профили недоступны. Критерий можно создать вручную.</p> : null}
    {mutation.isError ? <ErrorPanel error={mutation.error} onRetry={() => mutation.mutate()} retryLabel="Проверить тот же запрос" /> : null}
    {chosen ? <section className="ai-advice-result" aria-label="Предложение критерия">
      <p><strong>{chosen.mode === 'test' ? 'Тестовая подсказка · не AI-анализ' : 'Подсказка AI'}</strong> · {modelText(chosen)}</p>
      {chosen.error ? <p className="notice notice-warn" role="status">{chosen.error.message}</p> : null}
      {suggestion ? <>
        <h3>{suggestion.title}</h3>
        <p>{suggestion.definition}</p>
        <p className="hint">{responseTypeLabel[suggestion.response_type]} · {suggestion.allow_na ? `N/A: ${suggestion.na_condition}` : 'N/A не разрешён'}</p>
        <ul className="criterion-design-choices">{suggestion.choices.map((c) => <li key={c.id}>
          <strong>{c.label}</strong> — {c.anchor}
          <small>{suggestion.response_type === 'flag' ? (suggestion.flag_when_choice_ids ?? []).includes(c.id) ? 'Означает нарушение' : 'Без флага' : `Доля: ${decimalRu(c.score_fraction)}`}</small>
        </li>)}</ul>
        <p>{suggestion.explanation}</p>
        <button type="button" disabled={added.has(chosen.id)} onClick={() => {
          onAdd(criterionFromBlueprint(suggestion));
          setAdded((items) => new Set([...items, chosen.id]));
        }}>{added.has(chosen.id) ? 'Добавлено в черновик' : 'Добавить в черновик'}</button>
        {added.has(chosen.id) ? <p className="hint" role="status">Критерий в форме ниже. Укажите вес, проверьте условия и подтвердите доли. Затем сохраните новую версию.</p> : null}
      </> : null}
      <details className="technical-details"><summary>Вызовы и расход этой подсказки</summary>
        <p>{tokenText(tokenTotals(chosen.calls ?? []))} · профиль {chosen.profile_id} / {chosen.profile_version}</p>
        {chosen.calls?.length ? <CallTable calls={chosen.calls} /> : <p>Вызовов модели не было.</p>}
      </details>
    </section> : null}
    <details className="technical-details"><summary>Журнал предложений ({history.data?.total ?? '…'})</summary>
      {history.isError ? <p className="hint">История недоступна. Редактор работает как обычно.</p> : null}
      <ul>{history.data?.items.map((r) => <li key={r.id}><button type="button" className="link" onClick={() => setChosen(r)}>{r.title}</button> · {r.state === 'succeeded' ? 'готово' : r.state === 'running' ? 'выполняется' : 'не получено'}</li>)}</ul>
    </details>
  </details>;
}
