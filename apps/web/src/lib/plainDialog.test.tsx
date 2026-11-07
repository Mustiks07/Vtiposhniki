// Kept as *.test.tsx: vitest.include is src/**/*.test.tsx, so a *.test.ts file would not run.
import { expect, test } from 'vitest';
import { newPastedExternalId, parsePlainDialog, PLAIN_DIALOG_EXAMPLE, toImportRecord } from './plainDialog';

test('parses roles, optional times, multi-line text and colons inside text verbatim', () => {
  const input = [
    '[00:02] client: Здравствуйте: не могу вывести деньги.',
    '[00:05] operator: Добрый день! Меня зовут Анна.',
    '  Чем могу помочь?',
    'system: Оператор подключился.',
    'BOT: Ссылка: https://example.test/a:b',
  ].join('\n');
  const { messages, errors } = parsePlainDialog(input);
  expect(errors).toEqual([]);
  expect(messages.map((m) => [m.number, m.speaker, m.time, m.text, m.line])).toEqual([
    [1, 'client', '00:02', 'Здравствуйте: не могу вывести деньги.', 1],
    [2, 'operator', '00:05', 'Добрый день! Меня зовут Анна.\nЧем могу помочь?', 2],
    [3, 'system', null, 'Оператор подключился.', 4],
    [4, 'bot', null, 'Ссылка: https://example.test/a:b', 5],
  ]);
});

test('keeps KZ/EN Unicode, Russian role aliases and blank lines inside a continued message', () => {
  const input = 'Клиент: Сәлеметсіз бе! Шотты қалай толтырамын?\n\noperator: Hello, I am Aida.\n\n\tFirst step.\n\n  Second step.\n\nСИСТЕМА: Чат закрыт.';
  const { messages, errors } = parsePlainDialog(input);
  expect(errors).toEqual([]);
  expect(messages.map((m) => m.speaker)).toEqual(['client', 'operator', 'system']);
  expect(messages[0].text).toBe('Сәлеметсіз бе! Шотты қалай толтырамын?');
  expect(messages[1].text).toBe('Hello, I am Aida.\n\nFirst step.\n\nSecond step.');
  expect(messages[2].text).toBe('Чат закрыт.');
});

test('accepts the time forms the server import understands and rejects others with the line number', () => {
  const ok = parsePlainDialog('[1:02:03] client: a\n[2026-11-07T10:00:00+05:00] operator: b\n[2026-11-07 10:00Z] bot: c');
  expect(ok.errors).toEqual([]);
  expect(ok.messages.map((m) => m.time)).toEqual(['1:02:03', '2026-11-07T10:00:00+05:00', '2026-11-07 10:00Z']);

  const bad = parsePlainDialog(
    '[00:61] client: a\n[вчера] operator: b\n[2026-11-07T10:00:00] client: c\n[2026-02-30T10:00Z] client: d\n[] client: e',
  );
  expect(bad.messages).toEqual([]);
  expect(bad.errors.map((e) => e.line)).toEqual([1, 2, 3, 4, 5]);
  expect(bad.errors[0].message).toContain('«00:61» не поддерживается');
  expect(bad.errors[2].message).toContain('нет часового пояса');
  expect(bad.errors[3].message).toContain('несуществующие');
  expect(bad.errors[4].message).toContain('пустые квадратные скобки');
  for (const zone of ['+24:00', '-00:60', '+99:99']) {
    expect(parsePlainDialog(`[2026-11-07T10:00:00${zone}] client: text`).errors).toHaveLength(1);
  }
});

test('unknown roles, missing roles, orphan continuations and empty input are explained, never guessed', () => {
  const r = parsePlainDialog('  orphan\nmanager: Привет\n  his continuation is skipped with him\nПросто текст без роли\n[00:05] Здравствуйте\noperator:');
  expect(r.messages.map((m) => m.speaker)).toEqual(['operator']);
  expect(r.errors.map((e) => e.line)).toEqual([1, 2, 4, 5, 6]);
  expect(r.errors[0].message).toContain('нет начала сообщения');
  expect(r.errors[1].message).toContain('неизвестная роль «manager»');
  expect(r.errors[2].message).toContain('не указана роль');
  expect(r.errors[3].message).toContain('после времени не указана роль');
  expect(r.errors[4].message).toContain('нет текста');
  expect(parsePlainDialog('   \n\n').errors).toEqual([{ line: 1, message: 'вставьте текст диалога' }]);
});

test('a missing time becomes an empty timestamp_original, never 00:00, and order is preserved', () => {
  const { messages } = parsePlainDialog('client: a\r\n[00:07] operator: b\r\nsystem: c');
  const record = toImportRecord(messages, { externalId: 'paste-x', language: 'KZ', channel: 'voice_call' });
  expect(record).toEqual({
    schema_version: '1.0',
    external_id: 'paste-x',
    channel: 'voice_call',
    language: 'KZ',
    messages: [
      { schema_version: '1.0', speaker: 'client', text: 'a', timestamp_original: '' },
      { schema_version: '1.0', speaker: 'operator', text: 'b', timestamp_original: '00:07' },
      { schema_version: '1.0', speaker: 'system', text: 'c', timestamp_original: '' },
    ],
  });
});

test('the documented example parses cleanly and generated IDs are readable and distinct', () => {
  expect(parsePlainDialog(PLAIN_DIALOG_EXAMPLE).errors).toEqual([]);
  expect(parsePlainDialog(PLAIN_DIALOG_EXAMPLE).messages).toHaveLength(3);
  const at = new Date(2026, 10, 7, 9, 5, 3);
  const a = newPastedExternalId(at);
  expect(a).toMatch(/^paste-20261107-090503-[0-9a-f]{6}$/);
  expect(newPastedExternalId(at)).not.toBe(a);
});
