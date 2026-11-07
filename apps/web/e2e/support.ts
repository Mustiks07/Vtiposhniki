import { expect, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = Number(process.env.CQA_E2E_PORT ?? 8765);
export const servers = {
  complete: `http://127.0.0.1:${base}`,
  partial: `http://127.0.0.1:${base + 1}`,
  failed: `http://127.0.0.1:${base + 2}`,
};

export const here = path.dirname(fileURLToPath(import.meta.url));
export const tmpDir = path.resolve(here, '../../../data/private/c-e2e-tmp');
fs.mkdirSync(tmpDir, { recursive: true });

/** Unique synthetic external IDs per test run, so counts or IDs are never hard-coded. */
export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

type Choice = { id: string; label: string; raw_value: boolean | number | string; anchor: string; score_fraction: string | null };

export function criterion(
  id: string,
  over: Partial<{
    title: string;
    definition: string;
    response_type: 'binary' | 'scale' | 'flag';
    choices: Choice[];
    allow_na: boolean;
    na_condition: string | null;
    weight: string;
    section_id: string | null;
    flag_when_choice_ids: string[];
  }> = {},
) {
  return {
    schema_version: '1.0',
    id,
    title: over.title ?? `Синтетический критерий ${id}`,
    definition: over.definition ?? 'Синтетическое определение для браузерной проверки.',
    response_type: over.response_type ?? 'binary',
    choices: (over.choices ?? [
      { id: 'yes', label: 'Да', raw_value: true, anchor: 'Выполнено', score_fraction: '1' },
      { id: 'no', label: 'Нет', raw_value: false, anchor: 'Не выполнено', score_fraction: '0' },
    ]).map((c) => ({ schema_version: '1.0', ...c })),
    allow_na: over.allow_na ?? false,
    na_condition: over.na_condition ?? null,
    channel_instructions: { schema_version: '1.0', agent_chat: '', voice_call: '', voice_policy_version: 'text-observable-v1' },
    evidence_policy: { schema_version: '1.0', require_evidence: true, missing_action_requires_range: true, allow_source: true },
    requires_reference: false,
    weight: over.weight ?? '10',
    section_id: over.section_id ?? null,
    flag_when_choice_ids: over.flag_when_choice_ids ?? [],
  };
}

export function draft(title: string, criteria: ReturnType<typeof criterion>[], sections: { id: string; title: string }[] = []) {
  return {
    schema_version: '1.0',
    title,
    criteria,
    sections: sections.map((s) => ({ schema_version: '1.0', ...s })),
    rounding: { schema_version: '1.0', mode: 'ROUND_HALF_UP', decimal_places: 2, intermediate_rounding: false },
  };
}

export async function createChecklist(request: APIRequestContext, baseURL: string, body: unknown) {
  const res = await request.post(`${baseURL}/api/v1/checklists`, { data: body });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { checklist_id: string; version_id: string };
}

export function record(externalId: string, over: Partial<{ language: 'RU' | 'KZ' | 'EN'; channel: 'agent_chat' | 'voice_call'; messages: { speaker: string; text: string; timestamp_original: string }[] }> = {}) {
  return {
    external_id: externalId,
    channel: over.channel ?? 'agent_chat',
    language: over.language ?? 'RU',
    messages: over.messages ?? [
      { speaker: 'client', text: 'Синтетический вопрос клиента.', timestamp_original: '00:01' },
      { speaker: 'operator', text: 'Здравствуйте! Синтетический ответ оператора.', timestamp_original: '00:20' },
      { speaker: 'client', text: 'Спасибо.', timestamp_original: '00:45' },
    ],
  };
}

export async function importViaApi(request: APIRequestContext, baseURL: string, records: unknown[]) {
  const res = await request.post(`${baseURL}/api/v1/imports`, { data: { source: 'json', records } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { items: { conversation_id: string; revision: number; disposition: string }[] };
}

/** Writes a JSON file under the ignored private dir for upload through the real file input. */
export function writeTmpJson(name: string, value: unknown): string {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(file, JSON.stringify(value), 'utf-8');
  return file;
}

type Version = { checklist_id: string; version_id: string; title: string; criteria: { id: string; choices: { id: string }[] }[]; sections?: unknown[]; rounding?: unknown };

/** The original rubric seeded by the server from A's domain (found by content, not by ID). */
export async function originalVersion(request: APIRequestContext, baseURL: string): Promise<Version> {
  const list = await (await request.get(`${baseURL}/api/v1/checklists?limit=200`)).json();
  // Oldest first: the seeded original precedes any copies created by tests.
  for (const c of [...list.items].reverse()) {
    const v = (await (await request.get(`${baseURL}/api/v1/checklist-versions/${c.latest_version_id}`)).json()) as Version;
    if (v.criteria.some((x) => x.id === 'c6_dialog_management') && v.criteria.some((x) => x.id === 'c8_gross_errors')) return v;
  }
  throw new Error('Original rubric is not seeded on this server');
}

/** Same rubric with chosen answers moved first (display order only; semantics unchanged). */
export function withFirstChoices(v: Version, title: string, first: Record<string, string>) {
  return {
    schema_version: '1.0',
    title,
    criteria: v.criteria.map((c) => {
      const want = first[c.id];
      if (!want) return c;
      return { ...c, choices: [...c.choices.filter((x) => x.id === want), ...c.choices.filter((x) => x.id !== want)] };
    }),
    sections: v.sections ?? [],
    rounding: v.rounding,
  };
}

export async function runBatchApi(request: APIRequestContext, baseURL: string, conversationIds: string[], versionId: string, mode = 'fresh') {
  const res = await request.post(`${baseURL}/api/v1/evaluation-batches`, {
    data: { conversation_ids: conversationIds, checklist_version_id: versionId, profile_id: 'test-synthetic', mode },
    headers: { 'Idempotency-Key': uid('k') },
  });
  expect(res.status(), await res.text()).toBe(202);
  let batch = await res.json();
  for (let i = 0; i < 60 && batch.jobs.some((j: { state: string }) => ['queued', 'running', 'retry_wait'].includes(j.state)); i++) {
    await new Promise((r) => setTimeout(r, 500));
    batch = await (await request.get(`${baseURL}/api/v1/evaluation-batches/${batch.id}`)).json();
  }
  return batch as { id: string; jobs: { id: string; state: string; evaluation_id: string | null }[] };
}

export async function evaluation(request: APIRequestContext, baseURL: string, id: string) {
  return (await (await request.get(`${baseURL}/api/v1/evaluations/${id}`)).json()) as {
    id: string;
    revision: number;
    automatic_score: { total_score: string | null; status: string };
    effective_score: { total_score: string | null; status: string };
    human_decisions: unknown[];
  };
}

/** Human "changed" decision to a concrete choice through the real appeal workflow. */
export async function decideChoice(request: APIRequestContext, baseURL: string, evaluationId: string, criterionId: string, choiceId: string) {
  const ev = await evaluation(request, baseURL, evaluationId);
  const appeal = await request.post(`${baseURL}/api/v1/evaluations/${evaluationId}/appeals`, {
    data: { criterion_id: criterionId, comment: 'Синтетическая апелляция для проверки поиска.', expected_revision: ev.revision },
  });
  expect(appeal.status(), await appeal.text()).toBe(201);
  const a = await appeal.json();
  const res = await request.post(`${baseURL}/api/v1/appeals/${a.id}/decision`, {
    data: {
      expected_revision: ev.revision,
      decision: 'changed',
      reason: 'Синтетическое решение проверяющего.',
      replacement: {
        criterion_id: criterionId,
        applicability: 'applicable',
        answer_choice_id: choiceId,
        rationale: 'Синтетическое обоснование проверяющего.',
        reason_codes: ['human_changed'],
        evidence: [{ kind: 'range', start_message_id: 'm0001', end_message_id: 'm0002', relation: 'support', explanation: 'Синтетическое основание.' }],
        origin: 'human',
      },
    },
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** Human N/A decision through the real appeal workflow (used to reach MASTER N/A examples). */
export async function decideNa(request: APIRequestContext, baseURL: string, evaluationId: string, criterionId: string) {
  const ev = await evaluation(request, baseURL, evaluationId);
  const appeal = await request.post(`${baseURL}/api/v1/evaluations/${evaluationId}/appeals`, {
    data: { criterion_id: criterionId, comment: 'Синтетическая апелляция: запрос не требовал этого действия.', expected_revision: ev.revision },
  });
  expect(appeal.status(), await appeal.text()).toBe(201);
  const a = await appeal.json();
  const res = await request.post(`${baseURL}/api/v1/appeals/${a.id}/decision`, {
    data: {
      expected_revision: ev.revision,
      decision: 'changed',
      reason: 'Синтетическое решение для эталона расчёта.',
      replacement: {
        criterion_id: criterionId,
        applicability: 'not_applicable',
        answer_choice_id: null,
        rationale: 'Синтетическая причина неприменимости.',
        reason_codes: ['human_changed'],
        evidence: [
          { kind: 'range', start_message_id: 'm0001', end_message_id: 'm0003', relation: 'support', explanation: 'Синтетическое основание: весь разговор.' },
        ],
        origin: 'human',
      },
    },
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** Launches a batch through the UI from the conversation list and waits for final states. */
export async function launchFromList(page: Page, externalIds: string[], checklistTitle: string, mode: 'fresh' | 'reuse_if_compatible' = 'fresh') {
  await page.goto('/#/conversations');
  for (const id of externalIds) {
    await page.getByRole('checkbox', { name: `Выбрать ${id}` }).check();
  }
  await page.getByLabel('Чек-лист', { exact: true }).selectOption({ label: checklistTitle });
  if (mode === 'reuse_if_compatible') await page.getByLabel(/reuse_if_compatible/).check();
  await page.getByRole('button', { name: 'Запустить пакет' }).click();
  await expect(page).toHaveURL(/#\/batches\//);
  await expect(page.getByTestId('batch-progress')).toContainText('Все задания в финальном состоянии', { timeout: 30_000 });
  return page.url().split('#/batches/')[1];
}
