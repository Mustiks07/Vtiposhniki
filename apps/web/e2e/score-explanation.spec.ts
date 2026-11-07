// "Почему снижена оценка" on the REAL backend (explicit test evaluator, invented dialogs)
// and the onboarding example, which must not write anything to the API.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createChecklist, criterion, decideChoice, draft, importViaApi, record, runBatchApi, servers, tmpDir, uid } from './support';

const shots = path.join(tmpDir, 'score-explanation');
fs.mkdirSync(shots, { recursive: true });

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

/** The synthetic evaluator answers with the first choice of every criterion. */
async function setup(request: Parameters<typeof createChecklist>[0]) {
  const v = await createChecklist(request, servers.complete, draft(uid('Причины'), [
    criterion('why-ok', { title: 'Приветствие', weight: '50' }),
    // Reversed scale: the first choice is labelled «Да» but is worth 0 — still a reduction.
    criterion('why-rev', {
      title: 'Очень длинное название пользовательского критерия с обратной шкалой, чтобы проверить перенос строк в блоке причин',
      weight: '50',
      choices: [
        { id: 'yes', label: 'Да', raw_value: true, anchor: 'Нежелательное действие было', score_fraction: '0' },
        { id: 'no', label: 'Нет', raw_value: false, anchor: 'Нежелательного действия не было', score_fraction: '1' },
      ],
    }),
    criterion('why-risk', {
      title: 'Раскрытие данных',
      response_type: 'flag',
      weight: '0',
      choices: [
        { id: 'yes', label: 'Да', raw_value: true, anchor: 'Нарушение', score_fraction: null },
        { id: 'no', label: 'Нет', raw_value: false, anchor: 'Нет нарушения', score_fraction: null },
      ],
      flag_when_choice_ids: ['yes'],
    }),
  ]));
  const cid = (await importViaApi(request, servers.complete, [record(uid('ПРИЧИНЫ'))])).items[0].conversation_id;
  const id = (await runBatchApi(request, servers.complete, [cid], v.version_id)).jobs[0].evaluation_id!;
  return id;
}

