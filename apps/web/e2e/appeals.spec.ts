import { expect, test, type Page } from '@playwright/test';
import { createChecklist, criterion, draft, evaluation, importViaApi, record, runBatchApi, servers, uid } from './support';

async function setup(request: Parameters<typeof importViaApi>[0], base = servers.complete) {
  const title = uid('Апелляции');
  const v = await createChecklist(
    request,
    base,
    draft(title, [criterion('c-greet', { weight: '40', title: 'Приветствие' }), criterion('c-help', { weight: '60', title: 'Помощь' })]),
  );
  const imp = await importViaApi(request, base, [record(uid('appeal'))]);
  const conversationId = imp.items[0].conversation_id;
  const batch = await runBatchApi(request, base, [conversationId], v.version_id);
  return { versionId: v.version_id, conversationId, evaluationId: batch.jobs[0].evaluation_id! };
}

async function fileAppeal(page: Page, evaluationId: string, criterionTitle: string, comment: string) {
  await page.goto(`/#/evaluations/${evaluationId}`);
  await page.getByTestId('criterion-item').filter({ hasText: criterionTitle }).click();
  await page.getByRole('button', { name: 'Оспорить критерий' }).click();
  await page.getByLabel('Комментарий к апелляции').fill(comment);
  await page.getByRole('button', { name: 'Подать апелляцию' }).click();
  await expect(page.getByTestId('appeal').filter({ hasText: comment })).toHaveAttribute('data-state', 'open');
}

async function openInQueue(page: Page, comment: string) {
  await page.goto('/#/appeals');
  const item = page.getByTestId('queue-appeal').filter({ hasText: comment });
  await item.getByRole('button').first().click();
  return item;
}

test('E16: appeal → change and confirm → refresh; automatic unchanged, effective from server', async ({ page, request }) => {
  const { evaluationId } = await setup(request);
  const before = await evaluation(request, servers.complete, evaluationId);
  expect(before.automatic_score.total_score).toBe('100.00');

  const commentChange = uid('Клиента не поприветствовали');
  await fileAppeal(page, evaluationId, 'Приветствие', commentChange);

  const item = await openInQueue(page, commentChange);
  await expect(item.getByTestId('appeal-ai-answer')).toHaveText('Да');
  await expect(item.getByText(commentChange).first()).toBeVisible();
  await expect(item.getByText('Текущие доказательства')).toBeVisible();
  await expect(item.locator('[data-highlighted="true"]').first()).toBeVisible();
  await item.getByLabel('Изменить ответ').check();
  await item.getByLabel(/Новый ответ/).selectOption({ label: 'Нет — Не выполнено (доля 0)' });
  await item.getByLabel('Обоснование нового ответа').fill('В первой реплике оператора нет приветствия.');
  await item.getByLabel('Первая реплика').selectOption('m0002');
  await item.getByLabel('Последняя реплика').selectOption('m0002');
  // Required reason is enforced before sending.
  await item.getByRole('button', { name: 'Сохранить решение' }).click();
  await expect(item.getByText('Укажите причину решения.')).toBeVisible();
  const reason = uid('Проверено по реплике m0002');
  await item.getByLabel('Причина решения').fill(reason);
  await item.getByRole('button', { name: 'Сохранить решение' }).click();
  await expect(page.getByTestId('decision-saved')).toBeVisible();

  // Confirm path on the other criterion.
  const commentConfirm = uid('Сомневаюсь в помощи');
  await fileAppeal(page, evaluationId, 'Помощь', commentConfirm);
  const item2 = await openInQueue(page, commentConfirm);
  await item2.getByLabel('Причина решения').fill('Ответ оценщика подтверждён.');
  await item2.getByRole('button', { name: 'Сохранить решение' }).click();
  await expect(page.getByTestId('decision-saved')).toBeVisible();

  await page.goto(`/#/evaluations/${evaluationId}?criterion=c-greet`);
  await page.reload();
  await expect(page.getByTestId('automatic-total')).toHaveText('100,00 из 100');
  await expect(page.getByTestId('effective-total')).toHaveText('60,00 из 100');
  const cmp = page.getByTestId('decision-comparison');
  await expect(cmp).toContainText('Ответ оценщика: Да');
  await expect(cmp).toContainText('Изменено на «Нет»');
  await expect(cmp).toContainText(reason);
  await expect(cmp).toContainText(commentChange);
  await expect(cmp).toContainText('Итог: automatic 100,00 → effective 60,00');
  await expect(page.getByTestId('appeal').filter({ hasText: commentChange })).toHaveAttribute('data-state', 'resolved');

  await page.getByTestId('criterion-item').filter({ hasText: 'Помощь' }).click();
  await expect(page.getByTestId('decision-comparison')).toContainText('Подтверждено');

  const after = await evaluation(request, servers.complete, evaluationId);
  expect(after.automatic_score).toEqual(before.automatic_score);
  expect(after.effective_score.total_score).toBe('60.00');
});

