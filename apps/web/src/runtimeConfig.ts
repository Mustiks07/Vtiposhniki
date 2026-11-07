declare global {
  interface Window {
    CQA_CONFIG?: { apiBase?: string };
  }
}

/** Host configuration must be set before loading the application bundle. */
export function apiBase(): string {
  const configured = window.CQA_CONFIG?.apiBase?.trim();
  if (!configured) return '/api/v1';
  return configured.replace(/\/+$/, '');
}

export function embedding(search = window.location.search) {
  const params = new URLSearchParams(search);
  const embedded = params.get('embed') === '1';
  return { embedded, conversation: embedded ? params.get('conversation') : null };
}
