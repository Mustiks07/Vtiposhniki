import { forwardRef, useState } from 'react';
import { audioUrl } from '../api/client';
import type { Conversation } from '../api/types';

/**
 * Real player over the server's audio route for the pinned revision. No fake waveform or
 * separate speaker tracks. Exact seeking is offered only with a verified mapping.
 */
export const AudioPanel = forwardRef<HTMLAudioElement, { conversation: Conversation }>(function AudioPanel(
  { conversation },
  ref,
) {
  const audio = conversation.audio;
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  if (conversation.channel !== 'voice_call' && audio.availability !== 'available') return null;

  const alignment =
    audio.alignment_status === 'verified' && audio.mapping
      ? 'Привязка реплик к записи подтверждена сервером: можно перейти к началу реплики.'
      : 'Привязка реплик к времени записи не подтверждена: переход возможен только к реплике в тексте, позиция в записи неизвестна.';

  return (
    <section className="panel audio" aria-labelledby="audio-title">
      <h2 id="audio-title">Запись разговора</h2>
      {audio.availability === 'available' && audio.access_path ? (
        <>
          <audio
            ref={ref}
            controls
            preload="metadata"
            src={audioUrl(audio.access_path, conversation.revision)}
            onLoadStart={() => setState('loading')}
            onCanPlay={() => setState('ready')}
            onError={() => setState('error')}
            data-testid="audio-player"
          >
            Браузер не поддерживает воспроизведение аудио.
          </audio>
          <p role="status" aria-live="polite" className="hint">
            {state === 'loading' ? 'Загрузка записи…' : null}
            {state === 'error' ? 'Не удалось воспроизвести запись: сервер не отдал аудио или доступ истёк. Текстовая оценка доступна.' : null}
            {state === 'ready' ? 'Запись готова к воспроизведению.' : null}
          </p>
        </>
      ) : audio.availability === 'unavailable' ? (
        <p className="notice" data-testid="audio-unavailable">
          Запись недоступна для этой revision. Оценка выполнена по тексту; ограничения анализа звука указаны в критериях.
        </p>
      ) : (
        <p className="notice" data-testid="audio-unknown">
          Наличие записи не подтверждено сервером. Оценка выполнена по тексту.
        </p>
      )}
      <p className="hint" data-testid="audio-alignment">
        {alignment}
      </p>
    </section>
  );
});
