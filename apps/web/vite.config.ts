import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // CQA_API_ORIGIN lets a developer point the dev proxy at a different local API port.
  server: { host: '127.0.0.1', port: 5173, proxy: Object.fromEntries(['/api', '/docs', '/openapi.json'].map((p) => [p, process.env.CQA_API_ORIGIN ?? 'http://127.0.0.1:8000'])) },
  test: { environment: 'jsdom', include: ['src/**/*.test.tsx'], setupFiles: ['./src/test-setup.ts'] },
});
