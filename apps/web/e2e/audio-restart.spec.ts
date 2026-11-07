import { selectConversation } from './support';
import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createChecklist, criterion, draft, here, importViaApi, record, servers, uid } from './support';

test('E15: voice call without a verified recording explains the limitation and offers no fake seek', async ({ page, request }) => {
  const title = uid('E15 звонок');
  const v = await createChecklist(request, servers.complete, draft(title, [criterion('v-a')]));
  const imp = await importViaApi(request, servers.complete, [
    record(uid('e15'), {
      channel: 'voice_call',
      messages: [
        { speaker: 'operator', text: 'Добрый день, слушаю вас.', timestamp_original: '00:00:03' },
        { speaker: 'client', text: 'Здравствуйте, вопрос по счёту.', timestamp_original: '00:00:08' },
      ],
    }),
  ]);
  const conv = await (await request.get(`${servers.complete}/api/v1/conversations/${imp.items[0].conversation_id}`)).json();
  const batch = await request.post(`${servers.complete}/api/v1/evaluation-batches`, {
    data: { conversation_ids: [conv.id], checklist_version_id: v.version_id, profile_id: 'test-synthetic', mode: 'fresh' },
    headers: { 'Idempotency-Key': uid('k') },
  });
  const job = (await batch.json()).jobs[0];
  await expect.poll(async () => (await (await request.get(`${servers.complete}/api/v1/jobs/${job.id}`)).json()).evaluation_id).toBeTruthy();
  const evaluationId = (await (await request.get(`${servers.complete}/api/v1/jobs/${job.id}`)).json()).evaluation_id;

  await page.goto(`/#/evaluations/${evaluationId}`);
  await expect(page.getByRole('heading', { name: 'Запись разговора' })).toBeVisible();
  await expect(page.getByTestId('audio-alignment')).toContainText('не подтверждена');
  await expect(page.getByText(/▶ запись с/)).toHaveCount(0);
  if (conv.audio.availability === 'unavailable') await expect(page.getByTestId('audio-unavailable')).toBeVisible();
  else if (conv.audio.availability === 'unknown') await expect(page.getByTestId('audio-unknown')).toBeVisible();
  else await expect(page.getByTestId('audio-player')).toBeVisible();
  // Original call timestamps are shown verbatim, no invented calendar date.
  await expect(page.locator('.msg-time').first()).toHaveText('00:00:03');
});

// E07: the API process is stopped while a batch is pending and started again on the same DB.
const apiRoot = path.resolve(process.env.CQA_E2E_API_ROOT ?? path.resolve(here, '../../..'));
const python = path.join(apiRoot, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const port = Number(process.env.CQA_E2E_PORT ?? 8765) + 5;
const origin = `http://127.0.0.1:${port}`;

function startApi(data: string, worker: boolean): ChildProcess {
  return spawn(python, ['-m', 'uvicorn', 'cqa_api.main:app', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: apiRoot,
    env: {
      ...process.env,
      CQA_MODE: 'test',
      CQA_EVALUATOR: 'test',
      CQA_DATA_DIR: data,
      CQA_DATABASE_URL: `sqlite:///${data}/cqa.sqlite3`,
      CQA_WEB_DIST: path.join(here, '..', 'dist'),
      CQA_WORKER_ENABLED: worker ? 'true' : 'false',
      PYTHONUTF8: '1',
    },
    stdio: 'ignore',
  });
}

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(`${origin}/api/v1/health`, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

async function waitUp() {
  for (let i = 0; i < 120; i++) {
    if (await healthy()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('API did not start');
}

/** Stops the whole process tree (the venv launcher may own a child interpreter on Windows). */
async function stop(proc: ChildProcess) {
  if (proc.exitCode === null && proc.pid) {
    const exited = new Promise((r) => proc.once('exit', r));
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else proc.kill('SIGTERM');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
  }
  for (let i = 0; i < 40 && (await healthy()); i++) await new Promise((r) => setTimeout(r, 250));
  if (await healthy()) throw new Error(`API on port ${port} is still running after stop`);
}

test('E07: backend restart during a batch — UI recovers server state without creating a new batch', async ({ page }) => {
  test.setTimeout(120_000);
  const data = path.join(apiRoot, 'data', 'private', 'c-e2e', `restart-${Date.now()}`).replaceAll('\\', '/');
  fs.mkdirSync(data, { recursive: true });
  // Worker disabled first: jobs stay queued, as if the process died before processing them.
  let api = startApi(data, false);
  try {
    await waitUp();
    const title = uid('E07 чек-лист');
    await createChecklist(page.request, origin, draft(title, [criterion('r-a')]));
    const id = uid('e07');
    await importViaApi(page.request, origin, [record(id)]);

    await page.goto(`${origin}/#/conversations`);
    await selectConversation(page, id);
    await page.getByRole('button', { name: /Оценить выбранные/ }).click();
    await page.getByLabel('Чек-лист', { exact: true }).selectOption({ label: title });
    await page.getByRole('button', { name: 'Запустить пакет' }).click();
    await expect(page).toHaveURL(/#\/batches\//);
    const batchUrl = page.url();
    await expect(page.getByTestId('job-row')).toHaveAttribute('data-state', 'queued');

    await stop(api);
    await expect(page.getByRole('alert').first()).toContainText('Сервер недоступен', { timeout: 30_000 });
    await expect(page.getByTestId('job-row')).toHaveCount(1); // last known state stays visible

    api = startApi(data, true);
    await waitUp();
    // Bounded polling keeps reading the existing batch: no click is needed to recover.
    await expect(page.getByTestId('batch-progress')).toContainText('Все задания в финальном состоянии', { timeout: 60_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('job-row')).toHaveAttribute('data-state', 'succeeded');
    expect(page.url()).toBe(batchUrl);

    await page.reload();
    await expect(page.getByTestId('job-row')).toHaveCount(1);
    const evals = await (await page.request.get(`${origin}/api/v1/evaluations?limit=200`)).json();
    expect(evals.total).toBe(1);
  } finally {
    await stop(api);
  }
});
