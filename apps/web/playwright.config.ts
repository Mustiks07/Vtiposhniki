import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser acceptance runs against the REAL backend (no HTTP mocking). The API is started
// from CQA_E2E_API_ROOT (default: this repository) in explicit test mode, one server per
// synthetic evaluator scenario, each with its own throwaway database under data/private.
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const apiRoot = path.resolve(process.env.CQA_E2E_API_ROOT ?? repo);
const python = path.join(apiRoot, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const runId = process.env.CQA_E2E_RUN_ID ?? String(Date.now());
const dataRoot = path.join(apiRoot, 'data', 'private', 'c-e2e', runId);
const webDist = path.join(here, 'dist');

export const ports = {
  complete: Number(process.env.CQA_E2E_PORT ?? 8765),
  partial: Number(process.env.CQA_E2E_PORT ?? 8765) + 1,
  failed: Number(process.env.CQA_E2E_PORT ?? 8765) + 2,
};

function server(scenario: keyof typeof ports) {
  const data = path.join(dataRoot, scenario).replaceAll('\\', '/');
  fs.mkdirSync(data, { recursive: true });
  return {
    command: `"${python}" -m uvicorn cqa_api.main:app --host 127.0.0.1 --port ${ports[scenario]}`,
    cwd: apiRoot,
    url: `http://127.0.0.1:${ports[scenario]}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      CQA_MODE: 'test',
      CQA_EVALUATOR: 'test',
      CQA_TEST_SCENARIO: scenario,
      CQA_DATA_DIR: data,
      CQA_DATABASE_URL: `sqlite:///${data}/cqa.sqlite3`,
      CQA_WEB_DIST: webDist,
      CQA_RETRY_BASE_SECONDS: '1',
      CQA_RETRY_MAX_SECONDS: '2',
      PYTHONUTF8: '1',
    },
  };
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: path.join(repo, 'data', 'private', 'c-e2e-results'),
  use: {
    baseURL: `http://127.0.0.1:${ports.complete}`,
    browserName: 'chromium',
    headless: true,
    locale: 'ru-RU',
    trace: 'off',
    screenshot: 'off',
  },
  webServer: [server('complete'), server('partial'), server('failed')],
});