test('real card: the reduced criterion, its weights and evidence; critical stays separate', async ({ page, request }) => {
  const id = await setup(request);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/#/evaluations/${id}?scope=automatic`);
  const why = page.getByTestId('score-explanation');
  await expect(why.getByRole('heading', { name: 'Почему снижена оценка' })).toBeVisible();
  const reasons = why.getByTestId('why-reduction');
  await expect(reasons).toHaveCount(1);
  await expect(reasons.first()).toHaveAttribute('data-criterion-id', 'why-rev');
  await expect(reasons.first().getByTestId('why-answer')).toHaveText('Да');
  await expect(reasons.first().getByTestId('why-weight')).toHaveText('0 из 50');
  await expect(why.getByTestId('why-critical-block')).toContainText('не меняет и не обнуляет итог');
  // The block sits before the run summary and the criteria list.
  expect(
    await page.evaluate(() => {
      const w = document.querySelector('[data-testid="score-explanation"]');
      const r = document.querySelector('[data-testid="run-summary"]');
      return Boolean(w && r && w.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  ).toBe(true);
  await page.screenshot({ path: path.join(shots, 'card-why-1366.png'), fullPage: true });

  await reasons.first().getByTestId('why-evidence').click();
  await expect(page).toHaveURL(/criterion=why-rev/);
  await expect(page).toHaveURL(/scope=automatic/);
  await expect(page.locator('.msg-highlight')).toHaveCount(3);
  await expect(page.getByTestId('criterion-detail')).toContainText('обратной шкалой');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/evaluations/${id}?scope=automatic`);
  await expect(page.getByTestId('why-reduction')).toHaveCount(1);
  await noPageOverflow(page);
  await page.screenshot({ path: path.join(shots, 'card-why-390.png'), fullPage: true });
});

test('automatic/effective: a human decision changes the reasons and is labelled; «Оспорить» opens the existing form', async ({ page, request }) => {
  const id = await setup(request);
  await decideChoice(request, servers.complete, id, 'why-ok', 'no');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/#/evaluations/${id}?scope=effective`);
  const why = page.getByTestId('score-explanation');
  await expect(why.getByTestId('why-reduction')).toHaveCount(2);
  await expect(why.locator('[data-criterion-id="why-ok"]').getByTestId('why-human')).toBeVisible();
  await expect(why.getByTestId('why-source')).toContainText('решениями проверяющего');

  await page.getByRole('button', { name: 'Оценка AI', exact: true }).click();
  await expect(page).toHaveURL(/scope=automatic/);
  await expect(why.getByTestId('why-reduction')).toHaveCount(1);
  await expect(why.getByTestId('why-human')).toHaveCount(0);

  await why.locator('[data-criterion-id="why-rev"]').getByRole('button', { name: /^Оспорить критерий/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Апелляция по критерию' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Комментарий к апелляции')).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрыть окно' }).click();
  const appeals = await (await request.get(`${servers.complete}/api/v1/appeals?evaluation_id=${id}`)).json();
  expect(appeals.total).toBe(1); // only the decided one from setup; viewing the form wrote nothing
});

test('onboarding example: steps, evidence, N/A, refresh and back; opens the text import without API writes', async ({ page, request }) => {
  const totals = async () =>
    Promise.all(
      ['conversations', 'evaluations', 'appeals'].map(async (r) => (await (await request.get(`${servers.complete}/api/v1/${r}?limit=1`)).json()).total),
    );
  const before = await totals();
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`);
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/#/conversations');
  await page.getByTestId('open-example').click();
  await expect(page).toHaveURL(/#\/example\/closing-na/);
  await expect(page.getByTestId('tutorial-label')).toHaveText(
    'Учебный пример. Ответы заданы для объяснения интерфейса; AI-запуск не выполнялся.',
  );
  await expect(page.getByTestId('tutorial-total')).toHaveText('92,31 из 100');
  const reasons = page.getByTestId('why-reduction');
  await expect(reasons).toHaveCount(1);
  await expect(reasons.first()).toContainText('Завершение');
  await expect(reasons.first().getByTestId('why-weight')).toHaveText('0 из 5');
  await page.screenshot({ path: path.join(shots, 'tutorial-step1-1366.png'), fullPage: true });

  await page.getByRole('button', { name: 'Следующий шаг →' }).click();
  await page.getByTestId('tutorial-highlight-closing').click();
  await expect(page.locator('.msg-highlight')).toHaveCount(2);
  await expect(page.locator('.msg-highlight').last()).toContainText('Хорошо');

  await page.getByRole('button', { name: /3\. Почему здесь N\/A\?/ }).click();
  await expect(page.getByTestId('tutorial-progress')).toHaveText('Шаг 3 из 4');
  await expect(page.getByTestId('why-na')).toContainText('Выявление потребности');
  await expect(page.getByTestId('why-na')).toContainText('Идентификация');
  await page.reload();
  await expect(page.getByTestId('tutorial-step')).toHaveAttribute('data-step', '3');

  await page.setViewportSize({ width: 390, height: 844 });
  await noPageOverflow(page);
  await page.screenshot({ path: path.join(shots, 'tutorial-step3-390.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });

  await page.getByRole('button', { name: /4\. Попробовать свой диалог/ }).click();
  await page.getByLabel(/Перенести текст примера/).check();
  await page.getByTestId('tutorial-try-own').click();
  const dialog = page.getByRole('dialog', { name: 'Импорт разговоров' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Вставить диалог обычным текстом')).toBeChecked();
  await expect(dialog.getByLabel('Текст диалога')).toHaveValue(/client: Как отключить уведомления\?/);
  await expect(dialog.getByTestId('paste-seed-note')).toContainText('по вашей команде');
  await expect(page).not.toHaveURL(/paste=|example=/);
  await page.screenshot({ path: path.join(shots, 'tutorial-to-import-1366.png') });

  expect(writes).toEqual([]);
  expect(await totals()).toEqual(before);

  // Back from the example returns to where the user came from.
  await dialog.getByRole('button', { name: 'Закрыть окно' }).click();
  await page.getByTestId('open-example').click();
  await page.getByRole('button', { name: '← Назад' }).click();
  await expect(page).toHaveURL(/#\/conversations/);
});
