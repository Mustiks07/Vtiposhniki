import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createChecklist, criterion, draft, evaluation, importViaApi, record, runBatchApi, servers, tmpDir, uid } from './support';

test('advisory opinion keeps assessment and appeal unchanged, retains cost history and opens evidence', async ({ page, request }) => {
  const version = await createChecklist(request, servers.complete, draft(uid('Второе мнение'), [criterion('help', { title: 'Понятная помощь' })]));
  const imported = await importViaApi(request, servers.complete, [record(uid('opinion'))]);
  const batch = await runBatchApi(request, servers.complete, [imported.items[0].conversation_id], version.version_id);
  const eid = batch.jobs[0].evaluation_id!;
  const before = await evaluation(request, servers.complete, eid);
  const created = await request.post(`${servers.complete}/api/v1/evaluations/${eid}/appeals`, {
    data: { criterion_id: 'help', comment: 'Выдуманный пример: проверьте правило по всему разговору.', expected_revision: before.revision },
  });
  expect(created.status()).toBe(201);
  const appeal = await created.json();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/#/appeals?appeal=${appeal.id}`);
  const panel = page.getByRole('region', { name: 'Второе мнение AI', exact: true });
  await panel.getByRole('button', { name: 'Получить второе мнение', exact: true }).click();
  await expect(panel.getByText('Тестовая подсказка · не AI-анализ', { exact: true })).toBeVisible();
  await expect(panel).toContainText('test-second-opinion');
  await panel.getByText('Журнал вызовов и расходов подсказки', { exact: true }).click();
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.locator('tbody')).toContainText('0 USD');
  await panel.getByRole('button', { name: /включительно/ }).click();
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(3);
  expect(await evaluation(request, servers.complete, eid)).toEqual(before);
  const history = await (await request.get(`${servers.complete}/api/v1/appeals/${appeal.id}/second-opinions`)).json();
  expect(history.total).toBe(1);
  expect(history.items[0].calls).toHaveLength(1);
  await page.reload();
  await expect(panel.getByText('Тестовая подсказка · не AI-анализ', { exact: true })).toBeVisible();
  const screenshots = path.join(tmpDir, 'second-opinion');
  fs.mkdirSync(screenshots, { recursive: true });
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshots, 'laptop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(screenshots, 'narrow.png') });
});
