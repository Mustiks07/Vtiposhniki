import { expect, test, type Page } from '@playwright/test';
import { createChecklist, criterion, draft, importViaApi, launchFromList, record, servers, uid } from './support';

async function fillCriterion(page: Page, index: number, v: { title: string; definition: string; weight?: string }) {
  const block = page.getByTestId('editor-criterion').nth(index);
  await block.getByLabel('Название', { exact: true }).fill(v.title);
  await block.getByLabel('Определение').fill(v.definition);
  if (v.weight) await block.getByLabel('Вес').fill(v.weight);
  return block;
}

test('E08: an unknown criterion created in the editor reaches the real API and the card', async ({ page }) => {
  const title = uid('E08 чек-лист');
  await page.goto('/#/checklists/new');
  await page.getByLabel('Название чек-листа').fill(title);
  await fillCriterion(page, 0, { title: 'Приветствие', definition: 'Оператор поздоровался.', weight: '30' });
  await page.getByRole('button', { name: '+ Критерий' }).click();
  const block = await fillCriterion(page, 1, { title: 'Неизвестный критерий: упомянут номер заявки', definition: 'Оператор назвал номер заявки клиенту.', weight: '70' });
  // fill anchors (required)
  for (const b of [page.getByTestId('editor-criterion').nth(0), block]) {
    await b.getByLabel('Смысл ступени варианта 1').fill('Выполнено');
    await b.getByLabel('Смысл ступени варианта 2').fill('Не выполнено');
  }
  await page.getByRole('button', { name: 'Создать чек-лист' }).click();
  await expect(page.getByTestId('version-saved')).toBeVisible();

  const id = uid('e08');
  await importViaApi(page.request, servers.complete, [record(id)]);
  await launchFromList(page, [id], title);
  await page.getByRole('link', { name: /карточка/ }).click();
  await expect(page.getByTestId('criterion-item').filter({ hasText: 'Неизвестный критерий: упомянут номер заявки' })).toBeVisible();
  await page.getByTestId('criterion-item').filter({ hasText: 'Неизвестный критерий' }).click();
  await expect(page.getByTestId('weighted')).toHaveText('70 / 70');
});

test('E09: non-zero/reverse scale needs explicit mapping; invalid fraction is rejected, valid one saved', async ({ page }) => {
  const title = uid('E09 шкала');
  await page.goto('/#/checklists/new');
  await page.getByLabel('Название чек-листа').fill(title);
  const block = await fillCriterion(page, 0, { title: 'Шкала 1–3', definition: 'Синтетическая шкала с ненулевой нижней ступенью.', weight: '10' });
  await block.getByLabel('Тип ответа').selectOption('scale');
  await block.getByRole('button', { name: '+ Вариант' }).click();
  const rows = [
    ['низко', '1', '0'],
    ['средне', '2', '0.5'],
    ['высоко', '3', '1.5'],
  ];
  for (let i = 0; i < rows.length; i++) {
    await block.getByLabel(`Подпись варианта ${i + 1}`).fill(rows[i][0]);
    await block.getByLabel(`raw_value варианта ${i + 1}`).fill(rows[i][1]);
    await block.getByLabel(`Смысл ступени варианта ${i + 1}`).fill(`ступень ${rows[i][1]}`);
    await block.getByLabel(`Доля варианта ${i + 1}`).fill(rows[i][2]);
  }
  // raw/max suggestion is refused for a non-zero lowest step.
  await block.getByRole('button', { name: 'Предложить доли raw/max' }).click();
  await expect(block.getByText(/только для целочисленной шкалы с нижней ступенью 0/)).toBeVisible();

  await page.getByRole('button', { name: 'Создать чек-лист' }).click();
  await expect(block.getByText('Доля не может быть больше 1.')).toBeVisible();
  await expect(block.getByText(/подтвердите отображение ответов в доли/)).toBeVisible();
  await expect(page.getByTestId('version-saved')).toHaveCount(0);

  await block.getByLabel('Доля варианта 3').fill('1');
  await block.getByLabel(/Подтверждаю отображение ответов в доли/).check();
  await page.getByRole('button', { name: 'Создать чек-лист' }).click();
  await expect(page.getByTestId('version-saved')).toBeVisible();
  await page.getByRole('link', { name: 'К версиям чек-листа' }).click();
  const snap = page.getByTestId('snapshot-criterion').first();
  await expect(snap).toContainText('ступень 3');
  await expect(snap.locator('tbody tr').nth(2)).toContainText('1');
});

