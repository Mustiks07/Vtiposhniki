import { expect, test } from '@playwright/test';
import { createChecklist, criterion, draft, importViaApi, launchFromList, record, servers, uid } from './support';

test.describe('partial scenario server', () => {
  test.use({ baseURL: servers.partial });

  test('E06: job succeeded + evaluation partial is shown without a full total', async ({ page, request }) => {
    const title = uid('E06 чек-лист');
    await createChecklist(request, servers.partial, draft(title, [criterion('c-a', { weight: '40' }), criterion('c-b', { weight: '60' })]));
    const id = uid('e06');
    await importViaApi(request, servers.partial, [record(id)]);
    await launchFromList(page, [id], title);
    const row = page.getByTestId('job-row');
    await expect(row).toHaveAttribute('data-state', 'succeeded');
    await expect(row.getByTestId('partial-note')).toContainText('Обработка завершена, оценка неполная');
    await row.getByRole('link', { name: /карточка/ }).click();
    await expect(page.getByTestId('automatic-total')).toHaveText('нет итога');
    await expect(page.getByTestId('automatic-total')).toHaveAttribute('data-status', 'incomplete_evaluation');
    await expect(page.getByTestId('automatic-total-block')).toContainText('Это не 0 баллов');
    await page.getByTestId('criterion-item').first().click();
    await expect(page.getByText(/Ответ не определён: данных недостаточно/).first()).toBeVisible();
  });
});

test.describe('failed scenario server', () => {
  test.use({ baseURL: servers.failed });

  test('E05: failed job shows reason and attempts; retry is offered only for failed and the server answer is shown', async ({ page, request }) => {
    const title = uid('E05 чек-лист');
    await createChecklist(request, servers.failed, draft(title, [criterion('c-a')]));
    const id = uid('e05');
    await importViaApi(request, servers.failed, [record(id)]);
    const batchId = await launchFromList(page, [id], title);
    const row = page.getByTestId('job-row');
    await expect(row).toHaveAttribute('data-state', 'failed');
    await expect(row).toContainText('Ошибка провайдера модели');
    await expect(row).toContainText(/попытка \d+ из \d+/);
    await expect(row).toContainText('correlation_id');

    const before = await (await request.get(`${servers.failed}/api/v1/evaluation-batches/${batchId}`)).json();
    await row.getByRole('button', { name: 'Повторить задание' }).click();
    // Whatever the server answers (202 or a contract error), no new batch is created.
    await expect(row.getByRole('alert').or(row.locator('[data-state]'))).toBeVisible();
    const after = await (await request.get(`${servers.failed}/api/v1/evaluation-batches/${batchId}`)).json();
    expect(after.jobs.length).toBe(before.jobs.length);
    const list = await (await request.get(`${servers.failed}/api/v1/evaluations?batch_id=${batchId}`)).json();
    expect(list.items.length).toBeLessThanOrEqual(1);

    await page.getByRole('link', { name: /карточка/ }).click();
    await expect(page.getByText('Оценка не получена').first()).toBeVisible();
  });
});
