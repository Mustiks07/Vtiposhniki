import { expect, test } from '@playwright/test';

const origin = `http://127.0.0.1:${Number(process.env.CQA_E2E_PORT ?? 8765) + 3}`;
test.use({ baseURL: origin });

test('approximate seeking uses an explicit recording pause without promoting alignment', async ({ page, request }) => {
  const response = await request.post(`${origin}/api/v1/imports`, {
    data: { source: 'organizer_api', group_id: 'audio-initial' },
  });
  expect(response.status()).toBe(201);
  const id = (await response.json()).items[0].conversation_id;
  await page.goto(`/#/conversations/${id}`);
  const player = page.getByTestId('audio-player');
  await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.readyState)).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('audio-alignment')).toContainText('приблизительно, не сверено со звуком');
  await page.getByText('Уточнить начало и паузы записи', { exact: true }).click();
  await page.getByLabel('Первая реплика: секунд от начала файла').fill('0.1');
  await page.getByLabel('Паузы записи: секунды от первой метки транскрипта').fill('0.4–0.8');
  await page.locator('[data-message-id="m0002"]').getByRole('button', { name: /≈ к моменту реплики · 0,7 с/ }).click();
  await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThanOrEqual(0.69);
  const after = await (await request.get(`${origin}/api/v1/conversations/${id}`)).json();
  expect(after.audio.alignment_status).toBe('unverified');
  expect(after.audio.mapping).toBeNull();
  await page.getByLabel('Паузы записи: секунды от первой метки транскрипта').fill('0.4–0.8; 0.5–0.9');
  await expect(page.getByText('Паузы не должны пересекаться.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /≈ к моменту реплики/ })).toHaveCount(0);
});
