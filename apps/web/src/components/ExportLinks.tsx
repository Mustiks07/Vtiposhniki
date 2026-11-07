import { useId, useState } from 'react';
import { batchExportUrl, evaluationExportUrl } from '../api/client';

/** Links to the server's safe export routes; the UI never assembles an export itself. */
export function ExportLinks({ kind, id }: { kind: 'batch' | 'evaluation'; id: string }) {
  const [scope, setScope] = useState<'automatic' | 'effective'>('automatic');
  const name = useId();
  const url = kind === 'batch' ? batchExportUrl : evaluationExportUrl;
  return (
    <section className="panel export" aria-labelledby={`${name}-t`}>
      <h2 id={`${name}-t`}>Безопасный экспорт</h2>
      <fieldset className="segmented">
        <legend>Вид результата</legend>
        <label>
          <input type="radio" name={name} checked={scope === 'automatic'} onChange={() => setScope('automatic')} />{' '}
          Оценка AI — исходный результат оценщика
        </label>
        <label>
          <input type="radio" name={name} checked={scope === 'effective'} onChange={() => setScope('effective')} />{' '}
          После пересмотра — с учётом решений проверяющего
        </label>
      </fieldset>
      <div className="row">
        <a className="button" href={url(id, scope, 'json')} download data-testid="export-json">
          Скачать JSON
        </a>
        <a className="button" href={url(id, scope, 'csv')} download data-testid="export-csv">
          Скачать CSV
        </a>
      </div>
      <p className="hint">
        Экспорт формирует сервер: решения, баллы, статусы, версии и ID сообщений без транскрипта и свободного текста.
        {kind === 'batch' ? ' Незавершённые и ошибочные задания сохраняются в экспорте.' : ''} Неизвестная стоимость
        остаётся пустой, а не нулевой.
      </p>
    </section>
  );
}
