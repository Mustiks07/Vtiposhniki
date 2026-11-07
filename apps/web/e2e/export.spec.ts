import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { createChecklist, criterion, decideNa, draft, importViaApi, record, runBatchApi, servers, uid } from './support';

const CSV_COLUMNS =
  'schema_version,scope,batch_id,job_id,evaluation_id,conversation_id,conversation_revision,checklist_version_id,profile_id,' +
  'profile_version,corpus_snapshot_id,evaluation_revision,job_state,evaluation_status,score_status,total_score,criterion_id,' +
  'applicability,answer_choice_id,origin,reason_codes,evidence,score_fraction,earned_weight,applicable_weight,' +
  'normalized_contribution,flag_detected,decisions,error_code,limitation_codes,cost,cost_complete,currency';

async function download(page: Page, scope: 'automatic' | 'effective', format: 'json' | 'csv'): Promise<string> {
  await page.getByRole('radio', { name: scope === 'automatic'
    ? 'Оценка AI — исходный результат оценщика'
    : 'После пересмотра — с учётом решений проверяющего', exact: true }).check();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(`export-${format}`).click()]);
  return fs.readFileSync((await file.path())!, 'utf-8');
}

test('E19: evaluation export JSON/CSV follows the chosen scope; no transcript or free text', async ({ page, request }) => {
  const title = uid('E19 экспорт');
  const v = await createChecklist(request, servers.complete, draft(title, [criterion('x-a', { weight: '40', allow_na: true, na_condition: 'Синтетическое условие N/A.' }), criterion('x-b', { weight: '60' })]));
  const secret = 'Уникальный текст транскрипта для проверки экспорта';
  const imp = await importViaApi(request, servers.complete, [
    record(uid('e19'), {
      messages: [
        { speaker: 'client', text: secret, timestamp_original: '00:01' },
        { speaker: 'operator', text: 'Здравствуйте!', timestamp_original: '00:05' },
        { speaker: 'client', text: 'Спасибо.', timestamp_original: '00:09' },
      ],
    }),
  ]);
  const batch = await runBatchApi(request, servers.complete, [imp.items[0].conversation_id], v.version_id);
  const evaluationId = batch.jobs[0].evaluation_id!;
  await decideNa(request, servers.complete, evaluationId, 'x-a');

  await page.goto(`/#/evaluations/${evaluationId}`);
  const automatic = JSON.parse(await download(page, 'automatic', 'json'));
  const effective = JSON.parse(await download(page, 'effective', 'json'));
  expect(automatic.scope).toBe('automatic');
  expect(effective.scope).toBe('effective');
  expect(automatic.items[0].total_score).toBe('100.00');
  expect(effective.items[0].total_score).toBe('100.00');
  expect(automatic.items[0].criteria.find((c: { criterion_id: string }) => c.criterion_id === 'x-a').applicability).toBe('applicable');
  expect(effective.items[0].criteria.find((c: { criterion_id: string }) => c.criterion_id === 'x-a').applicability).toBe('not_applicable');
  expect(effective.items[0].decisions.length).toBe(1);

  const csv = await download(page, 'effective', 'csv');
  expect(csv.replace(/^﻿/, '').split(/\r\n/)[0]).toBe(CSV_COLUMNS);
  expect(csv).toContain('\r\n');
  for (const text of [JSON.stringify(automatic), JSON.stringify(effective), csv]) {
    expect(text).not.toContain(secret);
    expect(text).not.toContain('Синтетическая причина неприменимости');
  }
});

test.describe('failed scenario server', () => {
  test.use({ baseURL: servers.failed });
  test('E19: batch export keeps failed items and leaves unknown cost empty, not zero', async ({ page, request }) => {
    const title = uid('E19 пакет');
    const v = await createChecklist(request, servers.failed, draft(title, [criterion('f-a')]));
    const imp = await importViaApi(request, servers.failed, [record(uid('e19-f1')), record(uid('e19-f2'))]);
    const batch = await runBatchApi(request, servers.failed, imp.items.map((i) => i.conversation_id), v.version_id);
    await page.goto(`/#/batches/${batch.id}`);
    await expect(page.getByTestId('job-row')).toHaveCount(2);
    const json = JSON.parse(await download(page, 'automatic', 'json'));
    expect(json.batch_id).toBe(batch.id);
    expect(json.items).toHaveLength(2);
    for (const item of json.items) {
      expect(item.job_state).toBe('failed');
      expect(item.error_code).toBeTruthy();
      expect(item.total_score).toBeNull();
      if (!item.cost_complete) expect(item.cost === null || item.cost === undefined).toBe(true);
    }
    const csv = await download(page, 'automatic', 'csv');
    const rows = csv.replace(/^﻿/, '').trim().split(/\r\n/);
    expect(rows.length).toBe(3); // header + one row per failed item (no criterion rows)
    expect(rows.slice(1).every((r) => r.includes(',failed,'))).toBe(true);
  });
});
