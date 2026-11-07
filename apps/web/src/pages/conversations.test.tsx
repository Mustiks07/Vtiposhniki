import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import checklistFixture from '../../../../fixtures/contracts/checklist-custom.json';
import detected from '../../../../fixtures/contracts/conversation-flag-detected-partial.json';
import failed from '../../../../fixtures/contracts/conversation-flag-failed.json';
import negative from '../../../../fixtures/contracts/conversation-flag-negative.json';
import pending from '../../../../fixtures/contracts/conversation-flag-pending.json';
import type { ChecklistVersion, ConversationSummary } from '../api/types';
import { parseConversationQuery, withFilter } from '../lib/conversationQuery';
import { ConversationsPage } from './ConversationsPage';

afterEach(() => vi.unstubAllGlobals());

// The fixture checklist has an arbitrary flag criterion titled "Synthetic synthetic-flag".
const version = { ...(checklistFixture as ChecklistVersion) };

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function rows(items: ConversationSummary[], total: number) {
  return { schema_version: '1.0', items, total, limit: 25, offset: 0 };
}

let lastSearch = '';
function Probe() {
  lastSearch = useLocation().search;
  return null;
}

function renderAt(url: string, conversationItems: ConversationSummary[], total: number) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string) => {
      calls.push(u);
      if (u.startsWith('/api/v1/conversations')) return json(rows(conversationItems, total));
      if (u.startsWith('/api/v1/checklist-versions/')) return json(version);
      if (u.includes('/versions')) return json({ schema_version: '1.0', items: [version], total: 1, limit: 200, offset: 0 });
      if (u.startsWith('/api/v1/checklists'))
        return json({
          schema_version: '1.0',
          items: [{ schema_version: '1.0', checklist_id: version.checklist_id, title: version.title, latest_version_id: version.version_id, created_at: version.created_at }],
          total: 1,
          limit: 200,
          offset: 0,
        });
      return json({ schema_version: '1.0', items: [], total: 0, limit: 200, offset: 0 });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: 0 } } })}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/conversations" element={<><ConversationsPage /><Probe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return calls;
}

test('query keeps contract dependencies: no criterion → no status/scope; no version → no criterion', () => {
  const p = parseConversationQuery(new URLSearchParams('flag_criterion_id=f&flag_status=detected&flag_scope=effective'));
  expect(p.query.flag_criterion_id).toBeUndefined();
  expect(p.query.flag_status).toBeUndefined();
  expect(p.query.flag_scope).toBeUndefined();
  const q = parseConversationQuery(new URLSearchParams('checklist_version_id=v&flag_criterion_id=f&flag_status=bogus&offset=25'));
  expect(q.query).toMatchObject({ checklist_version_id: 'v', flag_criterion_id: 'f', flag_scope: 'automatic', offset: 25 });
  expect(q.query.flag_status).toBeUndefined();
  const changed = withFilter(new URLSearchParams('checklist_version_id=v&flag_criterion_id=f&flag_status=detected&offset=25'), 'checklist_version_id', 'v2');
  expect(changed.get('flag_criterion_id')).toBeNull();
  expect(changed.get('flag_status')).toBeNull();
  expect(changed.get('offset')).toBeNull();
});

test('flag search is sent to the server with total and page; arbitrary flag is named by its title', async () => {
  const url = `/conversations?checklist=${version.checklist_id}&checklist_version_id=${version.version_id}&flag_criterion_id=synthetic-flag&flag_status=detected&offset=25`;
  const calls = renderAt(url, [detected as ConversationSummary], 31);
  await screen.findByTestId('flag-cell');
  const listCall = calls.find((c) => c.startsWith('/api/v1/conversations'))!;
  const sent = new URL(listCall, 'http://x').searchParams;
  expect(Object.fromEntries(sent)).toMatchObject({
    checklist_version_id: version.version_id,
    flag_criterion_id: 'synthetic-flag',
    flag_status: 'detected',
    flag_scope: 'automatic',
    offset: '25',
    limit: '25',
  });
  expect(screen.getByTestId('pager-range').textContent).toBe('26–31 из 31');
  const cell = screen.getByTestId('flag-cell');
  expect(cell.textContent).toContain('Synthetic synthetic-flag: обнаружен');
  expect(cell.textContent).not.toMatch(/груб/i);
  expect(within(cell).getByTestId('flag-explain').getAttribute('href')).toBe(
    '#/evaluations/eval-flag?criterion=synthetic-flag&scope=automatic',
  );
  const scope = await screen.findByTestId('search-scope');
  await waitFor(() => expect(scope.textContent).toContain('флаг «Synthetic synthetic-flag»'));
  expect(scope.textContent).toContain('текущая revision');
  expect(scope.textContent).toContain('Найдено: 31');
  expect(screen.getByLabelText('Флаговый критерий').querySelectorAll('option').length).toBe(2); // none + one flag
});

test('unknown (pending/failed) is not shown as "no violation"; switching scope re-queries the server', async () => {
  const url = `/conversations?checklist=${version.checklist_id}&checklist_version_id=${version.version_id}&flag_criterion_id=synthetic-flag`;
  const calls = renderAt(url, [negative, pending, failed] as ConversationSummary[], 3);
  const cells = await screen.findAllByTestId('flag-cell');
  expect(cells.map((c) => c.getAttribute('data-flag-status'))).toEqual(['not_detected', 'unknown', 'unknown']);
  expect(cells[1].textContent).toContain('неизвестно');
  expect(cells[1].textContent).toContain('нет результата выбранного запуска');
  fireEvent.click(screen.getByRole('radio', { name: /effective/ }));
  await waitFor(() => expect(calls.some((c) => c.includes('flag_scope=effective'))).toBe(true));
  expect(lastSearch).toContain('flag_scope=effective');
});

test('server error for the flag query is shown, never replaced by a local filter', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string) =>
      u.startsWith('/api/v1/conversations')
        ? ({ ok: false, status: 501, json: async () => ({ schema_version: '1.0', code: 'not_implemented', message: 'x', details: [], retryable: false, correlation_id: 'c-501' }) } as Response)
        : json(u.startsWith('/api/v1/checklist-versions/') ? version : { schema_version: '1.0', items: [], total: 0, limit: 200, offset: 0 }),
    ),
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: 0 } } })}>
      <MemoryRouter initialEntries={[`/conversations?checklist_version_id=${version.version_id}&flag_criterion_id=synthetic-flag`]}>
        <Routes>
          <Route path="/conversations" element={<ConversationsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect((await screen.findByRole('alert')).textContent).toContain('Функция ещё не реализована на сервере');
  expect(screen.queryByTestId('conversation-row')).toBeNull();
});
