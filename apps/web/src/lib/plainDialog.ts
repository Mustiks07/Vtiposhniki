// Plain-text dialog → existing JSONImport v1 record. Pure functions, no I/O.
//
// Format (documented in the import form):
//   [00:02] client: Здравствуйте.
//   operator: Добрый день! Меня зовут Анна.
//     Чем могу помочь?            ← an indented line continues the previous message
//   system: Оператор подключился.
//
// Rules are explicit so nothing is guessed silently:
// - a message starts at a non-indented line `[time] role: text` (time optional);
// - roles: client/operator/bot/system, or the documented Russian aliases, any letter case;
// - an unknown role, a line without a role, an invalid time or an empty message is an error
//   with its line number; such input cannot be imported until it is fixed;
// - a line starting with a space or tab continues the previous message (line break kept);
//   blank lines inside a message are kept only when an indented line follows them;
// - text after `role:` (one separating space removed) is kept verbatim, including colons;
// - a missing time is sent as an empty timestamp_original (as the organizer adapter does),
//   never as 00:00.
import type { ImportRecord, Language, Channel } from '../api/types';

export type Speaker = ImportRecord['messages'][number]['speaker'];

export interface ParsedMessage {
  /** 1-based ordinal in the dialog. */
  number: number;
  speaker: Speaker;
  /** Exact text of the time marker, or null when the line has none. */
  time: string | null;
  text: string;
  /** 1-based input line where the message starts. */
  line: number;
}

export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParseResult {
  messages: ParsedMessage[];
  errors: ParseIssue[];
}

const ROLE_ALIASES: Record<string, Speaker> = {
  client: 'client',
  operator: 'operator',
  bot: 'bot',
  system: 'system',
  клиент: 'client',
  оператор: 'operator',
  бот: 'bot',
  система: 'system',
};

export const SUPPORTED_ROLES_TEXT = 'client, operator, bot, system (или клиент, оператор, бот, система)';

// Same relative form the server parses (apps/api importing.RELATIVE_TIME): M:SS, MM:SS, H:MM:SS.
const RELATIVE_TIME = /^\d{1,4}:[0-5]\d(:[0-5]\d)?$/;
// ISO 8601 date-time with an explicit offset; without an offset the server cannot place it.
const ISO_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/;

/** Header: optional [time], a role word, a colon. Role is any run of letters so that an
 * unknown role is reported instead of being merged into the previous message. */
const HEADER = /^(?:\[([^\]]*)\]\s*)?([\p{L}_-]+)\s*:(.*)$/u;
const TIME_ONLY = /^\[([^\]]*)\]\s*(.*)$/;

function validTime(value: string): string | null {
  if (RELATIVE_TIME.test(value)) return null;
  const iso = ISO_TIME.exec(value);
  if (iso) {
    const [, y, mo, d, h, mi, s, zone] = iso;
    const offset = zone.replace(':', '').slice(1);
    const zoneOk = zone === 'Z' || (Number(offset.slice(0, 2)) < 24 && Number(offset.slice(2)) < 60);
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    const dateOk =
      date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(mo) - 1 && date.getUTCDate() === Number(d);
    if (dateOk && zoneOk && Number(h) < 24 && Number(mi) < 60 && (s === undefined || Number(s) < 60)) return null;
    return `несуществующие дата или время «${value}»`;
  }
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) {
    return `у даты-времени «${value}» нет часового пояса — добавьте Z или смещение, например +05:00`;
  }
  return `метка времени «${value}» не поддерживается — используйте ММ:СС, Ч:ММ:СС или ISO 8601 с часовым поясом`;
}

export function parsePlainDialog(input: string): ParseResult {
  const lines = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const messages: ParsedMessage[] = [];
  const errors: ParseIssue[] = [];
  let current: ParsedMessage | null = null;
  let pendingBlank = 0;
  // A message whose header failed is skipped together with its continuation lines,
  // so one mistake produces one error, not a cascade.
  let skipping = false;

  lines.forEach((raw, index) => {
    const line = index + 1;
    if (raw.trim() === '') {
      if (current) pendingBlank += 1;
      return;
    }
    if (/^[ \t]/.test(raw)) {
      if (skipping) return;
      if (!current) {
        errors.push({ line, message: 'строка с отступом продолжает сообщение, но перед ней нет начала сообщения' });
        return;
      }
      current.text += '\n'.repeat(pendingBlank + 1) + raw.replace(/^[ \t]+/, '');
      pendingBlank = 0;
      return;
    }
    pendingBlank = 0;
    current = null;
    skipping = true;
    const header = HEADER.exec(raw);
    if (!header) {
      const timeOnly = TIME_ONLY.exec(raw);
      errors.push({
        line,
        message: timeOnly
          ? 'после времени не указана роль — нужна запись вида «[00:05] operator: текст»'
          : 'не указана роль. Начните строку с «роль:» или добавьте отступ, если это продолжение предыдущего сообщения',
      });
      return;
    }
    const [, timeRaw, roleRaw, rest] = header;
    const speaker = ROLE_ALIASES[roleRaw.toLowerCase()];
    if (!speaker) {
      errors.push({
        line,
        message: `неизвестная роль «${roleRaw}». Допустимы: ${SUPPORTED_ROLES_TEXT}. Если это продолжение текста, добавьте отступ`,
      });
      return;
    }
    let time: string | null = null;
    if (timeRaw !== undefined) {
      time = timeRaw.trim();
      if (!time) {
        errors.push({ line, message: 'пустые квадратные скобки: укажите время или удалите [ ]' });
        return;
      }
      const problem = validTime(time);
      if (problem) {
        errors.push({ line, message: problem });
        return;
      }
    }
    skipping = false;
    current = { number: messages.length + 1, speaker, time, text: rest.replace(/^ /, ''), line };
    messages.push(current);
  });

  for (const m of messages) {
    if (m.text.trim() === '') errors.push({ line: m.line, message: 'у сообщения нет текста' });
  }
  if (!messages.length && !errors.length) errors.push({ line: 1, message: 'вставьте текст диалога' });
  errors.sort((a, b) => a.line - b.line);
  return { messages, errors };
}

/** The JSONImport v1 record for confirmed, error-free input. */
export function toImportRecord(
  messages: ParsedMessage[],
  meta: { externalId: string; language: Language; channel: Channel },
): ImportRecord {
  return {
    schema_version: '1.0',
    external_id: meta.externalId,
    channel: meta.channel,
    language: meta.language,
    messages: messages.map((m) => ({
      schema_version: '1.0',
      speaker: m.speaker,
      text: m.text,
      timestamp_original: m.time ?? '',
    })),
  };
}

/** A readable, collision-resistant external ID created once per draft. */
export function newPastedExternalId(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, '0')).join('')
      : Math.random().toString(16).slice(2, 8);
  return `paste-${stamp}-${rand}`;
}

export const PLAIN_DIALOG_EXAMPLE = `[00:02] client: Здравствуйте, не могу вывести деньги.
[00:05] operator: Добрый день! Меня зовут Анна.
  Подскажите, какой способ вывода вы выбрали?
system: Оператор подключился к чату.`;
