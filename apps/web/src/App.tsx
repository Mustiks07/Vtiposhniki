import { useEffect, useState } from 'react';
import { getHealth, type Health } from './api';

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal).then(setHealth).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, []);
  return <main>
    <p className="eyebrow">Conversation Quality Analytics</p>
    <h1>CQA · Foundation</h1>
    <p>Общий каркас для разработки. Оценка разговоров, импорт и апелляции ещё не реализованы.</p>
    <p role="status">{error ? 'API недоступен. Запустите сервер по README.' : health ? 'Контрактный API доступен' : 'Проверка API…'}</p>
    <p>Режим: {health?.evaluator_mode === 'test' ? 'тестовый' : 'production'}. Тестовые оценки автоматически не подключаются.</p>
    <a href="/docs">Контракт HTTP API</a>
  </main>;
}
