import { expect, test } from '@playwright/test';
import { importViaApi, record, servers, uid } from './support';

test('embedded entrypoint opens the requested conversation and preserves ordinary navigation', async ({ page, request }) => {
  const imported = await importViaApi(request, servers.complete, [record(uid('embedded'))]);
  const id = imported.items[0].conversation_id;
  await page.addInitScript((apiBase) => { window.CQA_CONFIG = { apiBase }; }, `${servers.complete}/api/v1/`);
  await page.goto(`/?embed=1&conversation=${encodeURIComponent(id)}`);
  await expect(page).toHaveURL(new RegExp(`#\/conversations\/${id}$`));
  await expect(page.getByRole('region', { name: 'Оригинал разговора' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Основные разделы' })).toHaveCount(0);
  await expect(page.getByText('Тестовый режим', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Диалоги', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Диалоги', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Диалоги', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Основные разделы' })).toHaveCount(0);
});
