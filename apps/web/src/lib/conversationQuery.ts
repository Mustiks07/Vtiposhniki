// URL ⇄ listConversations query (contract 1.1.0). The server filters and counts; the UI only
// keeps a valid, dependency-consistent query in the URL so refresh restores the search.
import type { ConversationQuery, FlagScope, FlagStatus } from '../api/types';

const LANGS = ['RU', 'KZ', 'EN'] as const;
const CHANNELS = ['agent_chat', 'voice_call'] as const;
const STATUSES = ['unevaluated', 'pending', 'complete', 'partial', 'failed'] as const;
const FLAG_STATUSES = ['detected', 'not_detected', 'unknown'] as const;
const SCOPES = ['automatic', 'effective'] as const;

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export const PAGE_SIZE = 25;

export interface ParsedQuery {
  query: ConversationQuery;
  offset: number;
  /** Checklist chosen in the UI (helps pick a version; not sent to the server). */
  checklistId: string | null;
  versionId: string | null;
  flagCriterionId: string | null;
  flagStatus: FlagStatus | null;
  flagScope: FlagScope;
}

/**
 * Builds a query that respects the contract dependencies:
 * flag criterion requires a version; flag status and scope=effective require a criterion.
 */
export function parseConversationQuery(params: URLSearchParams): ParsedQuery {
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const versionId = params.get('checklist_version_id') || null;
  const flagCriterionId = versionId ? params.get('flag_criterion_id') || null : null;
  const flagStatus = flagCriterionId ? pick(params.get('flag_status'), FLAG_STATUSES) : null;
  const flagScope: FlagScope = (flagCriterionId && pick(params.get('flag_scope'), SCOPES)) || 'automatic';
  const query: ConversationQuery = {
    limit: PAGE_SIZE,
    offset,
    language: pick(params.get('language'), LANGS),
    channel: pick(params.get('channel'), CHANNELS),
    status: pick(params.get('status'), STATUSES),
  };
  if (versionId) query.checklist_version_id = versionId;
  if (flagCriterionId) {
    query.flag_criterion_id = flagCriterionId;
    query.flag_scope = flagScope;
    if (flagStatus) query.flag_status = flagStatus;
  }
  return { query, offset, checklistId: params.get('checklist') || null, versionId, flagCriterionId, flagStatus, flagScope };
}

/** Keys that change the result set: changing any of them returns to page 1. */
export const FILTER_KEYS = [
  'language',
  'channel',
  'status',
  'checklist',
  'checklist_version_id',
  'flag_criterion_id',
  'flag_status',
  'flag_scope',
] as const;

/** Applies a filter change, clears dependents that became invalid and resets paging. */
export function withFilter(params: URLSearchParams, key: (typeof FILTER_KEYS)[number], value: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  if (key === 'checklist') {
    next.delete('checklist_version_id');
    next.delete('flag_criterion_id');
  }
  if (key === 'checklist_version_id') next.delete('flag_criterion_id');
  if (!next.get('flag_criterion_id')) {
    next.delete('flag_status');
    next.delete('flag_scope');
  }
  next.delete('offset');
  return next;
}

export const flagStatusLabel: Record<FlagStatus, string> = {
  detected: 'обнаружен',
  not_detected: 'не обнаружен',
  unknown: 'неизвестно',
};

export const flagScopeLabel: Record<FlagScope, string> = {
  automatic: 'automatic — исходный результат оценщика',
  effective: 'effective — с учётом решений проверяющего',
};
