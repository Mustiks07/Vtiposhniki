import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { audioUrl } from '../api/client';
import type { Conversation } from '../api/types';
import type { AudioTiming } from '../lib/audioNavigation';

/**
 * Real player over the server's audio route for the pinned revision. No fake waveform or
 * separate speaker tracks. Exact seeking is offered only with a verified mapping.
 */
export const AudioPanel = forwardRef<HTMLAudioElement, {
  conversation: Conversation; onAvailable?: () => void;
  timing?: AudioTiming; onTiming?: (timing: AudioTiming) => void; timingError?: string | null;
}>(
  function AudioPanel({ conversation, onAvailable, timing, onTiming, timingError }, ref) {
    const audio = conversation.audio;
    const player = useRef<HTMLAudioElement>(null);
    useImperativeHandle(ref, () => player.current!, [audio.access_path]);
    const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    if (conversation.channel !== 'voice_call' && !audio.access_path && audio.availability !== 'available') return null;

    const alignment =
      audio.alignment_status === 'verified' && audio.mapping
        ? 'Привязка реплик к записи подтверждена сервером: можно перейти к началу реплики.'
        : 'Привязка реплик к времени записи не подтверждена. Переход по меткам — приблизительно, не сверено со звуком.';

    return (
      <section className="panel audio" aria-labelledby="audio-title">
        <h2 id="audio-title">Запись разговора</h2>
        {audio.access_path ? (
          <>
            <audio
              ref={player}
              controls
              preload="metadata"
              src={audioUrl(audio.access_path, conversation.revision)}
              onLoadStart={() => setState('loading')}
              onLoadedMetadata={() => {
                setState('ready');
                if (audio.availability !== 'available') onAvailable?.();
              }}
              onCanPlay={() => setState('ready')}
              onError={() => setState('error')}
              data-testid="audio-player"
            >
              Браузер не поддерживает воспроизведение аудио.
            </audio>
            <label className="audio-speed">
              Скорость воспроизведения
              <select
                defaultValue="1"
                onChange={(event) => {
                  if (player.current) player.current.playbackRate = Number(event.target.value);
                }}
              >
                <option value="0.75">0,75×</option>
                <option value="1">1×</option>
                <option value="1.25">1,25×</option>
                <option value="1.5">1,5×</option>
                <option value="2">2×</option>
              </select>
            </label>
            <p role="status" aria-live="polite" className="hint">
              {state === 'loading' || state === 'idle' ? 'Загрузка записи…' : null}
              {state === 'error'
                ? 'Не удалось воспроизвести запись: сервер не отдал аудио или доступ истёк. Текстовая оценка доступна.'
                : null}
              {state === 'ready' ? 'Запись готова к воспроизведению.' : null}
            </p>
            {state === 'error' ? (
              <button
                type="button"
                onClick={() => {
                  setState('loading');
                  player.current?.load();
                }}
              >
                Повторить загрузку записи
              </button>
            ) : null}
          </>
        ) : audio.availability === 'unavailable' ? (
          <p className="notice" data-testid="audio-unavailable">
            Запись недоступна для этой версии. Оценка выполнена по тексту; ограничения анализа звука указаны в
            критериях.
          </p>
        ) : (
          <p className="notice" data-testid="audio-unknown">
            Наличие записи не подтверждено сервером. Оценка выполнена по тексту.
          </p>
        )}
        <p className="hint" data-testid="audio-alignment">
          {alignment}
        </p>
        {audio.access_path && audio.alignment_status !== 'verified' && timing && onTiming ? (
          <details className="technical-details">
            <summary>Уточнить начало и паузы записи</summary>
            <p className="hint">По умолчанию первая реплика считается началом файла. Это допущение. Паузы записи не определяются по молчанию: укажите только известные остановки записи.</p>
            <label>Первая реплика: секунд от начала файла
              <input type="number" min="0" step="any" value={timing.firstOffset} onChange={(e) => onTiming({ ...timing, firstOffset: e.target.value })} />
            </label>
            <label>Паузы записи: секунды от первой метки транскрипта
              <input value={timing.pauses} placeholder="30–45; 80–90" onChange={(e) => onTiming({ ...timing, pauses: e.target.value })} />
            </label>
            <p className="hint">Начало–конец каждой паузы; интервалы вычитаются из смещения. Реплика внутри паузы не имеет перехода. Настройка действует только в этой открытой карточке.</p>
            {timingError ? <p role="status" className="notice notice-warn">{timingError}</p> : null}
          </details>
        ) : null}
      </section>
    );
  },
);
