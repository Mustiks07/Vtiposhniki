import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { detailReasonLabel, errorCodeLabel } from '../lib/labels';

export function Loading({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <p className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {label}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {children ? <div className="state-next">{children}</div> : null}
    </div>
  );
}

export function describeError(error: unknown): { title: string; hint: string } {
  if (error instanceof ApiError) {
    if (error.network) {
      return { title: 'Сервер недоступен', hint: 'Проверьте, что API запущен, и повторите.' };
    }
    if (error.status === 404) {
      return { title: 'Объект не найден', hint: 'Возможно, ссылка устарела или ID неизвестен.' };
    }
    const label = error.code ? errorCodeLabel[error.code] : undefined;
    return {
      title: label ?? `Ошибка сервера (HTTP ${error.status})`,
      hint: error.body?.retryable ? 'Повторите попытку позже.' : '',
    };
  }
  return { title: 'Непредвиденная ошибка', hint: 'Повторите действие.' };
}

/** Error with safe server details; raw provider errors never reach the UI. */
export function ErrorPanel({
  error,
  onRetry,
  retryLabel = 'Повторить чтение',
  children,
}: {
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
}) {
  const { title, hint } = describeError(error);
  const api = error instanceof ApiError ? error : null;
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">
        <span aria-hidden="true">⚠ </span>
        {title}
      </p>
      {hint ? <p>{hint}</p> : null}
      {api?.body?.details?.length ? (
        <ul className="error-details">
          {api.body.details.map((d, i) => (
            <li key={i}>
              {d.index !== null && d.index !== undefined ? `Запись №${d.index + 1}: ` : ''}
              {d.field ? <code>{d.field}</code> : null} {detailReasonLabel[d.reason] ?? d.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {children}
      <div className="row">
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
        {api?.correlationId ? (
          <small className="muted">
            correlation_id: <code>{api.correlationId}</code>
          </small>
        ) : null}
      </div>
    </div>
  );
}

const tone: Record<string, string> = {
  complete: 'ok',
  succeeded: 'ok',
  resolved: 'ok',
  partial: 'warn',
  retry_wait: 'warn',
  incomplete_evaluation: 'warn',
  no_applicable_weight: 'warn',
  undetermined: 'warn',
  open: 'info',
  pending: 'info',
  queued: 'info',
  running: 'info',
  failed: 'bad',
  cancelled: 'muted',
  unevaluated: 'muted',
};

const icon: Record<string, string> = { ok: '✓', warn: '◐', info: '…', bad: '✕', muted: '○' };

/** Status chip: text + glyph, so colour is never the only signal. */
export function Badge({ status, children }: { status: string; children: ReactNode }) {
  const t = tone[status] ?? 'muted';
  return (
    <span className={`badge badge-${t}`} data-status={status}>
      <span aria-hidden="true">{icon[t]} </span>
      {children}
    </span>
  );
}