test('E10: batch stays pinned to the old version; a new run uses the new version; old card keeps old rules', async ({ page, request }) => {
  const title = uid('E10 чек-лист');
  const v1 = await createChecklist(request, servers.complete, draft(title, [criterion('c-a', { weight: '10', title: 'Старое название' })]));
  const id = uid('e10');
  await importViaApi(request, servers.complete, [record(id)]);
  const batch1 = await launchFromList(page, [id], title);
  const firstCard = await page.getByRole('link', { name: /карточка/ }).getAttribute('href');

  await page.goto(`/#/checklists/${v1.checklist_id}`);
  await page.getByRole('link', { name: 'Редактировать (новая версия)' }).click();
  await page.getByTestId('editor-criterion').first().getByLabel('Название', { exact: true }).fill('Новое название');
  await page.getByRole('button', { name: 'Сохранить как новую версию' }).click();
  await expect(page.getByTestId('version-saved')).toBeVisible();
  await expect(page.getByTestId('diff-item')).toContainText('название');
  const v2 = (await page.getByTestId('version-saved').locator('code').textContent())!;
  expect(v2).not.toBe(v1.version_id);

  const b1 = await (await request.get(`${servers.complete}/api/v1/evaluation-batches/${batch1}`)).json();
  expect(b1.checklist_version_id).toBe(v1.version_id);

  await page.getByRole('link', { name: 'Запустить оценку с этой версией' }).click();
  await page.getByRole('checkbox', { name: `Выбрать ${id}` }).check();
  await expect(page.getByLabel('Версия чек-листа (закрепляется при запуске)')).toHaveValue(v2);
  await page.getByRole('button', { name: 'Запустить пакет' }).click();
  await expect(page.getByTestId('batch-progress')).toContainText('Все задания в финальном состоянии');
  await expect(page.locator('.meta')).toContainText(v2);

  await page.goto(`/${firstCard}`);
  await expect(page.getByTestId('criterion-item').first()).toContainText('Старое название');
});

test('E11: weight-only change shows server provenance for reuse; fresh is not masked as reused', async ({ page, request }) => {
  const title = uid('E11 чек-лист');
  const v1 = await createChecklist(request, servers.complete, draft(title, [criterion('c-a', { weight: '10' }), criterion('c-b', { weight: '30' })]));
  const id = uid('e11');
  await importViaApi(request, servers.complete, [record(id)]);
  await launchFromList(page, [id], title);

  await page.goto(`/#/checklists/${v1.checklist_id}/edit`);
  await page.getByTestId('editor-criterion').first().getByLabel('Вес').fill('20');
  await expect(page.getByTestId('scoring-only-note')).toBeVisible();
  await page.getByRole('button', { name: 'Сохранить как новую версию' }).click();
  await expect(page.getByTestId('version-saved')).toBeVisible();

  await launchFromList(page, [id], title, 'reuse_if_compatible');
  await page.getByRole('link', { name: /карточка/ }).click();
  await page.getByText('Детали запуска: версии, модели, стоимость').click();
  const reuse = page.getByTestId('reuse-provenance');
  await expect(reuse).toBeVisible();
  const reusedText = (await reuse.textContent()) ?? '';

  await launchFromList(page, [id], title, 'fresh');
  await page.getByRole('link', { name: /карточка/ }).click();
  await page.getByText('Детали запуска: версии, модели, стоимость').click();
  await expect(page.getByTestId('reuse-provenance')).toContainText('Новый вызов оценщика (режим fresh)');
  // Record what the server reported for reuse (B decides whether reuse applied).
  test.info().annotations.push({ type: 'reuse-provenance', description: reusedText.trim() });
});
