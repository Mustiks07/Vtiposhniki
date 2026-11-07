import { expect, test } from '@playwright/test';
import type { Appeal, AppealPage, Decision } from '../src/api/types';
import { createChecklist, criterion, draft, evaluation, importViaApi, record, runBatchApi, servers, uid } from './support';

const base = servers.complete;

test('appeals pagination: forward, back and page restored from the URL', async ({ page, request }) => {
  // 30 criteria → 30 open appeals on one evaluation (one open appeal per evaluation+criterion).
  const ids = Array.from({ length: 30 }, (_, i) => `p-${String(i + 1).padStart(2, '0')}`);
  const v = await createChecklist(request, base, draft(uid('Пагинация'), ids.map((id) => criterion(id, { weight: '1' }))));
  const imp = await importViaApi(request, base, [record(uid('pages'))]);
  const batch = await runBatchApi(request, base, [imp.items[0].conversation_id], v.version_id);
  const evaluationId = batch.jobs[0].evaluation_id!;
  const ev = await evaluation(request, base, evaluationId);
  const marker = uid('страница');
  // Include mixed states even when this spec runs alone: "all" must not be treated
  // as the first "open" page. A resolved appeal permits a new one on the same criterion.
  const resolvedResponse = await request.post(`${base}/api/v1/evaluations/${evaluationId}/appeals`, {
    data: { criterion_id: ids[0], comment: `${marker} resolved`, expected_revision: ev.revision },
  });
  expect(resolvedResponse.status(), await resolvedResponse.text()).toBe(201);
  const resolved = (await resolvedResponse.json()) as Appeal;
  const decisionResponse = await request.post(`${base}/api/v1/appeals/${resolved.id}/decision`, {
    data: { decision: 'confirmed', reason: 'Синтетическое подтверждение для проверки фильтра.', expected_revision: ev.revision },
  });
  expect(decisionResponse.status(), await decisionResponse.text()).toBe(200);
  const decision = (await decisionResponse.json()) as Decision;
  for (const id of ids) {
    const res = await request.post(`${base}/api/v1/evaluations/${evaluationId}/appeals`, {
      data: { criterion_id: id, comment: `${marker} ${id}`, expected_revision: decision.revision },
    });
    expect(res.status(), await res.text()).toBe(201);
  }
  const total = (await (await request.get(`${base}/api/v1/appeals?state=open&limit=1`)).json()).total as number;
  expect(total).toBeGreaterThan(25);

  await page.goto('/#/appeals');
  const range = page.getByTestId('pager-range');
  const rows = page.getByTestId('queue-appeal');
  const headers = rows.locator('.appeal-head');
  await expect(range).toHaveText(`1–25 из ${total}`);
  await expect(rows).toHaveCount(25);
  const firstPage = await headers.allTextContents();

  await page.getByRole('button', { name: 'Вперёд →' }).click();
  await expect(page).toHaveURL(/offset=25/);
  await expect(range).toHaveText(`26–${Math.min(50, total)} из ${total}`);
  // The URL/pager changes before keepPreviousData replaces the old rows. Check their
  // identities too: both pages can contain 25 rows. Headers exclude expanded review content.
  await expect(rows).toHaveCount(Math.min(25, total - 25));
  await expect.poll(() => headers.allTextContents()).not.toEqual(firstPage);
  const secondPage = await headers.allTextContents();
  expect(secondPage.some((t) => firstPage.includes(t))).toBe(false);

  // Opening an appeal keeps the page.
  await page.getByTestId('queue-appeal').first().getByRole('button').first().click();
  await expect(page).toHaveURL(/offset=25/);
  await expect(range).toHaveText(`26–${Math.min(50, total)} из ${total}`);

  // Restored from the URL after refresh.
  await page.reload();
  await expect(range).toHaveText(`26–${Math.min(50, total)} из ${total}`);
  await expect(page).toHaveURL(/offset=25/);
  await expect(headers).toHaveText(secondPage);

  await page.getByRole('button', { name: '← Назад' }).click();
  await expect(page).not.toHaveURL(/offset=/);
  await expect(range).toHaveText(`1–25 из ${total}`);
  await expect(headers).toHaveText(firstPage);

  // A filter change returns to the first page.
  await page.goto('/#/appeals?offset=25');
  await expect(range).toHaveText(`26–${Math.min(50, total)} из ${total}`);
  await expect(headers).toHaveText(secondPage);
  const allResponse = await request.get(`${base}/api/v1/appeals?limit=25&offset=0`);
  expect(allResponse.status(), await allResponse.text()).toBe(200);
  const allPage = (await allResponse.json()) as AppealPage;
  expect(allPage.total).toBeGreaterThan(total);
  await page.getByLabel('Состояние').selectOption('all');
  await expect(page).not.toHaveURL(/offset=/);
  await expect(range).toHaveText(`1–${allPage.items.length} из ${allPage.total}`);
  await expect(rows).toHaveCount(allPage.items.length);
  await expect(headers.locator('.clamp')).toHaveText(allPage.items.map((appeal) => appeal.comment));
  await expect.poll(() => rows.evaluateAll((items) => items.map((item) => item.getAttribute('data-state'))))
    .toEqual(allPage.items.map((appeal) => appeal.state));
});

