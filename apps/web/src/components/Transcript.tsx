import { useEffect, useRef, useState } from 'react';
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
  focusReady = true,
  onSeek,
  canSeek,
  citations,
  onCriterion,
}: {
  conversation: Conversation;
  highlighted: string[];
  /** Changes whenever the user activates an evidence link, to re-scroll to it. */
  focusToken: number;
  /** Wait for the mobile transcript pane to open before moving focus. */
  focusReady?: boolean;
  onSeek?: (messageId: string) => void;
  canSeek: boolean;
  citations?: Map<string, { id: string; number: number; title: string }[]>;
  onCriterion?: (id: string) => void;
}) {
  const [onlyEvidence, setOnlyEvidence] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const handledFocusToken = useRef<number | null>(null);
  const mapping = verifiedMapping(conversation.audio);
  const highlightSet = new Set(highlighted);

  useEffect(() => {
    if (!focusReady || handledFocusToken.current === focusToken || !highlighted.length || !listRef.current) return;
    const first = listRef.current.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(highlighted[0])}"]`);
    if (first) {
      first.scrollIntoView?.({
        block: 'center',
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
      first.focus({ preventScroll: true });
      handledFocusToken.current = focusToken;
    }
    // focusToken intentionally re-triggers scrolling for repeated clicks on the same evidence.
  }, [focusToken, focusReady, highlighted]);

  return (
    <section className="transcript" aria-label="Оригинал разговора" lang={htmlLang(conversation.language)}>
      <header className="transcript-head" lang="ru">
        <div>
          <h2>Разговор</h2>
          <span className="hint">
            {conversation.messages.length} реплик · исходная версия {conversation.revision}
          </span>
        </div>
        {citations ? (
          <div className="view-switch" role="group" aria-label="Сообщения разговора">
            <button type="button" aria-pressed={!onlyEvidence} onClick={() => setOnlyEvidence(false)}>
              Все сообщения
            </button>
            <button type="button" aria-pressed={onlyEvidence} onClick={() => setOnlyEvidence(true)}>
              Доказательства
            </button>
          </div>
        ) : null}
      </header>
      {(conversation.warnings ?? []).length ? (
        <details className="source-notes"><summary>Особенности исходной записи ({conversation.warnings?.length})</summary>
        <ul className="annotations" aria-label="Предупреждения источника">
          {(conversation.warnings ?? []).map((w, i) => (
            <li key={i} lang="ru">
              <span aria-hidden="true">ⓘ </span>
              {w}
            </li>
          ))}
        </ul></details>
      ) : null}
      <ol ref={listRef} className="messages">
        {conversation.messages.map((m: Message) => {
          const start = mapping?.get(m.id);
          const isHighlighted = highlightSet.has(m.id);
          const refs = citations?.get(m.id) ?? [];
          if (onlyEvidence && !refs.length && !isHighlighted) return null;
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
                <span className="speaker-avatar" aria-hidden="true">{(speakerLabel[m.speaker] ?? m.speaker)[0]}</span>
                <span className="msg-role">{speakerLabel[m.speaker] ?? m.speaker}</span>
                <span className="msg-id" title={`Технический ID: ${m.id}`}>#{m.source_index + 1}</span>
                <time className="msg-time" title="Исходная метка времени (без изменений)">
                  {m.timestamp_original || '—'}
                </time>
                {isHighlighted ? <span className="visually-hidden">(выделено доказательством)</span> : null}
                {canSeek && start !== undefined && onSeek ? (
                  <button type="button" className="link" onClick={() => onSeek(m.id)}>
                    ▶ запись с {decimalRu(start)} с
                  </button>
                ) : null}
              </div>
              <MessageText text={m.text} />
              {refs.length ? (
                <div className="margin-cites" lang="ru" aria-label="Связанные критерии">
                  {refs.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.title}
                      aria-label={`Критерий ${c.number}: ${c.title}`}
                      onClick={() => onCriterion?.(c.id)}
                    >
                      №{c.number}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {onlyEvidence && !citations?.size && !highlighted.length ? (
        <p className="hint">В этой оценке нет ссылок на реплики.</p>
      ) : null}
    </section>
  );
}
