// Product UX acceptance on the REAL backend in explicit test-evaluator mode (no HTTP mocks):
// pasted plain-text dialog → preview → import → launch; evaluation comparison; run summary.
// All conversations are invented. Test-evaluator answers are synthetic, not real AI results.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  createChecklist,
  criterion,
  decideChoice,
  decideNa,
  draft,
  importViaApi,
  record,
  runBatchApi,
  servers,
  tmpDir,
  uid,
} from './support';

const shots = path.join(tmpDir, 'product-ux');
fs.mkdirSync(shots, { recursive: true });
const audit = `http://127.0.0.1:${Number(process.env.CQA_E2E_PORT ?? 8765) + 3}`;

async function noPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function newVersion(request: Parameters<typeof createChecklist>[0], origin: string, checklistId: string, latest: string, body: unknown) {
  const res = await request.post(`${origin}/api/v1/checklists/${checklistId}/versions`, {
    data: { expected_latest_version_id: latest, config: body },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { version_id: string };
}

test('paste dialog: explained errors, live preview, import through the real API, then launch', async ({ page, request }) => {
  const title = uid('Учебный чек-лист вставки');
  await createChecklist(request, servers.complete, draft(title, [criterion('paste-greet', { title: 'Приветствие', weight: '100' })]));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/#/conversations');
  await page.getByRole('button', { name: 'Вставить диалог' }).click();
  const dialog = page.getByRole('dialog', { name: 'Импорт разговоров' });
  await expect(dialog.getByLabel('Вставить диалог обычным текстом')).toBeChecked();
  const text = dialog.getByLabel('Текст диалога');
  const submit = dialog.getByRole('button', { name: /Импортировать диалог/ });

  // Empty input cannot be imported.
  await expect(submit).toBeDisabled();
  // Unknown role, missing role and a wrong time are reported with their lines.
  await text.fill('[00:02] client: Здравствуйте.\nmanager: Добрый день.\nПросто строка\n[00:75] operator: Ответ.');
  const errors = dialog.getByTestId('paste-errors');
  await expect(errors).toContainText('Строка 2: неизвестная роль «manager»');
  await expect(errors).toContainText('Строка 3: не указана роль');
  await expect(errors).toContainText('Строка 4: метка времени «00:75» не поддерживается');
  await expect(submit).toBeDisabled();
  await page.screenshot({ path: path.join(shots, 'paste-errors-1366.png') });

  // Fixed input: preview matches the new text, not the old one.
  const dialogText = [
    '[00:02] client: Сәлеметсіз бе! Ақшаны қалай шығарамын?',
    '[00:05] operator: Добрый день! Меня зовут Анна.',
    '  Уточните: какой способ вывода вы выбрали?',
    'system: Оператор подключился.',
    'bot: Note: this chat is recorded.',
  ].join('\n');
  await text.fill(dialogText);
  await expect(errors).toHaveCount(0);
  const preview = dialog.getByTestId('paste-preview');
  await expect(dialog.getByTestId('paste-count')).toContainText('сообщений: 4');
  const items = preview.getByTestId('paste-message');
  await expect(items).toHaveCount(4);
  await expect(items.nth(1)).toContainText('Добрый день! Меня зовут Анна.');
  await expect(items.nth(1)).toContainText('Уточните: какой способ вывода вы выбрали?');
  await expect(items.nth(2).getByTestId('paste-time')).toHaveText('время не указано');
  await expect(items.nth(3)).toHaveAttribute('data-speaker', 'bot');
  await dialog.getByLabel('Язык разговора').selectOption('KZ');
  await dialog.getByLabel('Канал').selectOption('voice_call');
  const externalId = await dialog.getByLabel('Внешний ID разговора').inputValue();
  expect(externalId).toMatch(/^paste-/);
  await page.screenshot({ path: path.join(shots, 'paste-preview-1366.png') });

  await dialog.getByRole('button', { name: 'Импортировать диалог (4)' }).dblclick();
  const result = dialog.getByTestId('paste-result');
  await expect(result).toContainText('Создан новый разговор');
  await expect(dialog.getByRole('button', { name: 'Диалог импортирован' })).toBeDisabled();

  // The server stored exactly what the preview showed: order, roles, times, text.
  const list = await (await request.get(`${servers.complete}/api/v1/conversations?q=${encodeURIComponent(externalId)}`)).json();
  expect(list.total).toBe(1);
  const stored = list.items[0].conversation;
  expect(stored.language).toBe('KZ');
  expect(stored.channel).toBe('voice_call');
  expect(stored.messages.map((m: { speaker: string; timestamp_original: string; text: string }) => [m.speaker, m.timestamp_original, m.text])).toEqual([
    ['client', '00:02', 'Сәлеметсіз бе! Ақшаны қалай шығарамын?'],
    ['operator', '00:05', 'Добрый день! Меня зовут Анна.\nУточните: какой способ вывода вы выбрали?'],
    ['system', '', 'Оператор подключился.'],
    ['bot', '', 'Note: this chat is recorded.'],
  ]);

  // Launch directly from the import result.
  await result.getByLabel('Чек-лист', { exact: true }).selectOption({ label: title });
  await page.screenshot({ path: path.join(shots, 'paste-imported-1366.png') });
  await result.getByRole('button', { name: 'Запустить пакет' }).click();
  await expect(page).toHaveURL(/#\/batches\//);
  await expect(page.getByTestId('batch-progress')).toContainText('Все задания в финальном состоянии', { timeout: 30_000 });
  const evals = await (await request.get(`${servers.complete}/api/v1/evaluations?conversation_id=${stored.id}`)).json();
  expect(evals.total).toBe(1);
  await page.goto(`/#/evaluations/${evals.items[0].id}`);
  await expect(page.getByTestId('test-banner')).toBeVisible();
  await expect(page.getByTestId('run-origin')).toContainText('Новый вызов оценщика');
});

test('paste dialog: an existing ID follows the standard revision rules and the narrow layout fits', async ({ page, request }) => {
  const externalId = uid('ПОВТОР');
  await importViaApi(request, servers.complete, [
    record(externalId, { messages: [{ speaker: 'client', text: 'Вопрос.', timestamp_original: '00:01' }] }),
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/conversations');
  await page.getByRole('button', { name: 'Вставить диалог' }).click();
  const dialog = page.getByRole('dialog', { name: 'Импорт разговоров' });
  await dialog.getByLabel('Внешний ID разговора').fill(externalId);
  await dialog.getByLabel('Текст диалога').fill('[00:01] client: Вопрос.');
  await noPageOverflow(page);
  await page.screenshot({ path: path.join(shots, 'paste-preview-390.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Импортировать диалог (1)' }).click();
  await expect(dialog.getByTestId('paste-result')).toContainText('новый не создан');

  await dialog.getByLabel('Текст диалога').fill('[00:01] client: Вопрос изменён.');
  await expect(dialog.getByTestId('paste-edited')).toBeVisible();
  await dialog.getByRole('button', { name: 'Импортировать диалог (1)' }).click();
  await expect(dialog.getByTestId('paste-result')).toContainText('сохранена новая revision');
  await expect(dialog.getByTestId('paste-result')).toContainText('revision 2');
  const list = await (await request.get(`${servers.complete}/api/v1/conversations?q=${encodeURIComponent(externalId)}`)).json();
  expect(list.total).toBe(1);
  expect(list.items[0].conversation.revision).toBe(2);

  // Starting a new dialog creates a new ID; the JSON route is still available and unchanged.
  await dialog.getByRole('button', { name: 'Вставить новый диалог' }).click();
  await expect(dialog.getByLabel('Внешний ID разговора')).not.toHaveValue(externalId);
  await dialog.getByLabel('JSON (формат JSONImport v1)').check();
  await expect(dialog.getByLabel('Или вставьте JSON')).toBeVisible();
  await noPageOverflow(page);
});

test('comparison: weight-only reuse, rule/scale/added/removed changes, swap, "only changes" and evidence', async ({ page, request }) => {
  const flag = criterion('cmp-risk', {
    title: 'Раскрытие данных',
    response_type: 'flag',
    weight: '0',
    choices: [
      { id: 'no', label: 'Нет', raw_value: false, anchor: 'Нет нарушения', score_fraction: null },
      { id: 'yes', label: 'Да', raw_value: true, anchor: 'Нарушение', score_fraction: null },
    ],
    flag_when_choice_ids: ['yes'],
  });
  const greet = criterion('cmp-greet', { title: 'Приветствие', weight: '25' });
  const close = criterion('cmp-close', { title: 'Завершение', weight: '75' });
  const old = criterion('cmp-old', { title: 'Старое правило', weight: '10' });
  const v1 = await createChecklist(request, servers.complete, draft(uid('Сравнение'), [greet, close, old, flag]));
  const imported = await importViaApi(request, servers.complete, [record(uid('СРАВНЕНИЕ'))]);
  const cid = imported.items[0].conversation_id;
  const first = (await runBatchApi(request, servers.complete, [cid], v1.version_id)).jobs[0].evaluation_id!;

  // v2: only weights change → reuse of the same raw answers, recalculated by the server.
  const v2 = await newVersion(request, servers.complete, v1.checklist_id, v1.version_id,
    draft('Сравнение v2', [{ ...greet, weight: '75' }, { ...close, weight: '25' }, old, flag]));
  const reused = (await runBatchApi(request, servers.complete, [cid], v2.version_id, 'reuse_if_compatible')).jobs[0].evaluation_id!;
  const reusedView = await (await request.get(`${servers.complete}/api/v1/evaluations/${reused}`)).json();
  expect(reusedView.reuse.reused_from_evaluation_id).toBe(first);

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/#/conversations/${cid}/compare?left=${first}&right=${reused}`);
  await expect(page.getByTestId('test-banner')).toBeVisible();
  await expect(page.getByTestId('cmp-side-right').getByTestId('cmp-origin')).toContainText('переиспользованы');
  await expect(page.getByTestId('cmp-side-left').getByTestId('cmp-origin')).toContainText('Новый вызов');
  const greetRow = page.locator('[data-testid="comparison-row"][data-criterion-id="cmp-greet"]');
  await expect(greetRow.locator('[data-kind="weight"]')).toBeVisible();
  await expect(greetRow.locator('[data-kind="contribution"]')).toBeVisible();
  await expect(greetRow.locator('[data-kind="answer"]')).toHaveCount(0);
  await expect(greetRow.locator('td').nth(0).getByTestId('cmp-answer')).toHaveText('Да');
  await expect(greetRow.locator('td').nth(1).getByTestId('cmp-answer')).toHaveText('Да');
  await expect(page.getByTestId('cmp-count-answers')).toContainText('0');
  await expect(page.getByTestId('cmp-count-rules')).toContainText('2');
  // All answers "Да": the total stays 100 although contributions moved.
  await expect(page.getByTestId('total-delta')).toContainText('±0,00');

  // v3: same IDs with a new definition and a re-meant first choice; one removed, one added.
  const v3 = await newVersion(request, servers.complete, v1.checklist_id, v2.version_id,
    draft('Сравнение v3', [
      { ...greet, weight: '75', definition: 'Новое определение: приветствие и имя оператора.' },
      { ...close, weight: '25', choices: close.choices.map((c) => (c.id === 'yes' ? { ...c, label: 'Частично', anchor: 'Только прощание', score_fraction: '0.5' } : c)) },
      criterion('cmp-new', { title: 'Новое правило', weight: '10' }),
      flag,
    ]));
  const third = (await runBatchApi(request, servers.complete, [cid], v3.version_id)).jobs[0].evaluation_id!;
  await page.goto(`/#/conversations/${cid}/compare?left=${reused}&right=${third}`);
  const kinds = async (id: string) =>
    page.locator(`[data-testid="comparison-row"][data-criterion-id="${id}"]`).getAttribute('data-kinds');
  await expect.poll(() => kinds('cmp-greet')).toContain('rule');
  expect(await kinds('cmp-close')).toContain('scale');
  expect(await kinds('cmp-close')).toContain('answer_meaning');
  expect(await kinds('cmp-old')).toContain('removed');
  expect(await kinds('cmp-new')).toContain('added');
  expect(await kinds('cmp-risk')).toBe('');
  await expect(page.getByTestId('rule-change').first()).toContainText('Новое определение: приветствие и имя оператора.');
  await expect(page.getByTestId('total-delta')).toContainText('−');
  await page.screenshot({ path: path.join(shots, 'comparison-1366.png'), fullPage: true });

  // "Only changes" hides the unchanged flag row only; state survives refresh.
  // The checkbox state lives in the URL: click, then wait for the navigation to apply it.
  await page.getByLabel('Только изменения').click();
  await expect(page).toHaveURL(/changes=1/);
  await expect(page.getByLabel('Только изменения')).toBeChecked();
  await expect(page.getByTestId('comparison-row')).toHaveCount(4);
  await page.reload();
  await expect(page.getByLabel('Только изменения')).toBeChecked();
  await expect(page.getByTestId('comparison-row')).toHaveCount(4);

  // Swap keeps both IDs in the URL, reversed.
  await page.getByTestId('swap-sides').click();
  await expect(page).toHaveURL(new RegExp(`left=${third}.*right=${reused}|right=${reused}.*left=${third}`));
  await expect.poll(() => kinds('cmp-new')).toContain('removed');

  // Evidence opens the right evaluation, criterion and highlighted message range.
  await page.setViewportSize({ width: 390, height: 844 });
  await noPageOverflow(page);
  await page.screenshot({ path: path.join(shots, 'comparison-390.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  const greetLeft = page.locator('[data-testid="comparison-row"][data-criterion-id="cmp-greet"] td').nth(0);
  await greetLeft.getByTestId('cmp-evidence-link').first().click();
  await expect(page).toHaveURL(new RegExp(`#/evaluations/${third}\\?`));
  await expect(page).toHaveURL(/criterion=cmp-greet/);
  await expect(page.getByTestId('criterion-detail')).toContainText('Приветствие');
  await expect(page.locator('.msg-highlight')).toHaveCount(3);
});

test('comparison: automatic vs effective after an appeal, and N/A → undetermined as a status change', async ({ page, request }) => {
  const v = await createChecklist(request, servers.complete, draft(uid('Апелляция'), [
    criterion('ap-greet', { title: 'Приветствие', weight: '50' }),
    criterion('ap-close', { title: 'Завершение', weight: '50' }),
  ]));
  const cid = (await importViaApi(request, servers.complete, [record(uid('АПЕЛЛЯЦИЯ'))])).items[0].conversation_id;
  const a = (await runBatchApi(request, servers.complete, [cid], v.version_id)).jobs[0].evaluation_id!;
  const b = (await runBatchApi(request, servers.complete, [cid], v.version_id)).jobs[0].evaluation_id!;
  await decideChoice(request, servers.complete, a, 'ap-greet', 'no');

  await page.goto(`/#/conversations/${cid}/compare?left=${a}&right=${b}&scope=automatic&changes=1`);
  await expect(page.getByText('Различий по критериям нет')).toBeVisible();
  await expect(page.getByTestId('total-delta')).toContainText('±0,00');
  await page.getByLabel('Источник результата').selectOption('effective');
  await expect(page).toHaveURL(/scope=effective/);
  const row = page.locator('[data-testid="comparison-row"][data-criterion-id="ap-greet"]');
  await expect(row).toHaveAttribute('data-kinds', /answer/);
  await expect(row.locator('td').nth(0)).toContainText('решение проверяющего');
  await expect(page.getByTestId('total-delta')).toContainText('+50,00');
  await row.locator('td').nth(0).getByRole('link', { name: 'Открыть доказательства' }).click();
  await expect(page).toHaveURL(new RegExp(`#/evaluations/${a}\\?.*scope=effective`));
  await expect(page.getByTestId('criterion-detail')).toContainText('Действующий ответ (решение проверяющего)');

  // Partial server: both automatic results are undetermined; a human N/A on the left.
  const pv = await createChecklist(request, servers.partial, draft(uid('Неполная'), [
    criterion('na-greet', { title: 'Приветствие', allow_na: true, na_condition: 'Клиент не писал', weight: '100' }),
  ]));
  const pcid = (await importViaApi(request, servers.partial, [record(uid('НЕПОЛНАЯ'))])).items[0].conversation_id;
  const pa = (await runBatchApi(request, servers.partial, [pcid], pv.version_id)).jobs[0].evaluation_id!;
  const pb = (await runBatchApi(request, servers.partial, [pcid], pv.version_id)).jobs[0].evaluation_id!;
  await decideNa(request, servers.partial, pa, 'na-greet');
  await page.goto(`${servers.partial}/#/conversations/${pcid}/compare?left=${pa}&right=${pb}&scope=effective`);
  const naRow = page.locator('[data-testid="comparison-row"][data-criterion-id="na-greet"]');
  await expect(naRow).toHaveAttribute('data-kinds', /applicability/);
  await expect(naRow.locator('td').nth(0).getByTestId('cmp-answer')).toHaveText('N/A');
  await expect(naRow.locator('td').nth(1).getByTestId('cmp-answer')).toHaveText('не определено');
  await expect(page.getByTestId('total-delta')).toContainText('Числовая разница не показывается');
  await expect(page.getByTestId('cmp-side-right')).toContainText('нет итога');
  await page.screenshot({ path: path.join(shots, 'comparison-na-undetermined-1366.png'), fullPage: true });
});

test('run summary: new call vs reuse, known cost, tokens and the separate source run', async ({ page, request }) => {
  const version = await createChecklist(request, audit, draft(uid('Расходы'), [criterion('audit-cost')]));
  const cid = (await importViaApi(request, audit, [record(uid('Расходы'))])).items[0].conversation_id;
  const first = (await runBatchApi(request, audit, [cid], version.version_id)).jobs[0].evaluation_id!;
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${audit}/#/evaluations/${first}`);
  const summary = page.getByTestId('run-summary');
  await expect(summary.getByTestId('run-origin')).toContainText('Новый вызов оценщика');
  await expect(summary.getByTestId('run-calls')).toHaveText('2 · попыток задания 2');
  await expect(summary.getByTestId('run-tokens')).toHaveText('вход 20 · выход 10');
  await expect(summary.getByTestId('run-cost')).toHaveText('0,75 USD');
  await expect(summary.getByTestId('run-models')).toContainText('test');
  // Summary sits right after the score, before the criteria list.
  const order = await page.evaluate(() => {
    const s = document.querySelector('[data-testid="run-summary"]');
    const c = document.querySelector('.criteria-panel');
    return Boolean(s && c && s.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, 'run-summary-fresh-1366.png') });
  // All technical details are still there.
  await page.getByText('Детали запуска: версии, модели, стоимость').click();
  await expect(page.getByTestId('total-cost')).toContainText('0,75 USD');
  await expect(page.getByTestId('current-run').locator('tbody tr')).toHaveCount(2);
  await expect(page.getByTestId('run-details')).toContainText('Ключ переиспользования');

  const reused = (await runBatchApi(request, audit, [cid], version.version_id, 'reuse_if_compatible')).jobs[0].evaluation_id!;
  await page.goto(`${audit}/#/evaluations/${reused}`);
  await expect(summary.getByTestId('run-origin')).toContainText('Переиспользован сохранённый результат');
  await expect(summary.getByTestId('run-calls')).toContainText('0 ·');
  await expect(summary.getByTestId('run-cost')).toContainText('подтверждено');
  await expect(summary.getByTestId('run-source')).toContainText('0,75 USD');
  await expect(summary.getByTestId('run-source')).toContainText('не прибавляются');
  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, 'run-summary-reuse-1366.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await noPageOverflow(page);
  await page.screenshot({ path: path.join(shots, 'run-summary-390.png'), fullPage: true });
});

test('run summary: synthetic test call without reported usage or price stays unknown, not zero', async ({ page, request }) => {
  const version = await createChecklist(request, servers.complete, draft(uid('Без цены'), [criterion('nocost')]));
  const cid = (await importViaApi(request, servers.complete, [record(uid('БЕЗ-ЦЕНЫ'))])).items[0].conversation_id;
  const id = (await runBatchApi(request, servers.complete, [cid], version.version_id)).jobs[0].evaluation_id!;
  await page.goto(`/#/evaluations/${id}`);
  const summary = page.getByTestId('run-summary');
  await expect(summary.getByTestId('run-tokens')).toContainText('неизвестны');
  await expect(summary.getByTestId('run-cost')).toContainText('неизвестна');
  await expect(summary.getByTestId('run-cost')).not.toContainText('0 USD');
  await expect(summary).toContainText('Тестовый оценщик');
});
