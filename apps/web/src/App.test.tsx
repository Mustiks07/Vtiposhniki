import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from './App';

afterEach(() => vi.unstubAllGlobals());

test('foundation is explicit and uses the contract health endpoint', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schema_version: '1.0', status: 'ok', phase: 'foundation', business_ready: false, evaluator_mode: 'production' }) }));
  render(<App />);
  expect(await screen.findByText('Контрактный API доступен')).toBeTruthy();
  expect(screen.getByText(/ещё не реализованы/)).toBeTruthy();
});
