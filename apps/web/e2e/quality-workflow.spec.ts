import { conversationRow, savedVersionId } from './support';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createChecklist, criterion, draft, importViaApi, record, runBatchApi, servers } from './support';

const pictures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../data/private/c-e2e-tmp/quality-workflow',
);

test('worklist, focused editor and comparison keep server results and evidence connected', async ({
  page,
  request,
}) => {
  const yes = {
    id: 'yes',
    label: 'Да',
    raw_value: true,
    anchor: 'Условие выполнено',
    score_fraction: '1',
  };
  const no = {
    id: 'no',
    label: 'Нет',
    raw_value: false,
    anchor: 'Условие не выполнено',
    score_fraction: '0',
  };
  const v1 = await createChecklist(
    request,
    servers.complete,
    draft('Демонстрационный чек-лист', [
      criterion('intro', {
        title: 'Начало разговора',
        weight: '25',
        choices: [yes, no],
      }),
      criterion('closing', {
        title: 'Завершение',
        weight: '75',
        choices: [no, yes],
      }),
      criterion('risk', {
        title: 'Риск раскрытия данных',
        response_type: 'flag',
        weight: '0',
        choices: [
          { ...yes, score_fraction: null },
          { ...no, score_fraction: null },
        ],
        flag_when_choice_ids: ['yes'],
      }),
    ]),
  );
  const imported = await importViaApi(request, servers.complete, [
    record('ДЕМО-001', {
      messages: [
        {
          speaker: 'client',
          text: 'Как отключить рекламные уведомления в учебном кабинете «Клевер»?',
          timestamp_original: '00:01',
        },
        {
          speaker: 'operator',
          text: 'Здравствуйте! Проверьте настройки уведомлений в учебном приложении.',
          timestamp_original: '00:05',
        },
        {
          speaker: 'client',
          text: 'Спасибо, нашёл нужный переключатель.',
          timestamp_original: '00:15',
        },
      ],
    }),
    record('ДЕМО-002', {
      messages: [
        {
          speaker: 'client',
          text: 'Подскажите статус моей учебной заявки.',
          timestamp_original: '00:01',
        },
        {
          speaker: 'operator',
          text: 'Сначала подтвердим личность в безопасной форме.',
          timestamp_original: '00:06',
        },
      ],
    }),
    record('ДЕМО-003', {
      messages: [
        {
          speaker: 'client',
          text: 'Где найти справку о работе сервиса?',
          timestamp_original: '00:01',
        },
        {
          speaker: 'operator',
          text: 'Откройте раздел помощи в учебном приложении.',
          timestamp_original: '00:10',
        },
      ],
    }),
  ]);
  const ids = imported.items.map((i) => i.conversation_id);
  const before = await runBatchApi(request, servers.complete, ids.slice(0, 2), v1.version_id);
  const oldId = before.jobs[0].evaluation_id!;
  const appeal = await request.post(
    `${servers.complete}/api/v1/evaluations/${before.jobs[1].evaluation_id}/appeals`,
    {
      data: {
        criterion_id: 'risk',
        comment: 'Учебный пример: проверить основание нарушения.',
        expected_revision: 1,
      },
    },
  );
  expect(appeal.status()).toBe(201);

  await page.goto(`/#/checklists/${v1.checklist_id}/edit`);
  await expect(page.getByTestId('editor-criterion')).toHaveCount(1);
  const current = page.getByTestId('editor-criterion');
  await expect(current.getByLabel('raw_value варианта 1')).toHaveCount(0);
  await current.getByLabel('Вес').fill('75');
  await page
    .getByRole('navigation', { name: 'Критерии в редакторе' })
    .getByRole('button', { name: /Завершение/ })
    .click();
  await expect(current).toContainText('Завершение');
  await current.getByLabel('Вес').fill('25');
  await page.getByRole('button', { name: 'Сохранить как новую версию' }).click();
  await expect(page.getByTestId('version-saved')).toBeVisible();
  const v2 = await savedVersionId(page);
  const after = await runBatchApi(request, servers.complete, [ids[0]], v2, 'reuse_if_compatible');

  await page.goto('/#/conversations?q=' + encodeURIComponent('ДЕМО-'));
  await page.getByRole('button', { name: 'Без оценки', exact: true }).click();
  await expect(page.getByTestId('conversation-row')).toHaveCount(1);
  await expect(conversationRow(page, ids[2])).toHaveCount(1);
  await page.getByRole('button', { name: 'Нужна проверка', exact: true }).click();
  await expect(page.getByTestId('conversation-row')).toHaveCount(1);
  await expect(page.getByTestId('conversation-row')).toContainText('Открытая апелляция');
  await page.getByRole('link', { name: 'Апелляций: 1' }).click();
  await expect(page.getByTestId('queue-appeal')).toHaveCount(1);
  await page.goto('/#/conversations');
  await page.getByLabel('Поиск по ID или тексту').fill('УВЕДОМЛЕНИЯ В УЧЕБНОМ КАБИНЕТЕ');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page.getByTestId('conversation-row')).toHaveCount(1);
  await expect(page.getByTestId('row-score')).toHaveText('75,00');
  await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
  await page.goto('/#/conversations?q=' + encodeURIComponent('ДЕМО-'));
  await page.getByRole('combobox', { name: 'Порядок', exact: true }).selectOption('score_asc');
  await expect(page.getByTestId('conversation-row').first().locator(`a[href="#/conversations/${ids[1]}"]`)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  fs.mkdirSync(pictures, { recursive: true });
  await page.screenshot({
    path: path.join(pictures, 'worklist.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({
    path: path.join(pictures, 'worklist-mobile.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/#/conversations/${ids[0]}/compare?left=${oldId}&right=${after.jobs[0].evaluation_id}`);
  await expect(page.getByRole('heading', { name: 'Сравнение оценок', exact: true })).toBeVisible();
  await expect(page.locator('.comparison-totals')).toContainText('25,00 из 100');
  await expect(page.locator('.comparison-totals')).toContainText('75,00 из 100');
  await expect(page.getByTestId('comparison-row')).toHaveCount(3);
  await expect(page.getByTestId('version-diff')).toContainText('вес');
  await page.screenshot({
    path: path.join(pictures, 'comparison.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Открыть доказательства' }).first().click();
  await expect(page).toHaveURL(/scope=automatic/);
  await expect(page.getByTestId('criterion-detail')).toBeVisible();
  await expect(page.getByTestId('criterion-detail')).toContainText('Начало разговора');

  const changed = record('ДЕМО-001', {
    messages: [
      {
        speaker: 'client',
        text: 'Это другой текст той же учебной записи.',
        timestamp_original: '00:01',
      },
      {
        speaker: 'operator',
        text: 'Принято, это новая версия.',
        timestamp_original: '00:05',
      },
    ],
  });
  await importViaApi(request, servers.complete, [changed]);
  const newer = await runBatchApi(request, servers.complete, [ids[0]], v2);
  await page.goto(`/#/conversations/${ids[0]}/compare?left=${oldId}&right=${newer.jobs[0].evaluation_id}`);
  await expect(page.getByText(/Выберите разные оценки одного и того же текста/)).toBeVisible();
  await expect(page.getByTestId('comparison-row')).toHaveCount(0);
});
