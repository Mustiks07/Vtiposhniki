import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  createChecklist,
  criterion,
  decideChoice,
  draft,
  evaluation,
  importViaApi,
  record,
  runBatchApi,
  servers,
  uid,
} from './support';

// U01–U04 (organizer addendum): flag search on «Диалоги» through the real API (contract 1.1.0).
// Answers come from the explicit test evaluator (first choice) and real human decisions.

function flag(id: string, title: string, firstIsViolation: boolean) {
  const yes = { id: 'viol', label: 'Есть', raw_value: true, anchor: 'Нарушение обнаружено', score_fraction: null };
  const no = { id: 'clean', label: 'Нет', raw_value: false, anchor: 'Нарушения нет', score_fraction: null };
  return criterion(id, {
    response_type: 'flag',
    title,
    weight: '0',
    choices: firstIsViolation ? [yes, no] : [no, yes],
    flag_when_choice_ids: ['viol'],
  });
}

/** Require the real server implementation before asserting the search behaviour. */
async function requireFlagFilter(request: APIRequestContext, base: string, versionId: string, flagId: string) {
  const res = await request.get(
    `${base}/api/v1/conversations?checklist_version_id=${versionId}&flag_criterion_id=${flagId}&limit=1`,
  );
  expect(res.status(), `Flag search must answer contract 1.1.0 (HTTP ${res.status()}).`).toBe(200);
}

async function selectScope(page: Page, scope: 'automatic' | 'effective') {
  const radio = page.getByRole('radio', { name: new RegExp(`^${scope} —`) });
  // URL navigation commits asynchronously; check() can assert before React's commit.
  await radio.click();
  await expect(radio).toBeChecked();
  await expect(page.getByTestId('search-scope')).toContainText(`результат ${scope}`);
}

async function search(
  page: Page,
  opts: {
    checklistTitle: string;
    versionId: string;
    flagTitle: string;
    status?: string;
    scope?: 'automatic' | 'effective';
  },
) {
  await page.goto('/#/conversations');
  await page.getByText('Версия чек-листа и поиск по флагу', { exact: true }).click();
  await page.getByLabel('Чек-лист для поиска').selectOption({ label: opts.checklistTitle });
  await page.getByLabel('Версия для поиска').selectOption(opts.versionId);
  await page.getByLabel('Флаговый критерий').selectOption({ label: opts.flagTitle });
  if (opts.status) await page.getByLabel('Состояние флага').selectOption({ label: opts.status });
  if (opts.scope === 'effective') await selectScope(page, 'effective');
  await expect(page.getByTestId('search-scope')).toContainText(`флаг «${opts.flagTitle}»`);
}

