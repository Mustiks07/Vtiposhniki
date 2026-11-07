import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { api } from '../api/client';
import type { ChecklistVersion, ConversationFlagSummary } from '../api/types';
import { flagScopeLabel, flagStatusLabel, type ParsedQuery } from '../lib/conversationQuery';
import { serverTime } from '../lib/format';
import { Badge } from './States';

/** Flag criteria of a version, named by their own titles (no "gross error" guessing). */
export function flagCriteria(version: ChecklistVersion | undefined) {
  return (version?.criteria ?? []).filter((c) => c.response_type === 'flag');
}

export function useSelectedVersion(versionId: string | null) {
  return useQuery({
    queryKey: ['checklist-version', versionId],
    queryFn: ({ signal }) => api.getChecklistVersion(versionId!, signal),
    enabled: Boolean(versionId),
    staleTime: Infinity, // immutable
  });
}

export function FlagFilters({
  parsed,
  onChange,
}: {
  parsed: ParsedQuery;
  onChange: (
    key: 'checklist' | 'checklist_version_id' | 'flag_criterion_id' | 'flag_status' | 'flag_scope',
    value: string | null,
    extra?: Record<string, string>,
  ) => void;
}) {
  const ids = { cl: useId(), ver: useId(), crit: useId(), status: useId() };
  const checklists = useQuery({
    queryKey: ['checklists'],
    queryFn: ({ signal }) => api.listChecklists(signal),
  });
  const versions = useQuery({
    queryKey: ['checklist-versions', parsed.checklistId],
    queryFn: ({ signal }) => api.listChecklistVersions(parsed.checklistId!, signal),
    enabled: Boolean(parsed.checklistId),
  });
  const version = useSelectedVersion(parsed.versionId);
  const flags = flagCriteria(version.data);
  const scopeName = useId();
  const [expanded, setExpanded] = useState(() => Boolean(parsed.versionId));

  return (
    <details className="advanced-filters" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>Версия чек-листа и поиск по флагу</summary>
      <fieldset className="flag-filters" aria-describedby={`${ids.cl}-hint`}>
        <legend>Поиск по результату оценки</legend>
        <small id={`${ids.cl}-hint`} className="hint">
          Поиск по последней оценке текущего текста. Выберите чек-лист и его версию, чтобы сравнивать разговоры по одним
          правилам.
        </small>
        <div className="filters">
          <div>
            <label htmlFor={ids.cl}>Чек-лист для поиска</label>
            <select
              id={ids.cl}
              value={parsed.checklistId ?? ''}
              onChange={(e) => {
                const latest = checklists.data?.items.find((c) => c.checklist_id === e.target.value)?.latest_version_id;
                onChange('checklist', e.target.value || null, latest ? { checklist_version_id: latest } : undefined);
              }}
            >
              <option value="">Любой (без поиска по флагу)</option>
              {checklists.data?.items.map((c) => (
                <option key={c.checklist_id} value={c.checklist_id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.ver}>Версия для поиска</label>
            <select
              id={ids.ver}
              value={parsed.versionId ?? ''}
              disabled={!parsed.checklistId}
              onChange={(e) => onChange('checklist_version_id', e.target.value || null)}
            >
              <option value="">—</option>
              {versions.data?.items.map((v, index) => (
                <option key={v.version_id} value={v.version_id}>
                  Версия {versions.data!.total - versions.data!.offset - index} · {serverTime(v.created_at)}
                </option>
              ))}
              {parsed.versionId && !versions.data?.items.some((v) => v.version_id === parsed.versionId) ? (
                <option value={parsed.versionId}>Версия из открытой ссылки</option>
              ) : null}
            </select>
          </div>
          <div>
            <label htmlFor={ids.crit}>Флаговый критерий</label>
            <select
              id={ids.crit}
              value={parsed.flagCriterionId ?? ''}
              disabled={!parsed.versionId || !flags.length}
              onChange={(e) => onChange('flag_criterion_id', e.target.value || null)}
              aria-describedby={`${ids.crit}-h`}
            >
              <option value="">— не выбран —</option>
              {flags.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <small id={`${ids.crit}-h`} className="hint">
              {parsed.versionId && version.data && !flags.length
                ? 'В этой версии нет флаговых критериев.'
                : 'Один флаг выбранной версии.'}
            </small>
          </div>
          <div>
            <label htmlFor={ids.status}>Состояние флага</label>
            <select
              id={ids.status}
              value={parsed.flagStatus ?? ''}
              disabled={!parsed.flagCriterionId}
              onChange={(e) => onChange('flag_status', e.target.value || null)}
            >
              <option value="">Все состояния</option>
              {(Object.keys(flagStatusLabel) as (keyof typeof flagStatusLabel)[]).map((s) => (
                <option key={s} value={s}>
                  {flagStatusLabel[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="segmented" disabled={!parsed.flagCriterionId}>
          <legend>Результат</legend>
          {(['automatic', 'effective'] as const).map((s) => (
            <label key={s}>
              <input
                type="radio"
                name={scopeName}
                checked={parsed.flagScope === s}
                onChange={() => onChange('flag_scope', s === 'automatic' ? null : s)}
              />{' '}
              {flagScopeLabel[s]}
            </label>
          ))}
        </fieldset>
      </fieldset>
    </details>
  );
}

/** Plain-language description of what the server was asked for. */
export function SearchScope({ parsed, total }: { parsed: ParsedQuery; total: number | undefined }) {
  const version = useSelectedVersion(parsed.versionId);
  const flag = flagCriteria(version.data).find((c) => c.id === parsed.flagCriterionId);
  if (!parsed.versionId) {
    return (
      <p className="search-scope" data-testid="search-scope">
        Последний запуск по текущей версии разговора · любой чек-лист ·{' '}
        {parsed.query.result_scope === 'effective' ? 'с учётом пересмотра' : 'исходная AI-оценка'}.
        {total !== undefined ? ` Найдено: ${total}.` : ''}
      </p>
    );
  }
  return (
    <p className="search-scope" data-testid="search-scope" aria-live="polite">
      Последний запуск по текущей версии разговора · {version.data ? `«${version.data.title}»` : 'Выбранный чек-лист'}
      {flag ? (
        <>
          {' '}
          · флаг «{flag.title}» ·{' '}
          {parsed.flagStatus ? `состояние: ${flagStatusLabel[parsed.flagStatus]}` : 'все состояния'} · результат{' '}
          {flagScopeLabel[parsed.flagScope]}
        </>
      ) : (
        ' · без отбора по флагу'
      )}
      {total !== undefined ? `. Найдено: ${total}.` : '.'}
      {parsed.flagStatus === 'unknown'
        ? ' «Неизвестно» — нет оценки, обработка не завершена, ошибка или флаг не определён; это не «нарушений нет».'
        : ''}
    </p>
  );
}

const flagTone: Record<string, string> = {
  detected: 'failed',
  not_detected: 'complete',
  unknown: 'unevaluated',
};

export function FlagCell({
  summary,
  evaluationId,
  title,
}: {
  summary: ConversationFlagSummary;
  evaluationId: string | null | undefined;
  title: string;
}) {
  const criterionId = summary.result.criterion_id;
  return (
    <div data-testid="flag-cell" data-flag-status={summary.status}>
      <Badge status={flagTone[summary.status]}>
        {title}: {flagStatusLabel[summary.status]}
      </Badge>
      <div className="muted">{flagScopeLabel[summary.scope]}</div>
      {evaluationId ? (
        <a
          href={`#/evaluations/${encodeURIComponent(evaluationId)}?criterion=${encodeURIComponent(criterionId)}&scope=${summary.scope}`}
          data-testid="flag-explain"
        >
          Объяснение и доказательства
        </a>
      ) : (
        <span className="muted">нет результата выбранного запуска</span>
      )}
    </div>
  );
}
