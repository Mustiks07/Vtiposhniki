import { expect, test } from '@playwright/test';
import { createChecklist, criterion, draft, launchFromList, record, servers, uid, writeTmpJson } from './support';

// E01/E02/E04/E14 (+ part of E20): import through the UI, run a batch, open the card on
// the real API. No HTTP interception anywhere in this file.

test('E01+E02: new IDs/texts via JSON upload, RU/KZ/EN and voice preserved verbatim', async ({ page, request }) => {
  const ids = { ru: uid('e01-ru'), kz: uid('e01-kz'), en: uid('e01-en'), voice: uid('e01-voice') };
  const kzText = 'Сәлеметсіз бе! Шотқа ақша түспеді, көмектесіңізші — ұзын қазақша мәтін: '.repeat(6);
  const file = writeTmpJson(`${ids.ru}.json`, {
    source: 'json',
    records: [
      record(ids.ru),
      record(ids.kz, {
        language: 'KZ',
        messages: [
          { speaker: 'client', text: kzText, timestamp_original: '00:03' },
          { speaker: 'operator', text: 'Сәлеметсіз бе! Мен Данамын.', timestamp_original: '00:31' },
        ],
      }),
      record(ids.en, {
        language: 'EN',
        messages: [
          { speaker: 'client', text: 'Hello, my withdrawal is stuck.', timestamp_original: '00:02' },
          { speaker: 'bot', text: 'Connecting you to an operator…', timestamp_original: '00:03' },
          { speaker: 'operator', text: 'Hi! I am Alex. Let me check that for you.', timestamp_original: '00:40' },
        ],
      }),
      record(ids.voice, {
        channel: 'voice_call',
        messages: [
          { speaker: 'operator', text: 'Добрый день, меня зовут [ИМЯ].', timestamp_original: '2026-11-01T09:00:03Z' },
          { speaker: 'client', text: 'Добрый день.', timestamp_original: '2026-11-01T09:00:09Z' },
        ],
      }),
    ],
  });

  await page.goto('/#/conversations');
  await page.getByRole('button', { name: 'Импорт разговоров' }).click();
  await page.getByLabel('Файл JSON').setInputFiles(file);
  await page.getByRole('button', { name: 'Импортировать' }).click();
  await expect(page.getByText(/Импорт выполнен атомарно: получено записей — 4/)).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть окно' }).click();

  for (const id of Object.values(ids)) await expect(page.getByRole('link', { name: id, exact: true })).toBeVisible();

  await page.getByRole('link', { name: ids.kz, exact: true }).click();
  await expect(page.getByText(kzText.trim(), { exact: false }).first()).toBeVisible();
  await expect(page.locator('.msg-time').first()).toHaveText('00:03');

  await page.goto('/#/conversations');
  await page.getByRole('link', { name: ids.voice, exact: true }).click();
  await expect(page.locator('.msg-time').first()).toHaveText('2026-11-01T09:00:03Z');
  await expect(page.getByText('Добрый день, меня зовут [ИМЯ].')).toBeVisible();
  await expect(page.getByTestId('audio-alignment')).toContainText('не подтверждена');

  await page.goto('/#/conversations?language=EN');
  await expect(page.getByRole('link', { name: ids.en, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: ids.ru, exact: true })).toHaveCount(0);
});

test('E01: invalid import shows the server indexed error and saves nothing', async ({ page, request }) => {
  const good = uid('e01-good');
  const file = writeTmpJson(`${good}.json`, {
    source: 'json',
    records: [record(good), { external_id: uid('e01-bad'), channel: 'agent_chat', language: 'XX', messages: [] }],
  });
  await page.goto('/#/conversations');
  await page.getByRole('button', { name: 'Импорт разговоров' }).click();
  await page.getByLabel('Файл JSON').setInputFiles(file);
  await page.getByRole('button', { name: 'Импортировать' }).click();
  await expect(page.getByRole('alert')).toContainText('Данные не прошли проверку');
  await expect(page.getByText(/ни одна запись этого запроса не сохранена/)).toBeVisible();
  const list = await request.get(`${servers.complete}/api/v1/conversations?limit=200`);
  const body = await list.json();
  expect(body.items.some((i: { conversation: { external_id: string } }) => i.conversation.external_id === good)).toBe(false);
});

