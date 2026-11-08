// Thin typed client over the v1 HTTP contract. No business logic, no caching of results
// outside react-query memory, no localStorage. Every read accepts an AbortSignal so a stale
// response cannot leak into a newly selected card.
import type {
  ConversationQuestionRequest,
  ConversationQuestionRun,
  ConversationQuestionPage,
  CriterionSuggestionRun,
  CriterionSuggestionPage,
  SuggestCriterionRequest,
  AssistantRun,
  AssistantRunPage,
  CoachingRequest,
  Appeal,
  AppealPage,
  APIErrorBody,
  ChecklistDraft,
  ChecklistPage,
  ChecklistVersion,
  Conversation,
  ConversationPage,
  ConversationQuery,
  CreateAppeal,
  CreateBatch,
  CreateChecklistVersion,
  Decision,
  DecisionRequest,
  EvaluationBatch,
  EvaluationPage,
  EvaluationView,
  Health,
  ImportResult,
  JSONImport,
  Job,
  OrganizerImport,
  ProfilePage,
  SecondOpinion,
  SecondOpinionPage,
  VersionList,
} from './types';

export const API_BASE = '/api/v1';

/** Error carrying the contract APIError body (when the server sent one). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: APIErrorBody | null;
  /** True when the request never reached a response (offline, DNS, server down). */
  readonly network: boolean;

  constructor(status: number, body: APIErrorBody | null, network = false) {
    super(body?.message ?? (network ? 'Network error' : `HTTP ${status}`));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.network = network;
  }

  get code(): string | null {
    return this.body?.code ?? null;
  }

  get correlationId(): string | null {
    return this.body?.correlation_id ?? null;
  }
}

function isApiErrorBody(value: unknown): value is APIErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { correlation_id?: unknown }).correlation_id === 'string'
  );
}

type Query = Record<string, string | number | null | undefined>;

export function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, null, true);
  }
  if (!response.ok) {
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    throw new ApiError(response.status, isApiErrorBody(parsed) ? parsed : null);
  }
  return (await response.json()) as T;
}

const enc = encodeURIComponent;

export type ConversationFilters = ConversationQuery;

export const api = {
  health: (signal?: AbortSignal) => request<Health>('/health', { signal }),

  importConversations: (body: JSONImport | OrganizerImport) =>
    request<ImportResult>('/imports', { method: 'POST', body }),

  listConversations: (filters: ConversationFilters, signal?: AbortSignal) =>
    request<ConversationPage>('/conversations', { query: { ...filters }, signal }),

  getConversation: (id: string, revision: number | null, signal?: AbortSignal) =>
    request<Conversation>(`/conversations/${enc(id)}`, { query: { revision }, signal }),

  listChecklists: (signal?: AbortSignal) =>
    request<ChecklistPage>('/checklists', { query: { limit: 200 }, signal }),

  createChecklist: (body: ChecklistDraft) =>
    request<ChecklistVersion>('/checklists', { method: 'POST', body }),

  listChecklistVersions: (checklistId: string, signal?: AbortSignal) =>
    request<VersionList>(`/checklists/${enc(checklistId)}/versions`, {
      query: { limit: 200 },
      signal,
    }),

  createChecklistVersion: (checklistId: string, body: CreateChecklistVersion) =>
    request<ChecklistVersion>(`/checklists/${enc(checklistId)}/versions`, {
      method: 'POST',
      body,
    }),

  getChecklistVersion: (versionId: string, signal?: AbortSignal) =>
    request<ChecklistVersion>(`/checklist-versions/${enc(versionId)}`, { signal }),

  listProfiles: (signal?: AbortSignal) =>
    request<ProfilePage>('/evaluator-profiles', { query: { limit: 200 }, signal }),

  createBatch: (body: CreateBatch, idempotencyKey: string) =>
    request<EvaluationBatch>('/evaluation-batches', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  getBatch: (id: string, signal?: AbortSignal) =>
    request<EvaluationBatch>(`/evaluation-batches/${enc(id)}`, { signal }),

  getJob: (id: string, signal?: AbortSignal) => request<Job>(`/jobs/${enc(id)}`, { signal }),

  retryJob: (id: string) => request<Job>(`/jobs/${enc(id)}/retry`, { method: 'POST' }),

  listEvaluations: (
    filters: { conversation_id?: string; batch_id?: string; status?: string; limit?: number; offset?: number },
    signal?: AbortSignal,
  ) => request<EvaluationPage>('/evaluations', { query: { ...filters }, signal }),

  getEvaluation: (id: string, signal?: AbortSignal) =>
    request<EvaluationView>(`/evaluations/${enc(id)}`, { signal }),

  askConversation: (id: string, body: ConversationQuestionRequest, key: string) =>
    request<ConversationQuestionRun>(`/evaluations/${enc(id)}/questions`, { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
  listConversationQuestions: (id: string, signal?: AbortSignal) =>
    request<ConversationQuestionPage>(`/evaluations/${enc(id)}/questions`, { signal }),
  createCoaching: (id: string, body: CoachingRequest, key: string) =>
    request<AssistantRun>(`/evaluations/${enc(id)}/coaching`, { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
  listAssistantRuns: (id: string, signal?: AbortSignal) =>
    request<AssistantRunPage>(`/evaluations/${enc(id)}/assistant-runs`, { signal }),

  createAppeal: (evaluationId: string, body: CreateAppeal) =>
    request<Appeal>(`/evaluations/${enc(evaluationId)}/appeals`, { method: 'POST', body }),

  createSecondOpinion: (appealId: string, key: string) =>
    request<SecondOpinion>(`/appeals/${enc(appealId)}/second-opinions`, { method: 'POST', headers: { 'Idempotency-Key': key } }),
  listSecondOpinions: (appealId: string, signal?: AbortSignal) =>
    request<SecondOpinionPage>(`/appeals/${enc(appealId)}/second-opinions`, { signal }),

  suggestCriterion: (body: SuggestCriterionRequest, key: string) =>
    request<CriterionSuggestionRun>('/criterion-suggestions', { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
  listCriterionSuggestions: (signal?: AbortSignal) =>
    request<CriterionSuggestionPage>('/criterion-suggestions', { query: { limit: 20 }, signal }),

  getAppeal: (id: string, signal?: AbortSignal) => request<Appeal>(`/appeals/${enc(id)}`, { signal }),

  listAppeals: (
    filters: { state?: string | null; evaluation_id?: string | null; limit?: number; offset?: number },
    signal?: AbortSignal,
  ) => request<AppealPage>('/appeals', { query: { ...filters }, signal }),

  decideAppeal: (appealId: string, body: DecisionRequest) =>
    request<Decision>(`/appeals/${enc(appealId)}/decision`, { method: 'POST', body }),
};

/** Server-side export routes. The UI only links to them; it never rebuilds a format. */
export function evaluationExportUrl(id: string, scope: 'automatic' | 'effective', format: 'json' | 'csv'): string {
  return buildUrl(`/evaluations/${enc(id)}/export`, { scope, format });
}

export function batchExportUrl(id: string, scope: 'automatic' | 'effective', format: 'json' | 'csv'): string {
  return buildUrl(`/evaluation-batches/${enc(id)}/export`, { scope, format });
}

/** Audio for a pinned revision: access_path + ?revision=<pinned> per CONTRACTS.md. */
export function audioUrl(accessPath: string, revision: number): string {
  return `${accessPath}?revision=${revision}`;
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
