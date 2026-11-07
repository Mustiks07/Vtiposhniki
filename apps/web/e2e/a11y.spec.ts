import { expect, test, type Page } from '@playwright/test';
import { createChecklist, criterion, draft, importViaApi, record, runBatchApi, servers, uid } from './support';

const longKz = 'Қазақстан Республикасының азаматы ретінде шотымды толтыру кезінде қиындықтар туындады '.repeat(8);
const longToken = 'EN-' + 'verylongunbrokenidentifier'.repeat(20);

async function setup(request: Parameters<typeof importViaApi>[0]) {
  const title = uid('E20 чек-лист');
  const longTitle = 'Очень длинное название критерия для проверки переноса строк и отсутствия наложения элементов на узком экране';
  const v = await createChecklist(request, servers.complete, draft(title, [criterion('a-1', { weight: '50', title: longTitle }), criterion('a-2', { weight: '50' })]));
  const imp = await importViaApi(request, servers.complete, [
    record(uid('e20'), {
      language: 'KZ',
      messages: [
        { speaker: 'client', text: longKz, timestamp_original: '00:01' },
        { speaker: 'operator', text: `Hello! Reference: ${longToken}`, timestamp_original: '00:12' },
        { speaker: 'client', text: '<b>жирный?</b> <a href="https://evil.example">сілтеме</a>', timestamp_original: '00:30' },
      ],
    }),
  ]);
  const batch = await runBatchApi(request, servers.complete, [imp.items[0].conversation_id], v.version_id);
  return { evaluationId: batch.jobs[0].evaluation_id!, conversationId: imp.items[0].conversation_id };
}

async function noHorizontalPageScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, 'page must not scroll horizontally').toBeLessThanOrEqual(client + 1);
}

test('E20: keyboard-only — select a criterion and jump to evidence; focus lands on the highlighted message', async ({ page, request }) => {
  const { evaluationId } = await setup(request);
  await page.goto(`/#/evaluations/${evaluationId}`);
  await expect(page.getByTestId('criterion-item').first()).toBeVisible();
  // Skip link is the first focusable element.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused();

  const item = page.getByTestId('criterion-item').first();
  await item.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/criterion=a-1/);
  const evidence = page.getByRole('button', { name: /включительно/ }).first();
  await evidence.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.messageId)).toBe('m0001');

  // Appeal form reachable and submittable from the keyboard; errors are announced and linked.
  await page.getByRole('button', { name: 'Оспорить критерий' }).focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Комментарий к апелляции').focus();
  await page.getByRole('button', { name: 'Подать апелляцию' }).focus();
  await page.keyboard.press('Enter');
  const err = page.getByRole('alert').filter({ hasText: 'Опишите, с чем вы не согласны.' });
  await expect(err).toBeVisible();
  const describedBy = await page.getByLabel('Комментарий к апелляции').getAttribute('aria-describedby');
  expect(describedBy && (await page.locator(`[id="${describedBy}"]`).textContent())).toContain('Опишите');
});

test('E20: 200% zoom equivalent and narrow phone width keep data readable without page overflow', async ({ page, request }) => {
  const { evaluationId, conversationId } = await setup(request);
  // 1280×800 at 200% zoom ≈ 640×400 CSS pixels.
  await page.setViewportSize({ width: 640, height: 400 });
  for (const url of ['/#/conversations', `/#/conversations/${conversationId}`, `/#/evaluations/${evaluationId}?criterion=a-1`, '/#/checklists', '/#/appeals']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await noHorizontalPageScroll(page);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/#/evaluations/${evaluationId}?criterion=a-1`);
  const tabs = page.getByRole('tablist', { name: /узком экране/ });
  await expect(tabs).toBeVisible();
  await expect(page.getByTestId('criterion-detail')).toBeVisible();
  await noHorizontalPageScroll(page);
  await page.getByRole('button', { name: /включительно/ }).first().click();
  await expect(page).toHaveURL(/view=transcript/);
  await expect(page.locator('[data-highlighted="true"]').first()).toBeVisible();
  await expect(page.getByText(longToken, { exact: false })).toBeVisible();
  await noHorizontalPageScroll(page);
  // The long KZ message is shown in full (not truncated) and wraps inside the viewport.
  const kz = page.locator('[data-message-id="m0001"] .msg-text');
  await expect(kz).toContainText(longKz.trim());
  const box = await kz.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1);
  // HTML in the transcript is shown as text, links are not created.
  await expect(page.getByText('<b>жирный?</b> <a href="https://evil.example">сілтеме</a>')).toBeVisible();
  await expect(page.locator('.transcript a')).toHaveCount(0);

  await page.getByRole('button', { name: /к критерию/ }).click();
  await expect(page.getByTestId('criterion-detail')).toBeVisible();
});

test('E20: unknown IDs and unreachable data show a next step instead of a blank or zero', async ({ page }) => {
  await page.goto('/#/evaluations/eval_does_not_exist');
  await expect(page.getByRole('alert')).toContainText('Объект не найден');
  await expect(page.getByRole('button', { name: 'Повторить чтение' })).toBeVisible();
  await page.goto('/#/batches/batch_does_not_exist');
  await expect(page.getByRole('alert')).toContainText('Объект не найден');
  await page.goto('/#/nowhere');
  await expect(page.getByText('Страница не найдена')).toBeVisible();
});
