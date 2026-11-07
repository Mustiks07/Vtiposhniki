import { useEffect, useRef } from 'react';
import type { AudioMetadata, Conversation, Message } from '../api/types';
import { decimalRu } from '../lib/format';
import { speakerLabel } from '../lib/labels';
import { textLines } from '../lib/safeText';

export function htmlLang(language: string): string {
  return language === 'KZ' ? 'kk' : language.toLowerCase();
}

export function verifiedMapping(audio: AudioMetadata): Map<string, string> | null {
  if (audio.alignment_status !== 'verified' || !audio.mapping) return null;
  return new Map(audio.mapping.map((m) => [m.message_id, m.start_seconds]));
}

function MessageText({ text }: { text: string }) {
  // Rendered strictly as text nodes: HTML/Markdown in a transcript is never executed.
  const lines = textLines(text);
  return (
    <div className="msg-text">
      {lines.map((line, i) => (
        <p key={i}>{line || ' '}</p>
      ))}
    </div>
  );
}

export function Transcript({
  conversation,
  highlighted,
  focusToken,
  onSeek,
  canSeek,
}: {
  conversation: Conversation;
  highlighted: string[];
  /** Changes whenever the user activates an evidence link, to re-scroll to it. */
  focusToken: number;
  onSeek?: (messageId: string) => void;
  canSeek: boolean;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const mapping = verifiedMapping(conversation.audio);
  const highlightSet = new Set(highlighted);

  useEffect(() => {
    if (!highlighted.length || !listRef.current) return;
    const first = listRef.current.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(highlighted[0])}"]`);
    if (first) {
      first.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      first.focus({ preventScroll: true });
    }
    // focusToken intentionally re-triggers scrolling for repeated clicks on the same evidence.
  }, [focusToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="transcript" aria-label="Оригинал разговора" lang={htmlLang(conversation.language)}>
      {(conversation.warnings ?? []).length ? (
        <ul className="annotations" aria-label="Предупреждения источника">
          {(conversation.warnings ?? []).map((w, i) => (
            <li key={i} lang="ru">
              <span aria-hidden="true">ⓘ </span>
              {w}
            </li>
          ))}
        </ul>
      ) : null}
      <ol ref={listRef} className="messages">
        {conversation.messages.map((m: Message) => {
          const start = mapping?.get(m.id);
          const isHighlighted = highlightSet.has(m.id);
          return (
            <li
              key={m.id}
              id={`msg-${m.id}`}
              data-message-id={m.id}
              data-highlighted={isHighlighted ? 'true' : undefined}
              className={`msg msg-${m.speaker}${isHighlighted ? ' msg-highlight' : ''}`}
              tabIndex={-1}
              aria-current={isHighlighted ? 'true' : undefined}
            >
              <div className="msg-head" lang="ru">
                <span className="msg-role">{speakerLabel[m.speaker] ?? m.speaker}</span>
                <span className="msg-id">{m.id}</span>
                <time className="msg-time" title="Исходная метка времени (без изменений)">
                  {m.timestamp_original || '—'}
                </time>
                {m.parsed_time ? <span className="muted msg-parsed">разобрано сервером: {m.parsed_time}</span> : null}
                {isHighlighted ? <span className="visually-hidden">(выделено доказательством)</span> : null}
                {canSeek && start !== undefined && onSeek ? (
                  <button type="button" className="link" onClick={() => onSeek(m.id)}>
                    ▶ запись с {decimalRu(start)} с
                  </button>
                ) : null}
              </div>
              <MessageText text={m.text} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
