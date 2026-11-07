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
