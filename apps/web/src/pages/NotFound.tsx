import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <section className="not-found"><span className="not-found-code" aria-hidden="true">404</span><h1>Здесь пока ничего нет</h1><p>Страница не найдена. Возможно, ссылка изменилась.</p><Link className="button primary" to="/conversations">Вернуться к диалогам</Link></section>
  );
}
