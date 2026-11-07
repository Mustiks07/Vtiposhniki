import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import checklistFixture from '../../../../fixtures/contracts/checklist-custom.json';
import type { ChecklistVersion } from '../api/types';
import { ChecklistEditorPage } from '../pages/ChecklistEditorPage';

afterEach(() => vi.unstubAllGlobals());

const v1: ChecklistVersion = {
  ...(checklistFixture as ChecklistVersion),
  checklist_id: 'cl-1',
  version_id: 'v1',
  created_at: '2026-11-07T00:00:00Z',
  // A plain increasing scale raw 2,1,0 → fractions 1,0.5,0 (no confirmation needed as saved).
};
const v2: ChecklistVersion = { ...v1, version_id: 'v2', created_at: '2026-11-07T01:00:00Z', title: 'Изменено другим автором' };

function json(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function setup(versionsRef: { items: ChecklistVersion[] }, posts: unknown[], status = 201) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        if (status === 409)
          return json({ schema_version: '1.0', code: 'revision_conflict', message: 'conflict', details: [], retryable: false, correlation_id: 'c-1' }, 409);
        return json({ ...v2, version_id: `v-saved-${posts.length}` }, 201);
      }
      if (url.includes('/versions')) return json({ schema_version: '1.0', items: versionsRef.items, total: versionsRef.items.length, limit: 200, offset: 0 });
      return json({ schema_version: '1.0', items: [], total: 0, limit: 200, offset: 0 });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/checklists/cl-1/edit']}>
        <Routes>
          <Route path="/checklists/:id/edit" element={<ChecklistEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

function scaleBlock() {
  return screen.getAllByTestId('editor-criterion').find((b) => b.getAttribute('data-criterion-id') === 'synthetic-scale')!;
}

test('defect 3: a refetch that reveals v2 does not move the draft onto v2; the save still expects v1', async () => {
  const versions = { items: [v1] };
  const posts: Record<string, unknown>[] = [];
  const client = setup(versions, posts);
  const title = await screen.findByLabelText('Название чек-листа');
  fireEvent.change(title, { target: { value: 'Мой черновик на v1' } });

  // Another author saves v2; the version list is refetched while the draft is open.
  versions.items = [v2, v1];
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['checklist-versions', 'cl-1'] });
  });
  await waitFor(() => expect(client.getQueryData<{ items: ChecklistVersion[] }>(['checklist-versions', 'cl-1'])?.items.length).toBe(2));

  expect((screen.getByLabelText('Название чек-листа') as HTMLInputElement).value).toBe('Мой черновик на v1');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить как новую версию' }));
  await waitFor(() => expect(posts.length).toBe(1));
  expect(posts[0].expected_latest_version_id).toBe('v1');
});

test('defect 3: after 409 the expected version changes only through the explicit resolution', async () => {
  const versions = { items: [v2, v1] };
  const posts: Record<string, unknown>[] = [];
  vi.useRealTimers();
  // Draft opened when only v1 existed.
  const client = setup({ items: [v1] }, posts, 409);
  await screen.findByLabelText('Название чек-листа');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить как новую версию' }));
  const conflict = await screen.findByTestId('version-conflict');
  expect(posts[0]).toMatchObject({ expected_latest_version_id: 'v1' });
  // Saving again without resolving still sends v1.
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить как новую версию' }));
  await waitFor(() => expect(posts.length).toBe(2));
  expect(posts[1]).toMatchObject({ expected_latest_version_id: 'v1' });

  // Now v2 exists on the server; the user compares and explicitly rebases.
  (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      return json({ ...v2, version_id: 'v3' }, 201);
    }
    return json({ schema_version: '1.0', items: versions.items, total: 2, limit: 200, offset: 0 });
  });
  expect(conflict).toBeTruthy();
  fireEvent.click(within(await screen.findByTestId('version-conflict')).getByRole('button', { name: 'Сверить с последней версией' }));
  expect(await screen.findByTestId('version-diff')).toBeTruthy();
  fireEvent.click(within(screen.getByTestId('version-conflict')).getByRole('button', { name: /Изменения учтены/ }));
  expect(await screen.findByTestId('rebased-note')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить как новую версию' }));
  await waitFor(() => expect(posts.length).toBe(3));
  expect(posts[2]).toMatchObject({ expected_latest_version_id: 'v2' });
  expect(client).toBeTruthy();
});

test('defect 2: changing an existing scale into a reverse mapping requires a fresh confirmation', async () => {
  const posts: Record<string, unknown>[] = [];
  setup({ items: [v1] }, posts);
  await screen.findByLabelText('Название чек-листа');
  const block = scaleBlock();
  // Existing scale raw 2,1,0 with fractions 1,0.5,0 → reverse it to 0,0.5,1.
  fireEvent.change(within(block).getByLabelText('Доля варианта 1'), { target: { value: '0' } });
  fireEvent.change(within(block).getByLabelText('Доля варианта 3'), { target: { value: '1' } });
  const box = within(block).getByLabelText(/Подтверждаю отображение ответов в доли/) as HTMLInputElement;
  expect(box.checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить как новую версию' }));
  expect(await within(block).findByText(/подтвердите отображение ответов в доли/)).toBeTruthy();
  expect(posts.length).toBe(0);

  fireEvent.click(box);
  expect(box.checked).toBe(true);
  // Weight change keeps the confirmation.
  fireEvent.change(within(block).getByLabelText('Вес'), { target: { value: '61' } });
  expect((within(block).getByLabelText(/Подтверждаю отображение/) as HTMLInputElement).checked).toBe(true);
  // Another mapping change of the already confirmed new scale invalidates it again.
  fireEvent.change(within(block).getByLabelText('Доля варианта 2'), { target: { value: '0.4' } });
  expect((within(block).getByLabelText(/Подтверждаю отображение/) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить как новую версию' }));
  await within(block).findByText(/подтвердите отображение ответов в доли/);
  expect(posts.length).toBe(0);

  fireEvent.click(within(block).getByLabelText(/Подтверждаю отображение/));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить как новую версию' }));
  await waitFor(() => expect(posts.length).toBe(1));
});