test('E17: two windows decide the same appeal; the late write is refused and shown as a conflict', async ({ browser, request }) => {
  const { evaluationId } = await setup(request);
  const ctxA = await browser.newContext({ baseURL: servers.complete });
  const ctxB = await browser.newContext({ baseURL: servers.complete });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const comment = uid('Два окна');
  await fileAppeal(a, evaluationId, 'Приветствие', comment);
  const itemA = await openInQueue(a, comment);
  const itemB = await openInQueue(b, comment);

  await itemA.getByLabel('Причина решения').fill('Окно A подтверждает.');
  await itemB.getByLabel('Изменить ответ').check();
  await itemB.getByLabel(/Новый ответ/).selectOption({ label: 'Нет — Не выполнено (доля 0)' });
  await itemB.getByLabel('Обоснование нового ответа').fill('Окно B меняет.');
  await itemB.getByLabel('Первая реплика').selectOption('m0001');
  await itemB.getByLabel('Последняя реплика').selectOption('m0003');
  await itemB.getByLabel('Причина решения').fill('Окно B меняет ответ.');

  await itemA.getByRole('button', { name: 'Сохранить решение' }).click();
  await expect(a.getByTestId('decision-saved')).toBeVisible();
  await itemB.getByRole('button', { name: 'Сохранить решение' }).click();
  await expect(itemB.getByTestId('decision-conflict')).toBeVisible();
  // Input is kept after the conflict.
  await expect(itemB.getByLabel('Причина решения')).toHaveValue('Окно B меняет ответ.');
  await itemB.getByRole('button', { name: 'Обновить данные' }).click();
  await expect(itemB.getByText(/Данные обновлены/)).toBeVisible();

  const ev = await evaluation(request, servers.complete, evaluationId);
  expect(ev.human_decisions.length).toBe(1);
  expect(ev.effective_score.total_score).toBe('100.00');
  await ctxA.close();
  await ctxB.close();
});

test('E18: re-evaluation creates a new card; old card keeps its appeal and decision; new one inherits nothing', async ({ page, request }) => {
  const { evaluationId, conversationId, versionId } = await setup(request);
  const comment = uid('История');
  await fileAppeal(page, evaluationId, 'Приветствие', comment);
  const item = await openInQueue(page, comment);
  await item.getByLabel('Причина решения').fill('Подтверждено до повторной оценки.');
  await item.getByRole('button', { name: 'Сохранить решение' }).click();
  await expect(page.getByTestId('decision-saved')).toBeVisible();

  const batch = await runBatchApi(request, servers.complete, [conversationId], versionId, 'fresh');
  const newId = batch.jobs[0].evaluation_id!;
  expect(newId).not.toBe(evaluationId);

  await page.goto(`/#/conversations/${conversationId}`);
  await expect(page.getByTestId('evaluation-item')).toHaveCount(2);
  await expect(page.getByTestId('evaluation-item').filter({ hasText: 'решений: 1' })).toHaveCount(1);

  await page.goto(`/#/evaluations/${newId}?criterion=c-greet`);
  await expect(page.getByTestId('decision-comparison')).toHaveCount(0);
  await expect(page.getByTestId('appeal')).toHaveCount(0);
  await expect(page.getByTestId('effective-block')).toHaveCount(0);
  await expect(page.getByTestId('effective-total-block')).toContainText('Решений проверяющего нет');

  await page.goto(`/#/evaluations/${evaluationId}?criterion=c-greet`);
  await expect(page.getByTestId('appeal').filter({ hasText: comment })).toHaveAttribute('data-state', 'resolved');
  await expect(page.getByTestId('decision-comparison')).toContainText('Подтверждено');
});

test.describe('partial scenario server', () => {
  test.use({ baseURL: servers.partial });
  test('E06: human decisions closing every undetermined make effective complete while automatic stays partial', async ({ page, request }) => {
    const { evaluationId } = await setup(request, servers.partial);
    for (const [title, label] of [
      ['Приветствие', 'Да — Выполнено (доля 1)'],
      ['Помощь', 'Нет — Не выполнено (доля 0)'],
    ] as const) {
      const comment = uid(`Закрыть ${title}`);
      await fileAppeal(page, evaluationId, title, comment);
      const item = await openInQueue(page, comment);
      await item.getByLabel('Изменить ответ').check();
      await item.getByLabel(/Новый ответ/).selectOption({ label });
      await item.getByLabel('Обоснование нового ответа').fill('Проверяющий определил ответ по тексту.');
      await item.getByLabel('Первая реплика').selectOption('m0001');
      await item.getByLabel('Последняя реплика').selectOption('m0003');
      await item.getByLabel('Причина решения').fill('Неопределённый ответ закрыт человеком.');
      await item.getByRole('button', { name: 'Сохранить решение' }).click();
      await expect(page.getByTestId('decision-saved')).toBeVisible();
    }
    await page.goto(`/#/evaluations/${evaluationId}`);
    await expect(page.getByTestId('automatic-total')).toHaveText('нет итога');
    await expect(page.getByTestId('effective-total')).toHaveText('40,00 из 100');
    await expect(page.getByText(/благодаря решениям проверяющего/)).toBeVisible();
  });
});