test('E01: organizer import sends only group_id and shows the safe server answer', async ({ page }) => {
  await page.goto('/#/conversations');
  await page.getByRole('button', { name: 'Импорт разговоров' }).click();
  await page.getByLabel('API организаторов').check();
  const requestPromise = page.waitForRequest((r) => r.url().endsWith('/api/v1/imports') && r.method() === 'POST');
  await page.getByLabel('group_id').fill('synthetic-group-42');
  await page.getByRole('button', { name: 'Импортировать' }).click();
  const req = await requestPromise;
  expect(req.postDataJSON()).toEqual({ schema_version: '1.0', source: 'organizer_api', group_id: 'synthetic-group-42' });
  // Without a configured organizer URL the server must refuse safely (no URL echoed).
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).not.toContainText('http');
});

test('E04+E14+E20: double click creates one batch; refresh restores; range evidence highlights inclusively', async ({ page, request }) => {
  const title = uid('E04 чек-лист');
  await createChecklist(request, servers.complete, draft(title, [criterion('c-greet', { weight: '40' }), criterion('c-help', { weight: '60' })]));
  const id = uid('e04');
  await page.goto('/#/conversations');
  await page.getByRole('button', { name: 'Импорт разговоров' }).click();
  await page.getByLabel('Или вставьте JSON').fill(
    JSON.stringify({
      source: 'json',
      records: [
        record(id, {
          messages: [
            { speaker: 'client', text: '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>Привет', timestamp_original: '00:01' },
            { speaker: 'operator', text: 'Здравствуйте! **Не markdown** [ссылка](javascript:alert(1))', timestamp_original: '00:10' },
            { speaker: 'client', text: 'Ок.', timestamp_original: '00:20' },
          ],
        }),
      ],
    }),
  );
  await page.getByRole('button', { name: 'Импортировать' }).click();
  await expect(page.getByText(/получено записей — 1/)).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть окно' }).click();

  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/v1/evaluation-batches')) posts.push(r.headers()['idempotency-key']);
  });
  await page.getByRole('checkbox', { name: `Выбрать ${id}` }).check();
  await page.getByRole('button', { name: /Оценить выбранные/ }).click();
  await page.getByLabel('Чек-лист', { exact: true }).selectOption({ label: title });
  await page.getByRole('button', { name: 'Запустить пакет' }).dblclick();
  await expect(page).toHaveURL(/#\/batches\//);
  const batchUrl = page.url();
  expect(new Set(posts).size).toBe(1);
  await expect(page.getByTestId('batch-progress')).toContainText('Все задания в финальном состоянии', { timeout: 30_000 });

  await page.reload();
  await expect(page).toHaveURL(batchUrl);
  await expect(page.getByTestId('job-row')).toHaveCount(1);
  await expect(page.getByTestId('job-row')).toHaveAttribute('data-state', 'succeeded');

  const evalsBefore = await (await request.get(`${servers.complete}/api/v1/evaluations?limit=200`)).json();
  await page.getByRole('link', { name: /карточка/ }).click();
  await expect(page.getByTestId('test-banner')).toBeVisible();
  await page.getByTestId('criterion-item').first().click();
  await page.getByRole('button', { name: /включительно/ }).first().click();
  const highlighted = page.locator('[data-highlighted="true"]');
  await expect(highlighted).toHaveCount(3);
  await expect(highlighted.first()).toHaveAttribute('data-message-id', 'm0001');
  await expect(highlighted.last()).toHaveAttribute('data-message-id', 'm0003');

  // Transcript content is inert text.
  await expect(page.getByText('<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>Привет')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await expect(page.locator('.transcript a')).toHaveCount(0);

  // Refresh restores the selected card and criterion from the URL and the server.
  const cardUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(cardUrl);
  await expect(page.getByTestId('criterion-detail')).toBeVisible();
  const evalsAfter = await (await request.get(`${servers.complete}/api/v1/evaluations?limit=200`)).json();
  expect(evalsAfter.total).toBe(evalsBefore.total);
});

