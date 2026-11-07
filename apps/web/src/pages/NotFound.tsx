import { Link } from 'react-router-dom';
import { Empty } from '../components/States';

export function NotFound() {
  return (
    <Empty title="Страница не найдена">
      <Link to="/conversations">Вернуться к диалогам</Link>
    </Empty>
  );
}
