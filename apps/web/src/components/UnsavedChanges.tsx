import { useContext, useEffect } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';
import { Modal } from './Modal';

function RouteGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(dirty);
  return (
    <Modal open={blocker.state === 'blocked'} title="Есть несохранённые изменения" onClose={() => blocker.reset?.()}>
      <p>Новая версия ещё не сохранена. При уходе изменения в черновике будут потеряны.</p>
      <div className="row">
        <button type="button" onClick={() => blocker.reset?.()}>
          Продолжить редактирование
        </button>
        <button type="button" onClick={() => blocker.proceed?.()}>
          Уйти без сохранения
        </button>
      </div>
    </Modal>
  );
}

export function UnsavedChanges({ dirty }: { dirty: boolean }) {
  const router = useContext(UNSAFE_DataRouterContext);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  return router ? <RouteGuard dirty={dirty} /> : null;
}