test('E03: changed text under the same external_id becomes a new revision; old result stays tied to old text', async ({ page, request }) => {
  const title = uid('E03 чек-лист');
  const v = await createChecklist(request, servers.complete, draft(title, [criterion('r-1')]));
  const externalId = uid('e03');
  const first = await (await request.post(`${servers.complete}/api/v1/imports`, { data: { source: 'json', records: [record(externalId)] } })).json();
  const conversationId = first.items[0].conversation_id;
  const res = await request.post(`${servers.complete}/api/v1/evaluation-batches`, {
    data: { conversation_ids: [conversationId], checklist_version_id: v.version_id, profile_id: 'test-synthetic', mode: 'reuse_if_compatible' },
    headers: { 'Idempotency-Key': uid('k') },
  });
  expect(res.status()).toBe(202);
  await expect.poll(async () => (await (await request.get(`${servers.complete}/api/v1/evaluations?conversation_id=${conversationId}`)).json()).total).toBe(1);

  // Re-import via the UI with the same external_id and a changed operator text.
  const changed = record(externalId, {
    messages: [
      { speaker: 'client', text: 'Синтетический вопрос клиента.', timestamp_original: '00:01' },
      { speaker: 'operator', text: 'Изменённый ответ оператора.', timestamp_original: '00:20' },
    ],
  });
  await page.goto('/#/conversations');
  await page.getByRole('button', { name: 'Импорт разговоров' }).click();
  await page.getByLabel('Или вставьте JSON').fill(JSON.stringify({ source: 'json', records: [changed] }));
  await page.getByRole('button', { name: 'Импортировать' }).click();
  await expect(page.getByText(/revision 2 · новая revision/)).toBeVisible();

  await page.goto(`/#/conversations/${conversationId}`);
  await expect(page.getByText('Изменённый ответ оператора.')).toBeVisible();
  const item = page.getByTestId('evaluation-item');
  await expect(item).toHaveCount(1);
  await expect(item).toHaveAttribute('data-revision', '1');
  await expect(item).toContainText('не последняя — результат относится к старому тексту');

  await page.getByLabel('Revision').selectOption('1');
  await expect(page.getByTestId('old-revision')).toBeVisible();
  await expect(page.getByText('Здравствуйте! Синтетический ответ оператора.')).toBeVisible();

  // Reuse must not present the old result as an evaluation of the new text.
  await page.getByLabel('Revision').selectOption('2');
  await page.getByRole('button', { name: /Оценить выбранные/ }).click();
  await page.getByLabel('Чек-лист', { exact: true }).selectOption({ label: title });
  await page.getByLabel(/reuse_if_compatible/).check();
  await page.getByRole('button', { name: 'Запустить пакет' }).click();
  await expect(page.getByTestId('batch-progress')).toContainText('Все задания в финальном состоянии');
  await expect(page.getByTestId('job-row')).toContainText('revision 2');
  await page.getByRole('link', { name: /карточка/ }).click();
  await expect(page.locator('.card-meta')).toContainText('revision разговора 2');
  await page.getByText('Детали запуска: версии, модели, стоимость').click();
  await expect(page.getByTestId('reuse-provenance')).toContainText('Результат получен в этом запуске');
});

test('E14: list → card shows answer, weight, rationale and limitations per criterion', async ({ page, request }) => {
  const title = uid('E14 чек-лист');
  await createChecklist(request, servers.complete, draft(title, [criterion('c-one', { weight: '25', title: 'Приветствие' })]));
  const id = uid('e14');
  await page.request.post(`${servers.complete}/api/v1/imports`, { data: { source: 'json', records: [record(id)] } });
  await launchFromList(page, [id], title);
  await page.getByRole('link', { name: /карточка/ }).click();
  await page.getByTestId('criterion-item').first().click();
  const detail = page.getByTestId('criterion-detail');
  await expect(detail.getByRole('heading', { name: 'Приветствие' })).toBeVisible();
  await expect(detail.getByTestId('weighted')).toHaveText('25 / 25');
  await expect(detail.getByText('Обоснование')).toBeVisible();
  await expect(detail.getByText('test_evaluator').first()).toBeVisible();
});
