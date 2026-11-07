import { expect, test } from 'vitest';
import conversation from '../../../../fixtures/contracts/conversation-chat.json';
import type { CallRecord, Conversation, Evidence } from '../api/types';
import { parseImportJson } from '../components/ImportPanel';
import { totalCost } from './cost';
import { evidenceMessageIds } from './evidence';
import { decimalRu, totalRu } from './format';

const conv = conversation as Conversation;

test('totals are re-rendered from server strings without arithmetic (MASTER reference values)', () => {
  // Values as the server returns them for the MASTER examples; formatting only.
  expect(totalRu('100.00')).toBe('100,00');
  expect(totalRu('95.50')).toBe('95,50');
  expect(totalRu('85.50')).toBe('85,50');
  expect(totalRu('85.38')).toBe('85,38');
  expect(totalRu('100')).toBe('100,00');
  expect(totalRu(null)).toBe('—');
  expect(decimalRu('10.5')).toBe('10,5');
  expect(decimalRu('15')).toBe('15');
});

test('range evidence covers whole messages with inclusive bounds', () => {
  const first = conv.messages[0].id;
  const last = conv.messages[conv.messages.length - 1].id;
  const range: Evidence = {
    schema_version: '1.0',
    kind: 'range',
    start_message_id: first,
    end_message_id: last,
    relation: 'support',
    explanation: 'x',
  };
  expect(evidenceMessageIds(range, conv.messages)).toEqual(conv.messages.map((m) => m.id));
  const unknown: Evidence = { ...range, end_message_id: 'm9999' };
  expect(evidenceMessageIds(unknown, conv.messages)).toEqual([]);
  const message: Evidence = { schema_version: '1.0', kind: 'message', message_ids: [last, 'm9999'], relation: 'support', explanation: 'x' };
  expect(evidenceMessageIds(message, conv.messages)).toEqual([last]);
});

test('import parser checks readability and envelope only', () => {
  expect(parseImportJson('{').ok).toBe(false);
  expect(parseImportJson('{"foo":1}').ok).toBe(false);
  expect(parseImportJson('{"source":"organizer_api","records":[]}').ok).toBe(false);
  const ok = parseImportJson('{"records":[{"external_id":"x"}]}');
  expect(ok.ok && ok.body.source).toBe('json');
  const arr = parseImportJson('[{"external_id":"x"}]');
  expect(arr.ok && arr.body.records.length).toBe(1);
});

test('unknown cost stays unknown and is never added as zero', () => {
  const base = { schema_version: '1.0', currency: 'USD' } as const;
  const known = { ...base, cost: '0.0012' } as unknown as CallRecord;
  const other = { ...base, cost: '0.3' } as unknown as CallRecord;
  const unknown = { ...base, cost: null } as unknown as CallRecord;
  expect(totalCost([known, other])).toEqual({ known: '0.3012', complete: true, currency: 'USD' });
  expect(totalCost([known, unknown])).toEqual({ known: '0.0012', complete: false, currency: 'USD' });
  expect(totalCost([unknown])).toEqual({ known: null, complete: false, currency: 'USD' });
});
