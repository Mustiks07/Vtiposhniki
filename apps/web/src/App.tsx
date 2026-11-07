import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { api } from './api/client';
import { Icon } from './components/Icon';
import { PasteDraftProvider } from './components/ImportPanel';
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
  import('./pages/ComparisonPage').then((module) => ({
    default: module.ComparisonPage,
  })),
);
const TutorialPage = lazy(() =>
  import('./pages/TutorialPage').then((module) => ({
    default: module.TutorialPage,
  })),
);
const ChecklistEditorPage = lazy(() =>
  import('./pages/ChecklistEditorPage').then((module) => ({
    default: module.ChecklistEditorPage,
  })),
);

function HealthLine() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.health(signal),
    retry: 0,
  });
  if (health.isError) {
    return (
      <span className="health health-bad" role="status">
        <span aria-hidden="true">✕ </span>Нет связи с сервером
      </span>
    );
  }
  if (!health.data) return <span className="health">Подключение…</span>;
  return (
    <span className="health" data-testid="health">
      <span aria-hidden="true">● </span>
      <strong>{health.data.evaluator_mode === 'test' ? 'Тестовый режим' : 'Сервер подключён'}</strong>
      <small>{health.data.evaluator_mode === 'test' ? 'Синтетические ответы' : 'Локальное рабочее место'}</small>
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
          <div>
            <b>CQA</b>
            <span>Контроль качества</span>
          </div>
        </div>
        <nav aria-label="Основные разделы">
          <NavLink
            to="/conversations"
            className={({ isActive }) =>
              isActive || /^\/(evaluations|batches|example)\//.test(location.pathname) ? 'active' : undefined
            }
          >
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
        </div>
      </aside>
      <div className="workspace">
        <main id="main" ref={mainRef} tabIndex={-1}>
          <PasteDraftProvider>
            <Outlet />
          </PasteDraftProvider>
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
      {
        path: 'example/:exampleId',
        element: (
          <Suspense fallback={<Loading />}>
            <TutorialPage />
          </Suspense>
        ),
      },
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
      {
        path: 'checklists/version/:versionId',
        element: <ChecklistVersionRedirect />,
      },
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