test('U01+U03: the only detected record beyond the first page is found; total and paging are server-side; explanation opens real messages', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const base = servers.complete;
  const checklistTitle = uid('U01 чек-лист');
  const flagTitle = 'Обещание вне регламента'; // arbitrary flag: never called «грубая ошибка»
  const v = await createChecklist(
    request,
    base,
    draft(checklistTitle, [criterion('u-main', { weight: '10' }), flag('u-flag-7Q', flagTitle, false)]),
  );
  await requireFlagFilter(request, base, v.version_id, 'u-flag-7Q');

  // 30 conversations; the oldest one is the only effective "detected" → it is beyond page 1.
  const records = Array.from({ length: 30 }, (_, i) => record(uid(`u01-${String(i).padStart(2, '0')}`)));
  const imp = await importViaApi(request, base, records);
  const convIds = imp.items.map((i) => i.conversation_id);
  const batch = await runBatchApi(request, base, convIds, v.version_id);
  expect(batch.jobs.every((j) => j.state === 'succeeded')).toBe(true);
  const target = batch.jobs.find((j) => (j as unknown as { conversation_id: string }).conversation_id === convIds[0])!;
  await decideChoice(request, base, target.evaluation_id!, 'u-flag-7Q', 'viol');

  // Unfiltered list: the target is not on the first page.
  await page.goto('/#/conversations');
  await expect(page.getByTestId('conversation-row')).toHaveCount(25);
  await expect(page.getByRole('link', { name: records[0].external_id, exact: true })).toHaveCount(0);

  // Automatic: nothing detected (the AI said «Нет» everywhere).
  await search(page, { checklistTitle, versionId: v.version_id, flagTitle, status: 'обнаружен' });
  await expect(page.getByTestId('search-scope')).toContainText('Найдено: 0');
  await expect(page.getByTestId('conversation-row')).toHaveCount(0);

  // Effective: exactly the target, total 1.
  await selectScope(page, 'effective');
  await expect(page.getByTestId('search-scope')).toContainText('Найдено: 1');
  const row = page.getByTestId('conversation-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(records[0].external_id);
  await expect(row.getByTestId('flag-cell')).toContainText(`${flagTitle}: обнаружен`);
  await expect(row.getByTestId('flag-cell')).not.toContainText(/груб/i);

  // not_detected (effective): 29 matches across two server pages.
  await page.getByLabel('Состояние флага').selectOption({ label: 'не обнаружен' });
  await expect(page.getByTestId('search-scope')).toContainText('Найдено: 29');
  await expect(page.getByTestId('pager-range')).toHaveText('1–25 из 29');
  await page.getByRole('button', { name: 'Вперёд →' }).click();
  await expect(page.getByTestId('pager-range')).toHaveText('26–29 из 29');
  await expect(page.getByTestId('conversation-row')).toHaveCount(4);
  await page.reload();
  await expect(page.getByTestId('pager-range')).toHaveText('26–29 из 29');

  // U03: open the explanation from the result row → existing card with real messages.
  await page.getByLabel('Состояние флага').selectOption({ label: 'обнаружен' });
  await page.getByTestId('flag-explain').click();
  await expect(page).toHaveURL(/criterion=u-flag-7Q/);
  await expect(page.getByTestId('opened-scope')).toContainText('effective');
  const detail = page.getByTestId('criterion-detail');
  await expect(detail.getByRole('heading', { name: flagTitle })).toBeVisible();
  await expect(detail).toContainText('Действующий ответ (решение проверяющего)');
  await expect(detail).toContainText('Ответ оценщика (automatic)');
  await detail
    .getByRole('button', { name: /включительно/ })
    .first()
    .click();
  await expect(page.locator('[data-highlighted="true"]').first()).toContainText('Синтетический вопрос клиента.');
  const ev = await evaluation(request, base, target.evaluation_id!);
  expect(ev.human_decisions.length).toBe(1);
});

test.describe('partial scenario server', () => {
  test.use({ baseURL: servers.partial });
  test('U02: confirmed flag with other criteria undetermined is found; undetermined/unevaluated are unknown, not negative', async ({
    page,
    request,
  }) => {
    const base = servers.partial;
    const checklistTitle = uid('U02 чек-лист');
    const flagTitle = 'Раскрытие данных третьим лицам';
    const v = await createChecklist(
      request,
      base,
      draft(checklistTitle, [criterion('p-main', { weight: '10' }), flag('p-flag', flagTitle, true)]),
    );
    await requireFlagFilter(request, base, v.version_id, 'p-flag');
    const ext = [uid('u02-flag'), uid('u02-undetermined'), uid('u02-unevaluated')];
    const imp = await importViaApi(
      request,
      base,
      ext.map((e) => record(e)),
    );
    const [flagged, undetermined] = imp.items.map((i) => i.conversation_id);
    const batch = await runBatchApi(request, base, [flagged, undetermined], v.version_id);
    const flaggedJob = batch.jobs.find(
      (j) => (j as unknown as { conversation_id: string }).conversation_id === flagged,
    )!;
    await decideChoice(request, base, flaggedJob.evaluation_id!, 'p-flag', 'viol');

    await search(page, { checklistTitle, versionId: v.version_id, flagTitle, status: 'обнаружен', scope: 'effective' });
    await expect(page.getByTestId('search-scope')).toContainText('Найдено: 1');
    const row = page.getByTestId('conversation-row');
    await expect(row).toContainText(ext[0]);
    await expect(row).toContainText('Оценка неполная');

    await page.getByLabel('Состояние флага').selectOption({ label: 'не обнаружен' });
    await expect(page.getByTestId('search-scope')).toContainText('Найдено: 0');

    await page.getByLabel('Состояние флага').selectOption({ label: 'неизвестно' });
    await expect(page.getByTestId('search-scope')).toContainText('это не «нарушений нет»');
    const unknownRows = page.getByTestId('conversation-row');
    for (const e of [ext[1], ext[2]]) await expect(unknownRows.filter({ hasText: e })).toHaveCount(1);
    await expect(page.getByTestId('flag-cell').filter({ hasText: 'не обнаружен' })).toHaveCount(0);

    // Automatic scope: the AI left the flag undetermined → the record is unknown, not detected.
    await selectScope(page, 'automatic');
    await page.getByLabel('Состояние флага').selectOption({ label: 'обнаружен' });
    await expect(page.getByTestId('search-scope')).toContainText('Найдено: 0');
  });
});

