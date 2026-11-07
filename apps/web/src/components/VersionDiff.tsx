import { useId } from 'react';
import type { ChecklistVersion } from '../api/types';
import { diffVersions, fieldLabel } from '../lib/checklistDraft';
import { checklistVersionLabel } from './ChecklistView';

export function VersionDiff({
  from,
  to,
  fromLabel,
  toLabel,
}: {
  from: ChecklistVersion;
  to: ChecklistVersion;
  fromLabel?: string;
  toLabel?: string;
}) {
  const headingId = useId();
  const d = diffVersions(from, to);
  const nothing = !d.criteria.length && !d.sections.length && !d.title;
  return (
    <section className="panel checklist-version-diff" aria-labelledby={headingId} data-testid="version-diff">
      <h2 id={headingId}>Что изменилось в правилах</h2>
      <div className="checklist-diff-versions">
        <div>
          <small>Было</small>
          <strong>{fromLabel ?? checklistVersionLabel(from)}</strong>
          <span>{from.title}</span>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <small>Стало</small>
          <strong>{toLabel ?? checklistVersionLabel(to)}</strong>
          <span>{to.title}</span>
        </div>
      </div>
      {nothing ? <p>Правила не отличаются.</p> : null}
      {d.title ? (
        <p>
          Название: «{from.title}» → «{to.title}»
        </p>
      ) : null}
      {d.sections.length ? <p className="diff-changed">Изменён состав или названия секций.</p> : null}
      <ul className="card-list">
        {d.criteria.map((c) => (
          <li key={`${c.kind}-${c.id}`} className={`diff-${c.kind}`} data-testid="diff-item" data-kind={c.kind}>
            <strong>{c.kind === 'added' ? '+ Добавлен' : c.kind === 'removed' ? '− Удалён' : '± Изменён'}</strong>:{' '}
            {c.title} {c.fields.length ? <div>Изменено: {c.fields.map(fieldLabel).join(', ')}</div> : null}
            <details className="checklist-technical">
              <summary>Технические сведения критерия</summary>
              <code>{c.id}</code>
            </details>
          </li>
        ))}
      </ul>
      <p className="hint">
        Изменения весов, долей, секций и порядка не меняют смысловой запрос; изменения определений, вариантов, N/A и
        инструкций требуют новой оценки.
      </p>
      <details className="checklist-technical">
        <summary>Технические сведения сравнения</summary>
        <dl className="meta">
          <dt>ID исходной версии</dt>
          <dd>
            <code>{from.version_id}</code>
          </dd>
          <dt>ID новой версии</dt>
          <dd>
            <code>{to.version_id}</code>
          </dd>
        </dl>
      </details>
    </section>
  );
}
