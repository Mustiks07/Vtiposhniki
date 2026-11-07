import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const python = path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:8765', browserName: 'chromium', headless: true },
  webServer: {
    command: `"${python}" -m uvicorn cqa_api.main:app --host 127.0.0.1 --port 8765`, cwd: root,
    url: 'http://127.0.0.1:8765/api/v1/health', reuseExistingServer: false,
    env: { CQA_MODE: 'production' },
  },
});