test.describe('failed scenario server', () => {
  test.use({ baseURL: servers.failed });
  test('U02: failed evaluation is unknown, never «не обнаружен»', async ({ page, request }) => {
    const base = servers.failed;
    const checklistTitle = uid('U02 ошибки');
    const flagTitle = 'Флаг для сбоя';
    const v = await createChecklist(
      request,
      base,
      draft(checklistTitle, [criterion('f-main'), flag('f-flag', flagTitle, false)]),
    );
    await requireFlagFilter(request, base, v.version_id, 'f-flag');
    const ext = uid('u02-failed');
    const imp = await importViaApi(request, base, [record(ext)]);
    await runBatchApi(request, base, [imp.items[0].conversation_id], v.version_id);
    await search(page, { checklistTitle, versionId: v.version_id, flagTitle, status: 'неизвестно' });
    const row = page.getByTestId('conversation-row').filter({ hasText: ext });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Ошибка оценки');
    await expect(row.getByTestId('flag-cell')).toHaveAttribute('data-flag-status', 'unknown');
    await page.getByLabel('Состояние флага').selectOption({ label: 'не обнаружен' });
    await expect(page.getByTestId('conversation-row').filter({ hasText: ext })).toHaveCount(0);
  });
});

test('U04: new arbitrary flag ID from the editor works; re-evaluation and a new revision never duplicate the row or reuse an old true', async ({
  page,
  request,
}) => {
  const base = servers.complete;
  const checklistTitle = uid('U04 чек-лист');
  const flagTitle = uid('Новый флаг');
  // Created through the editor: arbitrary flag criterion with a generated opaque ID.
  await page.goto('/#/checklists/new');
  await page.getByLabel('Название чек-листа').fill(checklistTitle);
  const first = page.getByTestId('editor-criterion').first();
  await first.getByLabel('Название', { exact: true }).fill(flagTitle);
  await first.getByLabel('Определение').fill('Синтетический флаг, созданный в редакторе.');
  await first.getByLabel('Тип ответа').selectOption('flag');
  await first.getByLabel('Смысл ступени варианта 1').fill('Нарушение есть');
  await first.getByLabel('Смысл ступени варианта 2').fill('Нарушения нет');
  await page.getByRole('button', { name: '+ Критерий' }).click();
  const second = page.getByTestId('editor-criterion').first();
  await second.getByLabel('Название', { exact: true }).fill('Обычный критерий');
  await second.getByLabel('Определение').fill('Синтетическое определение.');
  await second.getByLabel('Смысл ступени варианта 1').fill('Да');
  await second.getByLabel('Смысл ступени варианта 2').fill('Нет');
  await page.getByRole('button', { name: 'Создать чек-лист' }).click();
  await expect(page.getByTestId('version-saved')).toBeVisible();
  const versionId = (await page.getByTestId('version-saved').locator('code').textContent())!;
  const saved = await (await request.get(`${base}/api/v1/checklist-versions/${versionId}`)).json();
  const flagId = saved.criteria.find((c: { response_type: string }) => c.response_type === 'flag').id as string;
  expect(flagId).toMatch(/^crit_/);
  await requireFlagFilter(request, base, versionId, flagId);

  const externalId = uid('u04');
  const imp = await importViaApi(request, base, [record(externalId)]);
  const conversationId = imp.items[0].conversation_id;
  await runBatchApi(request, base, [conversationId], versionId);
  await runBatchApi(request, base, [conversationId], versionId); // re-evaluation

  await search(page, { checklistTitle, versionId, flagTitle, status: 'обнаружен' });
  await expect(page.getByTestId('conversation-row').filter({ hasText: externalId })).toHaveCount(1);
  const latest = (
    await (await request.get(`${base}/api/v1/evaluations?conversation_id=${conversationId}&limit=1`)).json()
  ).items[0].id;
  await expect(
    page.getByTestId('conversation-row').filter({ hasText: externalId }).getByTestId('flag-explain'),
  ).toHaveAttribute('href', new RegExp(`#/evaluations/${latest}\\?`));

  // New revision (changed text) without a new run: the old true is not carried over.
  await importViaApi(request, base, [
    record(externalId, { messages: [{ speaker: 'client', text: 'Изменённый текст.', timestamp_original: '00:02' }] }),
  ]);
  await page.reload();
  await expect(page.getByTestId('conversation-row').filter({ hasText: externalId })).toHaveCount(0);
  await page.getByLabel('Состояние флага').selectOption({ label: 'неизвестно' });
  const row = page.getByTestId('conversation-row').filter({ hasText: externalId });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Не оценён');
});
