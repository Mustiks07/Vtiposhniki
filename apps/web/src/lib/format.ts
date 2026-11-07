// Pure display formatting. These functions never compute a score: they only re-render
// decimal strings received from the server (ScoreSummary) with a Russian decimal comma.

/** "95.50" -> "95,50"; "40" -> "40". No rounding, no parsing to float. */
export function decimalRu(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.replace('.', ',');
}

/**
 * Total score is shown with exactly two decimals. The server already rounds
 * (ROUND_HALF_UP, 2 places); here we only pad missing zeros of a fixed-point string.
 */
export function totalRu(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const [int, frac = ''] = value.split('.');
  return `${int},${(frac + '00').slice(0, 2)}`;
}

export function rawValueText(value: boolean | number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

const dateTime = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** Server timestamps are UTC ISO 8601; show them explicitly as UTC. */
export function serverTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${dateTime.format(d)} UTC`;
}

export function durationText(startIso: string, endIso: string | null | undefined): string {
  if (!endIso) return 'не завершён';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms} мс`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} с`;
}

export function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
