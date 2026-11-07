import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { originalVersion, tmpDir } from './support';
import {
  createChecklist,
  criterion,
  decideChoice,
  draft,
  importViaApi,
  record,
  runBatchApi,
  servers,
  uid,
} from './support';

test('journal: import dialog traps focus, Escape restores it, unsent text survives', async ({ page }) => {
  await page.goto('/#/conversations');
  const trigger = page.getByRole('button', { name: 'Импорт разговоров' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Импорт разговоров' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Или вставьте JSON').fill('unsent draft');
  await dialog.getByRole('button', { name: 'Импортировать', exact: true }).focus();
  await page.keyboard.press('Tab');
  // The browser may briefly focus its chrome; one more Tab must remain in the dialog.
  if (
    !(await dialog
      .getByRole('button', { name: 'Закрыть окно' })
      .evaluate((element) => element === document.activeElement))
  )
    await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Закрыть окно' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByLabel('Или вставьте JSON')).toHaveValue('unsent draft');
});

test('journal: scope switches server proposals and evidence; reverse citation restores criterion on mobile', async ({
  page,
  request,
}) => {
  const version = await createChecklist(
    request,
    servers.complete,
    draft(uid('journal'), [criterion('journal-greeting', { title: 'Приветствие', weight: '100' })]),
  );
  const imported = await importViaApi(request, servers.complete, [record(uid('journal'))]);
  const batch = await runBatchApi(request, servers.complete, [imported.items[0].conversation_id], version.version_id);
  const id = batch.jobs[0].evaluation_id!;
  await decideChoice(request, servers.complete, id, 'journal-greeting', 'no');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/evaluations/${id}?scope=automatic`);
  const item = page.getByTestId('criterion-item').first();
  await expect(item.locator('.criterion-answer')).toHaveText('Да');
  await page.getByRole('button', { name: 'После пересмотра', exact: true }).click();
  await expect(item.locator('.criterion-answer')).toHaveText('Нет');
  await expect(item.locator('.criterion-contribution')).toHaveText('0 / 100');
  await expect(page.getByTestId('automatic-total')).toHaveText('100,00 из 100');
  await expect(page.getByTestId('effective-total')).toHaveText('0,00 из 100');
  await page.getByRole('tab', { name: /Разговор/ }).click();
  const citation = page.locator('[data-message-id="m0001"]').getByRole('button', { name: 'Критерий 1: Приветствие' });
  await citation.click();
  await expect(page.getByTestId('criterion-detail')).toBeVisible();
  await expect(page.getByTestId('criterion-detail')).toBeFocused();
  await page
    .getByRole('button', { name: /включительно/ })
    .first()
    .click();
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(2);
  await expect(page.locator('[data-message-id="m0001"]')).toBeFocused();
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});

test('journal: unsaved editor draft survives cancelled navigation and can be discarded explicitly', async ({
  page,
}) => {
  await page.goto('/#/checklists/new');
  await page.getByLabel('Название чек-листа', { exact: true }).fill('Несохранённый черновик');
  await page.getByRole('link', { name: 'Диалоги', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Есть несохранённые изменения' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Продолжить редактирование' }).click();
  await expect(page.getByLabel('Название чек-листа', { exact: true })).toHaveValue('Несохранённый черновик');
  await page.getByRole('link', { name: 'Диалоги', exact: true }).click();
  await dialog.getByRole('button', { name: 'Уйти без сохранения' }).click();
  await expect(page).toHaveURL(/#\/conversations$/);
});

test('journal: required desktop and phone layouts keep the viewport readable', async ({ page, request }) => {
  const version = await originalVersion(request, servers.complete);
  const imported = await importViaApi(request, servers.complete, [
    record(uid('Учебный разговор'), {
      messages: [
        {
          speaker: 'operator',
          text: 'Здравствуйте! Я оператор учебного сервиса «Маяк». Чем могу помочь?',
          timestamp_original: '00:00',
        },
        {
          speaker: 'client',
          text: 'Хочу отключить рекламные уведомления. Сообщения о входе должны остаться.',
          timestamp_original: '00:05',
        },
        {
          speaker: 'operator',
          text: 'Откройте настройки уведомлений и отключите только рекламу. Сообщения безопасности останутся включены.',
          timestamp_original: '00:12',
        },
        { speaker: 'client', text: 'Нашёл нужный переключатель. Спасибо за помощь!', timestamp_original: '00:24' },
        {
          speaker: 'operator',
          text: 'Рад помочь. Если появятся другие вопросы, напишите нам. Хорошего дня!',
          timestamp_original: '00:30',
        },
      ],
    }),
  ]);
  const batch = await runBatchApi(request, servers.complete, [imported.items[0].conversation_id], version.version_id);
  const id = batch.jobs[0].evaluation_id!;
  const screenshots = path.join(tmpDir, 'journal-preview');
  fs.mkdirSync(screenshots, { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [1024, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`/#/evaluations/${id}?scope=automatic`);
    await expect(page.getByTestId('criterion-item')).toHaveCount(8);
    await expect(page.getByTestId('test-banner')).toBeVisible();
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
    if (width <= 1100) {
      await expect(page.getByRole('tab', { name: 'Оценка', exact: true })).toBeVisible();
      await page.getByRole('tab', { name: 'Оценка', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: /Разговор/ })).toBeFocused();
      await expect(page.getByRole('region', { name: 'Оригинал разговора' })).toBeVisible();
      await page.keyboard.press('ArrowLeft');
      await expect(page.getByRole('tab', { name: 'Оценка', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.card-evaluation')).toBeVisible();
    } else {
      await expect(page.getByRole('region', { name: 'Оригинал разговора' })).toBeVisible();
    }
    await page.screenshot({ path: path.join(screenshots, `evaluation-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/conversations');
  await expect(page.getByTestId('conversation-row').first()).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, 'conversations-1440.png') });
  await page.getByRole('button', { name: 'Импорт разговоров' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, 'import-1440.png') });
  await page.getByRole('button', { name: 'Закрыть окно' }).click();
  await page.goto(`/#/checklists/${version.checklist_id}/edit`);
  await expect(page.getByTestId('editor-criterion')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Критерии в редакторе' }).getByRole('button')).toHaveCount(8);
  await page.screenshot({ path: path.join(screenshots, 'editor-1440.png') });
});
