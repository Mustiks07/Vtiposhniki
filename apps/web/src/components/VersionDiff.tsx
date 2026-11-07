import type { ChecklistVersion } from '../api/types';
import { diffVersions, fieldLabel } from '../lib/checklistDraft';
import { shortId } from '../lib/format';

export function VersionDiff({ from, to }: { from: ChecklistVersion; to: ChecklistVersion }) {
  const d = diffVersions(from, to);
  const nothing = !d.criteria.length && !d.sections.length && !d.title;
  return (
    <section className="panel" aria-labelledby="diff-title" data-testid="version-diff">
      <h2 id="diff-title">
        Сравнение {shortId(from.version_id)} → {shortId(to.version_id)}
      </h2>
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
            <strong>{c.kind === 'added' ? '+ Добавлен' : c.kind === 'removed' ? '− Удалён' : '± Изменён'}</strong>: {c.title}{' '}
            <code className="muted">{c.id}</code>
            {c.fields.length ? <div>Изменено: {c.fields.map(fieldLabel).join(', ')}</div> : null}
          </li>
        ))}
      </ul>
      <p className="hint">
        Изменения весов, долей, секций и порядка не меняют смысловой запрос; изменения определений, вариантов, N/A и
        инструкций требуют новой оценки.
      </p>
    </section>
  );
}
