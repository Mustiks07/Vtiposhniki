import { test, expect } from '@playwright/test';

test('built foundation connects to the real contract API', async ({ page, request }) => {
  const health = await request.get('/api/v1/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ phase: 'foundation', business_ready: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CQA · Foundation' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Контрактный API доступен');
  const placeholder = await request.get('/api/v1/conversations');
  expect(placeholder.status()).toBe(501);
  expect(await placeholder.json()).toMatchObject({ code: 'not_implemented' });
});