test('editor: changing an existing scale into a reverse mapping needs a new confirmation', async ({ page, request }) => {
  const scale = criterion('sc-1', {
    response_type: 'scale',
    title: 'Прямая шкала',
    weight: '10',
    choices: [
      { id: 'hi', label: 'высоко', raw_value: 2, anchor: 'ступень 2', score_fraction: '1' },
      { id: 'mid', label: 'средне', raw_value: 1, anchor: 'ступень 1', score_fraction: '0.5' },
      { id: 'lo', label: 'низко', raw_value: 0, anchor: 'ступень 0', score_fraction: '0' },
    ],
  });
  const v = await createChecklist(request, base, draft(uid('Шкала'), [scale]));
  await page.goto(`/#/checklists/${v.checklist_id}/edit`);
  const block = page.getByTestId('editor-criterion').first();
  await expect(block.getByLabel(/Подтверждаю отображение/)).toHaveCount(0);
  await block.getByLabel('Доля варианта 1').fill('0');
  await block.getByLabel('Доля варианта 3').fill('1');
  const box = block.getByLabel(/Подтверждаю отображение ответов в доли/);
  await expect(box).not.toBeChecked();
  await page.getByRole('button', { name: 'Сохранить как новую версию' }).click();
  await expect(block.getByText(/подтвердите отображение ответов в доли/)).toBeVisible();
  await expect(page.getByTestId('version-saved')).toHaveCount(0);

  await box.check();
  await block.getByLabel('Доля варианта 2').fill('0.4');
  await expect(block.getByLabel(/Подтверждаю отображение/)).not.toBeChecked();
  await block.getByLabel(/Подтверждаю отображение/).check();
  await block.getByLabel('Вес').fill('12');
  await expect(block.getByLabel(/Подтверждаю отображение/)).toBeChecked();
  await page.getByRole('button', { name: 'Сохранить как новую версию' }).click();
  await expect(page.getByTestId('version-saved')).toBeVisible();
});

test('editor: another author saves v2 while a v1 draft is open → 409, draft kept, explicit rebase', async ({ page, request }) => {
  const title = uid('Конкурентная правка');
  const v1 = await createChecklist(request, base, draft(title, [criterion('k-1', { title: 'Исходный критерий' })]));
  await page.goto(`/#/checklists/${v1.checklist_id}/edit`);
  const block = page.getByTestId('editor-criterion').first();
  await block.getByLabel('Название', { exact: true }).fill('Моя правка');

  // Another author creates v2 through the real API.
  const other = await request.post(`${base}/api/v1/checklists/${v1.checklist_id}/versions`, {
    data: { expected_latest_version_id: v1.version_id, config: draft(title, [criterion('k-1', { title: 'Правка другого автора' })]) },
  });
  expect(other.status(), await other.text()).toBe(201);
  const v2 = (await other.json()).version_id as string;

  // Navigating away and back inside the app would refetch; here the stale draft is saved directly.
  await page.getByRole('button', { name: 'Сохранить как новую версию' }).click();
  const conflict = page.getByTestId('version-conflict');
  await expect(conflict).toBeVisible();
  await expect(block.getByLabel('Название', { exact: true })).toHaveValue('Моя правка');
  const versions = (await (await request.get(`${base}/api/v1/checklists/${v1.checklist_id}/versions`)).json()).items;
  expect(versions).toHaveLength(2);

  await conflict.getByRole('button', { name: 'Сверить с последней версией' }).click();
  await expect(conflict.getByTestId('diff-item')).toContainText('Правка другого автора');
  await conflict.getByRole('button', { name: /Изменения учтены/ }).click();
  await page.getByRole('button', { name: 'Сохранить как новую версию' }).click();
  await expect(page.getByTestId('version-saved')).toBeVisible();
  const after = (await (await request.get(`${base}/api/v1/checklists/${v1.checklist_id}/versions`)).json()).items;
  expect(after).toHaveLength(3);
  expect(after.some((v: { version_id: string }) => v.version_id === v2)).toBe(true);
});
