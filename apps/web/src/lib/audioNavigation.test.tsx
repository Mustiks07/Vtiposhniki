import { expect, test } from 'vitest';
import voice from '../../../../fixtures/contracts/conversation-voice-unverified.json';
import type { Conversation } from '../api/types';
import { approximateAudioPositions, DEFAULT_AUDIO_TIMING } from './audioNavigation';

function recording(times: string[]): Conversation {
  return { ...voice, messages: times.map((time, i) => ({
    ...voice.messages[0], id: `m${i + 1}`, ordinal: i + 1, source_index: i, timestamp_original: time,
  })) } as Conversation;
}

test('approximation subtracts only explicit recording pauses and excludes a message inside one', () => {
  const source = recording(['00:02', '00:07', '00:12', '00:22']);
  const before = JSON.stringify(source);
  const result = approximateAudioPositions(source, { firstOffset: '3', pauses: '5–10; 15–17' });
  expect([...result.positions]).toEqual([['m1', 3], ['m3', 8], ['m4', 16]]);
  expect(result.error).toBeNull();
  expect(JSON.stringify(source)).toBe(before);
  expect(source.audio.alignment_status).toBe('unverified');
});

test('absolute source times use elapsed time, not a wall-clock number as file position', () => {
  const source = recording(['2026-11-01T09:00:03Z', '2026-11-01T09:00:12Z']);
  expect([...approximateAudioPositions(source, DEFAULT_AUDIO_TIMING).positions.values()]).toEqual([0, 9]);
});

test('unknown origin and backwards timestamps do not produce guessed navigation', () => {
  for (const times of [['', '00:12'], ['00:20', '00:12']]) {
    const result = approximateAudioPositions(recording(times), DEFAULT_AUDIO_TIMING);
    expect(result.positions.size).toBe(0);
    expect(result.error).toBeTruthy();
  }
});

test('invalid or overlapping pauses block approximate navigation', () => {
  for (const pauses of ['10–5', '5–10; 8–15', 'неизвестно']) {
    const result = approximateAudioPositions(recording(['00:00', '00:20']), { firstOffset: '0', pauses });
    expect(result.positions.size).toBe(0);
    expect(result.error).toBeTruthy();
  }
});
