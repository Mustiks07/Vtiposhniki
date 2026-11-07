import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from './App';
import health from '../../../fixtures/contracts/health.json';

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

test('shell shows navigation and the contract health endpoint state', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/v1/health')) return jsonResponse({ ...health, evaluator_mode: 'test' });
    if (url.startsWith('/api/v1/conversations'))
      return jsonResponse({ schema_version: '1.0', items: [], total: 0, limit: 25, offset: 0 });
    return jsonResponse({ schema_version: '1.0', items: [], total: 0, limit: 200, offset: 0 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(await screen.findByRole('link', { name: 'Диалоги' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Чек-листы' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Апелляции' })).toBeTruthy();
  expect(await screen.findByText('Тестовый режим')).toBeTruthy();
  expect(screen.getByText('Синтетические ответы')).toBeTruthy();
  expect(await screen.findByText('Разговоров пока нет')).toBeTruthy();
});

test('unreachable API is reported, not shown as empty data', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  render(<App />);
  expect(await screen.findByText(/Нет связи с сервером/)).toBeTruthy();
  await waitFor(() => expect(screen.getAllByText('Сервер недоступен').length).toBeGreaterThan(0), { timeout: 4000 });
});
