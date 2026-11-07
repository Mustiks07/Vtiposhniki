import { expect, test } from '@playwright/test';
import {
  createChecklist,
  criterion,
  decideNa,
  draft,
  importViaApi,
  originalVersion,
  record,
  runBatchApi,
  servers,
  uid,
  withFirstChoices,
} from './support';

// E12: the UI displays the server's totals for the MASTER reference cases. The browser
// never computes them: they come from A's domain via B. Answers are produced by the
// explicit test evaluator (first choice of each criterion) and, for N/A, by human decisions.

const base = servers.complete;

async function evaluate(request: Parameters<typeof importViaApi>[0], first: Record<string, string>) {
  const v = await originalVersion(request, base);
  const created = await createChecklist(request, base, withFirstChoices(v, uid('E12 исходная рубрика'), first));
  const id = uid('e12');
  const imp = await importViaApi(request, base, [record(id)]);
  const batch = await runBatchApi(request, base, [imp.items[0].conversation_id], created.version_id);
  expect(batch.jobs[0].state).toBe('succeeded');
  return batch.jobs[0].evaluation_id!;
}

const allDone = { c8_gross_errors: 'no' };

test('E12: MASTER reference totals are displayed from the server', async ({ page, request }) => {
  const cases: { name: string; first: Record<string, string>; na?: string[]; auto: string; eff: string }[] = [
    { name: 'всё выполнено', first: allDone, auto: '100,00', eff: '100,00' },
    { name: 'только №6=7', first: { ...allDone, c6_dialog_management: 'p7' }, auto: '95,50', eff: '95,50' },
    {
      name: '№4=15, №6=7, №7=Нет',
      first: { ...allDone, c4_consultation: 'p15', c6_dialog_management: 'p7', c7_closing: 'no' },
      auto: '85,50',
      eff: '85,50',
    },
    { name: '№3=N/A', first: allDone, na: ['c3_identification'], auto: '100,00', eff: '100,00' },
    {
      name: '№2/3=N/A, №4=15, №6=7',
      first: { ...allDone, c4_consultation: 'p15', c6_dialog_management: 'p7' },
      na: ['c2_needs', 'c3_identification'],
      auto: '90,50', // automatic: №2/№3 still «Да» before the human N/A decisions
      eff: '85,38',
    },
  ];
  for (const c of cases) {
    const evaluationId = await evaluate(request, c.first);
    for (const criterionId of c.na ?? []) await decideNa(request, base, evaluationId, criterionId);
    await page.goto(`/#/evaluations/${evaluationId}`);
    await expect(page.getByTestId('effective-total'), c.name).toHaveText(`${c.eff} из 100`);
    await expect(page.getByTestId('automatic-total'), c.name).toHaveText(`${c.auto} из 100`);
  }
});

test('E12: a custom checklist without applicable weight shows no total (null), not zero', async ({ page, request }) => {
  const title = uid('E12 без весов');
  const v = await createChecklist(request, base, draft(title, [criterion('c-zero', { weight: '0' })]));
  const id = uid('e12-null');
  const imp = await importViaApi(request, base, [record(id)]);
  const batch = await runBatchApi(request, base, [imp.items[0].conversation_id], v.version_id);
  await page.goto(`/#/evaluations/${batch.jobs[0].evaluation_id}`);
  await expect(page.getByTestId('automatic-total')).toHaveText('нет итога');
  await expect(page.getByTestId('automatic-total')).toHaveAttribute('data-status', 'no_applicable_weight');
  await expect(page.getByTestId('automatic-total-block')).toContainText('Нет применимых весов');
});

test('E13: raw step 7/10 is separate from 10,5/15; sections labelled; flag does not change total', async ({ page, request }) => {
  const v = await originalVersion(request, base);
  const evaluationId = await evaluate(request, { c6_dialog_management: 'p7', c8_gross_errors: 'yes' });
  await page.goto(`/#/evaluations/${evaluationId}?criterion=c6_dialog_management`);
  const detail = page.getByTestId('criterion-detail');
  await expect(detail.getByTestId('raw-step')).toHaveText('7/10');
  await expect(detail.getByTestId('weighted')).toHaveText('10,5 / 15');
  await expect(detail.getByTestId('normalized')).toContainText('п. из 100');
  // Flag "yes" (violation) is shown separately and the total stays 95,50.
  await expect(page.getByTestId('flag')).toHaveAttribute('data-detected', 'true');
  await expect(page.getByTestId('flag')).toContainText('нарушение обнаружено');
  await expect(page.getByTestId('effective-total')).toHaveText('95,50 из 100');
  expect(v.criteria.length).toBeGreaterThan(0);

  // Sections on a custom checklist.
  const title = uid('E13 секции');
  const sectioned = await createChecklist(
    request,
    base,
    draft(
      title,
      [criterion('s-a', { weight: '30', section_id: 'sec-1' }), criterion('s-b', { weight: '70', section_id: 'sec-2' }), criterion('s-c', { weight: '0', response_type: 'flag', flag_when_choice_ids: ['yes'], choices: [
        { id: 'yes', label: 'Да', raw_value: true, anchor: 'нарушение', score_fraction: null },
        { id: 'no', label: 'Нет', raw_value: false, anchor: 'нет', score_fraction: null },
      ] })],
      [
        { id: 'sec-1', title: 'Начало разговора' },
        { id: 'sec-2', title: 'Решение вопроса' },
      ],
    ),
  );
  const imp = await importViaApi(request, base, [record(uid('e13'))]);
  const batch = await runBatchApi(request, base, [imp.items[0].conversation_id], sectioned.version_id);
  await page.goto(`/#/evaluations/${batch.jobs[0].evaluation_id}`);
  const rows = page.getByTestId('section-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Начало разговора' })).toContainText('30 / 30');
  await expect(rows.filter({ hasText: 'Решение вопроса' })).toContainText('100,00 %');
  await expect(page.getByText('Проценты секций не складываются в общий итог', { exact: false })).toBeVisible();
  await expect(page.getByTestId('effective-total')).toHaveText('100,00 из 100');
});
