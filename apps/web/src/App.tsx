import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { api } from './api/client';
import { Icon } from './components/Icon';
import { AppealsPage } from './pages/AppealsPage';
import { BatchPage } from './pages/BatchPage';
import { ChecklistPage, ChecklistVersionRedirect } from './pages/ChecklistPage';
import { ChecklistsPage } from './pages/ChecklistsPage';
import { ConversationPage } from './pages/ConversationPage';
import { Loading } from './components/States';
import { ConversationsPage } from './pages/ConversationsPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { NotFound } from './pages/NotFound';

const ComparisonPage = lazy(() =>
  import('./pages/ComparisonPage').then((module) => ({ default: module.ComparisonPage })),
);
const ChecklistEditorPage = lazy(() =>
  import('./pages/ChecklistEditorPage').then((module) => ({ default: module.ChecklistEditorPage })),
);

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
      <strong>{health.data.evaluator_mode === 'test' ? 'Тестовый режим' : 'API подключён'}</strong>
      <small>{health.data.evaluator_mode === 'test' ? 'Синтетические ответы' : 'Рабочий режим · production'}</small>
    </span>
  );
}

function Shell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  // Move focus to main content on route changes (not on first load, so the skip link and
  // navigation stay first in tab order) for keyboard and screen-reader users.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Перейти к содержимому
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            c
          </span>
          <div>
            <b>CQA</b>
            <span>Контроль качества</span>
          </div>
        </div>
        <p className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</p>
        <nav aria-label="Основные разделы">
          <NavLink to="/conversations">
            <Icon name="chat" />
            Диалоги
          </NavLink>
          <NavLink to="/checklists">
            <Icon name="checklist" />
            Чек-листы
          </NavLink>
          <NavLink to="/appeals">
            <Icon name="appeal" />
            Апелляции
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <HealthLine />
          <p>Журнал доказательств</p>
          <span>От разговора — к обоснованной оценке.</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-bar">
          <span>Conversation Quality Analytics</span>
          <span className="workspace-label">Локальное рабочее место</span>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
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
      {
        path: 'conversations/:id/compare',
        element: (
          <Suspense fallback={<Loading />}>
            <ComparisonPage />
          </Suspense>
        ),
      },
      { path: 'evaluations/:id', element: <EvaluationPage /> },
      { path: 'batches/:id', element: <BatchPage /> },
      { path: 'checklists', element: <ChecklistsPage /> },
      {
        path: 'checklists/new',
        element: (
          <Suspense fallback={<Loading />}>
            <ChecklistEditorPage />
          </Suspense>
        ),
      },
      {
        path: 'checklists/:id/edit',
        element: (
          <Suspense fallback={<Loading />}>
            <ChecklistEditorPage />
          </Suspense>
        ),
      },
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
