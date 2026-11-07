import { useState, type RefObject } from 'react';
import type { Conversation } from '../api/types';

export type AudioTiming = { firstOffset: string; pauses: string };
export const DEFAULT_AUDIO_TIMING: AudioTiming = { firstOffset: '0', pauses: '' };

function sourceSeconds(value: string): number | null {
  if (/^\d{1,4}:[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed / 1000 : null;
}

/** Navigation estimate only. Never writes AudioMetadata or claims alignment. */
export function approximateAudioPositions(conversation: Conversation, timing: AudioTiming) {
  const positions = new Map<string, number>();
  const offset = Number(timing.firstOffset);
  if (!timing.firstOffset.trim() || !Number.isFinite(offset) || offset < 0) {
    return { positions, error: 'Укажите неотрицательное смещение первой реплики в секундах.' };
  }
  const pauses: [number, number][] = [];
  for (const part of timing.pauses.split(/[;\n]/).map((p) => p.trim()).filter(Boolean)) {
    const match = /^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$/.exec(part);
    if (!match || !Number.isFinite(Number(match[2])) || Number(match[2]) <= Number(match[1])) {
      return { positions, error: 'Каждая пауза: начало–конец в секундах, например 30–45; 80–90.' };
    }
    pauses.push([Number(match[1]), Number(match[2])]);
  }
  pauses.sort((a, b) => a[0] - b[0]);
  if (pauses.some((p, i) => i > 0 && p[0] < pauses[i - 1][1])) {
    return { positions, error: 'Паузы не должны пересекаться.' };
  }
  const first = conversation.messages[0]?.timestamp_original ?? '';
  const base = sourceSeconds(first);
  if (base === null) return { positions, error: 'Нет понятной метки первой реплики: приблизительный переход недоступен.' };
  let previous = base;
  for (const message of conversation.messages) {
    // Do not mix calendar timestamps and relative clock labels.
    if (message.timestamp_original.includes('T') !== first.includes('T')) continue;
    const source = sourceSeconds(message.timestamp_original);
    if (source === null) continue;
    if (source < previous) return { positions: new Map<string, number>(), error: 'Метки идут не по порядку: уточните исходную запись.' };
    previous = source;
    const elapsed = source - base;
    if (pauses.some(([start, end]) => elapsed >= start && elapsed < end)) continue;
    const removed = pauses.filter(([, end]) => end <= elapsed).reduce((sum, [start, end]) => sum + end - start, 0);
    positions.set(message.id, offset + elapsed - removed);
  }
  return { positions, error: null };
}

export function useAudioNavigation(conversation: Conversation | undefined, player: RefObject<HTMLAudioElement | null>) {
  const key = conversation ? `${conversation.id}:${conversation.revision}` : '';
  const [saved, setSaved] = useState<{ key: string; timing: AudioTiming } | null>(null);
  const timing = saved?.key === key ? saved.timing : DEFAULT_AUDIO_TIMING;
  const approximate = conversation ? approximateAudioPositions(conversation, timing) : { positions: new Map<string, number>(), error: null };
  const available = conversation?.channel === 'voice_call' && conversation.audio.access_path && conversation.audio.availability === 'available';
  const positions = conversation && available && conversation.audio.alignment_status !== 'verified' ? approximate.positions : new Map<string, number>();
  function seek(messageId: string) {
    const verified = conversation?.audio.alignment_status === 'verified'
      ? conversation.audio.mapping?.find((m) => m.message_id === messageId)?.start_seconds : undefined;
    const start = verified === undefined ? positions.get(messageId) : Number(verified);
    const audio = player.current;
    if (start === undefined || !audio || audio.readyState < 1 || !Number.isFinite(audio.duration) || start > audio.duration) return;
    audio.currentTime = start;
    void audio.play().catch(() => undefined);
  }
  return { timing, setTiming: (value: AudioTiming) => setSaved({ key, timing: value }), positions, error: approximate.error, seek };
}
