import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { ImportPanel, PasteDraftProvider } from './ImportPanel';

// Component test with a stubbed HTTP layer; the end-to-end acceptance runs on the real API
// (e2e/product-ux.spec.ts).
function setup(importResponse: () => Response) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.startsWith('/api/v1/imports')) return importResponse();
      return new Response(JSON.stringify({ items: [], total: 0, limit: 200, offset: 0, schema_version: '1.0' }), { status: 200 });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PasteDraftProvider><ImportPanel /></PasteDraftProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // jsdom has no <dialog> modal support; the content is mounted regardless.
  fireEvent.click(screen.getByRole('button', { name: /Вставить диалог/ }));
  return calls.filter.bind(calls, (c) => c.url.startsWith('/api/v1/imports'));
}

afterEach(() => vi.unstubAllGlobals());

const ok = () =>
  new Response(
    JSON.stringify({
      schema_version: '1.0', atomic: true, received_count: 1, deduplicated_count: 0,
      items: [{ schema_version: '1.0', conversation_id: 'conv_1', revision: 1, disposition: 'created', source_indices: [0] }],
    }),
    { status: 201 },
  );

test('paste: errors block import, preview follows the edited text, one request per confirmed record', async () => {
  const imports = setup(ok);
  const text = screen.getByLabelText('Текст диалога');
  fireEvent.change(text, { target: { value: 'client: Здравствуйте\nmanager: Добрый день' } });
  const errors = await screen.findByTestId('paste-errors');
  expect(errors.textContent).toContain('Строка 2: неизвестная роль «manager»');
  const submit = screen.getByRole('button', { name: /Импортировать диалог/ });
  expect(submit).toHaveProperty('disabled', true);

  fireEvent.change(text, { target: { value: 'client: Здравствуйте\noperator: Добрый день\n  Чем помочь?' } });
  expect(screen.queryByTestId('paste-errors')).toBeNull();
  const preview = screen.getByTestId('paste-preview');
  expect(within(preview).getAllByTestId('paste-message')).toHaveLength(2);
  expect(within(preview).getAllByTestId('paste-time')[0].textContent).toBe('время не указано');
  const externalId = (screen.getByLabelText('Внешний ID разговора') as HTMLInputElement).value;

  fireEvent.click(screen.getByRole('button', { name: 'Импортировать диалог (2)' }));
  fireEvent.click(screen.getByRole('button', { name: /Импорт…|Импортировать диалог/ }));
  await screen.findByTestId('paste-result');
  expect(imports()).toHaveLength(1);
  expect(imports()[0].body).toEqual({
    schema_version: '1.0',
    source: 'json',
    records: [
      {
        schema_version: '1.0', external_id: externalId, channel: 'agent_chat', language: 'RU',
        messages: [
          { schema_version: '1.0', speaker: 'client', text: 'Здравствуйте', timestamp_original: '' },
          { schema_version: '1.0', speaker: 'operator', text: 'Добрый день\nЧем помочь?', timestamp_original: '' },
        ],
      },
    ],
  });
  expect(screen.getByRole('button', { name: 'Диалог импортирован' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('link', { name: 'Открыть разговор' }).getAttribute('href')).toBe('/conversations/conv_1?revision=1');

  // Editing after import keeps the same ID and warns that it will be a new revision.
  fireEvent.change(text, { target: { value: 'client: Здравствуйте!\noperator: Добрый день' } });
  expect(screen.getByTestId('paste-edited').textContent).toContain('новую версию разговора');
});

test('paste: a failed request keeps the text and retries with the same external ID', async () => {
  let attempt = 0;
  const imports = setup(() => {
    attempt += 1;
    return attempt === 1
      ? new Response(JSON.stringify({ code: 'internal_error', message: 'x', correlation_id: 'corr-1', retryable: true, details: [], schema_version: '1.0' }), { status: 500 })
      : ok();
  });
  fireEvent.change(screen.getByLabelText('Текст диалога'), { target: { value: '[00:01] client: Сәлем' } });
  fireEvent.click(screen.getByRole('button', { name: 'Импортировать диалог (1)' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Повторить с тем же ID' }));
  await screen.findByTestId('paste-result');
  await waitFor(() => expect(imports()).toHaveLength(2));
  const [first, second] = imports().map((c) => (c.body as { records: { external_id: string }[] }).records[0].external_id);
  expect(second).toBe(first);
  expect((screen.getByLabelText('Текст диалога') as HTMLTextAreaElement).value).toBe('[00:01] client: Сәлем');
});
