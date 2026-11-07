import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { api } from './api/client';
import { AppealsPage } from './pages/AppealsPage';
import { BatchPage } from './pages/BatchPage';
import { ChecklistPage, ChecklistVersionRedirect } from './pages/ChecklistPage';
import { ChecklistEditorPage } from './pages/ChecklistEditorPage';
import { ChecklistsPage } from './pages/ChecklistsPage';
import { ConversationPage } from './pages/ConversationPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { NotFound } from './pages/NotFound';

function HealthLine() {
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => api.health(signal), retry: 0 });
  if (health.isError) {
    return (
      <span className="health health-bad" role="status">
        <span aria-hidden="true">✕ </span>API недоступен
      </span>
    );
  }
  if (!health.data) return <span className="health">Проверка API…</span>;
  return (
    <span className="health" data-testid="health">
      <span aria-hidden="true">● </span>
      API подключён · режим оценщика:{' '}
      <strong>{health.data.evaluator_mode === 'test' ? 'тестовый (синтетические ответы)' : 'production'}</strong>
    </span>
  );
}

function Shell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  // Move focus to main content on route change for keyboard and screen-reader users.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>
        Перейти к содержимому
      </a>
      <header className="topbar">
        <span className="brand">CQA</span>
        <nav aria-label="Основные разделы">
          <NavLink to="/conversations">Диалоги</NavLink>
          <NavLink to="/checklists">Чек-листы</NavLink>
          <NavLink to="/appeals">Апелляции</NavLink>
        </nav>
        <HealthLine />
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

// Hash routing keeps deep links working on refresh with any static host (the API serves
// the build through StaticFiles without an SPA fallback).
export const routes = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/conversations" replace /> },
      { path: 'conversations', element: <ConversationsPage /> },
      { path: 'conversations/:id', element: <ConversationPage /> },
      { path: 'evaluations/:id', element: <EvaluationPage /> },
      { path: 'batches/:id', element: <BatchPage /> },
      { path: 'checklists', element: <ChecklistsPage /> },
      { path: 'checklists/new', element: <ChecklistEditorPage /> },
      { path: 'checklists/:id/edit', element: <ChecklistEditorPage /> },
      { path: 'checklists/version/:versionId', element: <ChecklistVersionRedirect /> },
      { path: 'checklists/:id', element: <ChecklistPage /> },
      { path: 'appeals', element: <AppealsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 0 },
      mutations: { retry: 0 },
    },
  });
}

export function App({ client }: { client?: QueryClient }) {
  const queryClient = useRef(client ?? makeQueryClient()).current;
  const router = useRef(createHashRouter(routes)).current;
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
