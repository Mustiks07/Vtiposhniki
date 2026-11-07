import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createChecklist, criterion, draft, importViaApi, record, runBatchApi, tmpDir, uid } from './support';

const origin = `http://127.0.0.1:${Number(process.env.CQA_E2E_PORT ?? 8765) + 3}`;
test.use({ baseURL: origin });
const screenshots = path.join(tmpDir, 'audit-fixes');

test('audit: a newly imported valid recording loads and decodes on the first visit', async ({ page, request }) => {
  const imported = await request.post(`${origin}/api/v1/imports`, {
    data: { source: 'organizer_api', group_id: 'audio-initial' },
  });
  expect(imported.status()).toBe(201);
  const cid = (await imported.json()).items[0].conversation_id;
  const before = await (await request.get(`${origin}/api/v1/conversations/${cid}`)).json();
  expect(before.audio.availability).toBe('unknown');
  expect(before.audio.access_path).toBe(`/api/v1/conversations/${cid}/audio`);
  const audioRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes(`/conversations/${cid}/audio`)) audioRequests.push(r.url());
  });
  await page.goto(`/#/conversations/${cid}`);
  const player = page.getByTestId('audio-player');
  await expect(player).toBeVisible();
  await expect.poll(() => player.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  expect(audioRequests.length).toBeGreaterThan(0);
  expect(audioRequests.every((url) => url.startsWith(origin))).toBe(true);
  await expect(page.getByRole('status')).toContainText('готова');
  await expect(page.getByTestId('audio-alignment')).toContainText('не подтверждена');
  await expect(page.getByRole('button', { name: /запись с/ })).toHaveCount(0);
  await expect
    .poll(async () => (await (await request.get(`${origin}/api/v1/conversations/${cid}`)).json()).audio.availability)
    .toBe('available');
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({
    path: path.join(screenshots, 'audio-first-open.png'),
  });
});

test('audit: adding audio to unchanged text makes it playable; a failed media request can be retried', async ({
  page,
  request,
}) => {
  let cid = '';
  for (const group_id of ['audio-late-without', 'audio-late-with']) {
    const imported = await request.post(`${origin}/api/v1/imports`, {
      data: { source: 'organizer_api', group_id },
    });
    expect(imported.status()).toBe(201);
    const item = (await imported.json()).items[0];
    if (cid) {
      expect(item.conversation_id).toBe(cid);
      expect(item.disposition).toBe('unchanged');
      expect(item.revision).toBe(1);
    }
    cid = item.conversation_id;
  }
  await page.goto(`/#/conversations/${cid}`);
  await expect
    .poll(() => page.getByTestId('audio-player').evaluate((element: HTMLAudioElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
  const imported = await request.post(`${origin}/api/v1/imports`, {
    data: { source: 'organizer_api', group_id: 'audio-retry' },
  });
  cid = (await imported.json()).items[0].conversation_id;
  await page.goto(`/#/conversations/${cid}`);
  await expect(page.getByRole('status')).toContainText('Не удалось');
  await page.getByRole('button', { name: 'Повторить загрузку записи' }).click();
  await expect(page.getByRole('status')).toContainText('готова');
  await expect
    .poll(() => page.getByTestId('audio-player').evaluate((element: HTMLAudioElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
});

test('audit: retry and reuse show the current job spend and keep source provenance separate', async ({
  page,
  request,
}) => {
  const version = await createChecklist(
    request,
    origin,
    draft(uid('Учебная проверка расходов'), [criterion('audit-cost')]),
  );
  const imported = await importViaApi(request, origin, [record(uid('Учебный разговор'))]);
  const cid = imported.items[0].conversation_id;
  const batch = await runBatchApi(request, origin, [cid], version.version_id);
  expect(batch.jobs[0].state).toBe('succeeded');
  const eid = batch.jobs[0].evaluation_id!;
  const original = await (await request.get(`${origin}/api/v1/evaluations/${eid}`)).json();
  await page.goto(`/#/evaluations/${eid}`);
  await page.getByTestId('run-details').locator('summary').first().click();
  await expect(page.getByTestId('total-cost')).toContainText('0,75 USD');
  await expect(page.getByTestId('current-run').locator('tbody tr')).toHaveCount(2);
  await expect(page.getByTestId('run-attempts').locator('summary')).toContainText('(2)');
  const exported = await (await request.get(`${origin}/api/v1/evaluations/${eid}/export`)).json();
  expect(Number(exported.items[0].cost)).toBe(0.75);
  fs.mkdirSync(screenshots, { recursive: true });
  await page.getByTestId('run-details').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshots, 'retry-cost.png') });

  const reused = await runBatchApi(request, origin, [cid], version.version_id, 'reuse_if_compatible');
  const reusedId = reused.jobs[0].evaluation_id!;
  await page.goto(`/#/evaluations/${reusedId}`);
  // The details may stay open while React reuses the page for another evaluation.
  const details = page.getByTestId('run-details');
  if ((await details.getAttribute('open')) === null) await details.locator('summary').first().click();
  await expect(page.getByTestId('total-cost')).toContainText(': 0 USD');
  await expect(page.getByTestId('current-run')).toContainText('Новых вызовов не было');
  await expect(page.getByTestId('current-run').locator('tbody tr')).toHaveCount(0);
  await page.getByTestId('source-calls').locator('summary').click();
  await expect(page.getByTestId('source-calls')).toContainText('0,25 USD');
  await expect(page.getByTestId('source-calls')).toContainText('не добавляются');
  const current = await (await request.get(`${origin}/api/v1/evaluations/${reusedId}`)).json();
  expect(current.artifact).toEqual(original.artifact);
  expect(current.run.job.id).not.toBe(original.run.job.id);
  const reusedExport = await (await request.get(`${origin}/api/v1/evaluations/${reusedId}/export`)).json();
  expect(reusedExport.items[0].cost).toBe('0');
  await details.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshots, 'reuse-cost.png') });
});
