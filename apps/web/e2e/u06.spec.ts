import { expect, test } from '@playwright/test';
import { createChecklist, criterion, draft, evaluation, importViaApi, record, runBatchApi, servers, uid } from './support';

test('U06: definition changed in the UI → new version saved → fresh run applies it; old card keeps old rules', async ({ page, request }) => {
  const base = servers.complete;
  const title = uid('U06 чек-лист');
  const v1 = await createChecklist(
    request,
    base,
    draft(title, [criterion('u6-greet', { weight: '50', title: 'Приветствие', definition: 'Старое определение: оператор поздоровался.' })]),
  );
  const externalId = uid('u06');
  const imp = await importViaApi(request, base, [record(externalId)]);
  const first = await runBatchApi(request, base, [imp.items[0].conversation_id], v1.version_id);
  const oldEvaluationId = first.jobs[0].evaluation_id!;

  // Editor: change the definition and the weight, add a new criterion whose first answer is «Нет».
  await page.goto(`/#/checklists/${v1.checklist_id}`);
  await page.getByRole('link', { name: 'Редактировать (новая версия)' }).click();
  const greet = page.getByTestId('editor-criterion').first();
  await greet.getByLabel('Определение').fill('Новое определение: оператор поздоровался и представился по имени.');
  await greet.getByLabel('Вес').fill('30');
  await page.getByRole('button', { name: '+ Критерий' }).click();
  const added = page.getByTestId('editor-criterion').nth(1);
  await added.getByLabel('Название', { exact: true }).fill('Резюме разговора');
  await added.getByLabel('Определение').fill('Оператор подвёл итог разговора.');
  await added.getByLabel('Вес').fill('70');
  await added.getByLabel('Смысл ступени варианта 1').fill('Итог подведён');
  await added.getByLabel('Смысл ступени варианта 2').fill('Итога нет');
  await added.getByRole('button', { name: 'Вариант 1 ниже' }).click(); // «Нет» becomes the first choice
  await expect(page.getByTestId('scoring-only-note')).toHaveCount(0); // semantic change, not weight-only
  await page.getByRole('button', { name: 'Сохранить как новую версию' }).click();
  await expect(page.getByTestId('version-saved')).toBeVisible();
  const diff = page.getByTestId('version-diff');
  await expect(diff.getByTestId('diff-item').filter({ hasText: 'Приветствие' })).toContainText('определение');
  await expect(diff.getByTestId('diff-item').filter({ hasText: 'Приветствие' })).toContainText('вес');
  await expect(diff.getByTestId('diff-item').filter({ hasText: 'Резюме разговора' })).toHaveAttribute('data-kind', 'added');
  const v2 = (await page.getByTestId('version-saved').locator('code').textContent())!;

  // Fresh run with the new version from the UI.
  await page.getByRole('link', { name: 'Запустить оценку с этой версией' }).click();
  await page.getByRole('checkbox', { name: `Выбрать ${externalId}` }).check();
  await page.getByRole('button', { name: /Оценить выбранные/ }).click();
  await expect(page.getByLabel('Версия чек-листа (закрепляется при запуске)')).toHaveValue(v2);
  await expect(page.getByRole('radio', { name: /Новый анализ/ })).toBeChecked();
  await page.getByRole('button', { name: 'Запустить пакет' }).click();
  await expect(page.getByTestId('batch-progress')).toContainText('Все задания в финальном состоянии');
  await page.getByRole('link', { name: /карточка/ }).click();

  // New rules applied: new definition, new criterion, server arithmetic 30·1 + 70·0 over 100 = 30,00.
  await page.getByTestId('criterion-item').filter({ hasText: 'Приветствие' }).click();
  await expect(page.getByTestId('criterion-detail')).toContainText('Новое определение: оператор поздоровался и представился по имени.');
  await expect(page.getByTestId('weighted')).toHaveText('30 / 30');
  await expect(page.getByTestId('criterion-item').filter({ hasText: 'Резюме разговора' })).toContainText('Нет');
  await expect(page.getByTestId('automatic-total')).toHaveText('30,00 из 100');
  await page.getByText('Детали запуска: версии, модели, стоимость').click();
  await expect(page.getByTestId('reuse-provenance')).toContainText('Новый вызов оценщика (режим fresh)');
  await expect(page.getByTestId('run-details')).toContainText(v2);

  // The old card keeps the old version, definition and total.
  await page.goto(`/#/evaluations/${oldEvaluationId}?criterion=u6-greet`);
  await expect(page.getByTestId('criterion-detail')).toContainText('Старое определение: оператор поздоровался.');
  await expect(page.getByTestId('automatic-total')).toHaveText('100,00 из 100');
  const old = await evaluation(request, base, oldEvaluationId);
  expect(old.automatic_score.total_score).toBe('100.00');
});
