import type { Evidence, Message } from '../api/types';

/**
 * Message IDs covered by an evidence item. Ranges are whole messages with inclusive
 * bounds (contract v1). Unknown IDs yield an empty list so the UI can flag a broken link
 * rather than guessing.
 */
export function evidenceMessageIds(evidence: Evidence, messages: Message[]): string[] {
  if (evidence.kind === 'message') {
    const known = new Set(messages.map((m) => m.id));
    return (evidence.message_ids ?? []).filter((id) => known.has(id));
  }
  if (evidence.kind === 'range' && evidence.start_message_id && evidence.end_message_id) {
    const start = messages.findIndex((m) => m.id === evidence.start_message_id);
    const end = messages.findIndex((m) => m.id === evidence.end_message_id);
    if (start < 0 || end < 0) return [];
    const [lo, hi] = start <= end ? [start, end] : [end, start];
    return messages.slice(lo, hi + 1).map((m) => m.id);
  }
  return [];
}

export function evidenceRefText(evidence: Evidence, messages?: Message[]): string {
  const ref = (id: string | null | undefined) => {
    if (!messages) return id ?? '';
    const message = messages.find((m) => m.id === id);
    return message ? `№${message.source_index + 1}` : 'реплика недоступна';
  };
  if (evidence.kind === 'message') return (evidence.message_ids ?? []).map(ref).join(', ');
  if (evidence.kind === 'range') return `${ref(evidence.start_message_id)}–${ref(evidence.end_message_id)}`;
  return evidence.source_chunk_id ?? '';
}
