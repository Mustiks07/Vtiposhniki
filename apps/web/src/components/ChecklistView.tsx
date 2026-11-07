import type { ChecklistVersion } from '../api/types';
import { decimalRu } from '../lib/format';
import { responseTypeLabel } from '../lib/labels';
import { ScaleTable } from './CriterionDetail';

/** Read-only snapshot of an immutable checklist version. */
export function ChecklistView({ version }: { version: ChecklistVersion }) {
  const sections = new Map((version.sections ?? []).map((s) => [s.id, s.title]));
  return (
    <div className="checklist-view" data-testid="checklist-view">
      <h2>{version.title}</h2>
      <p className="muted">
        Версия <code>{version.version_id}</code> · критериев {version.criteria.length} · секций {(version.sections ?? []).length}
      </p>
      <ol className="criteria-snapshot">
        {version.criteria.map((c) => (
          <li key={c.id} data-testid="snapshot-criterion" data-criterion-id={c.id}>
            <h3>
              {c.title} <span className="muted">· {responseTypeLabel[c.response_type]}</span>
            </h3>
            <p className="muted">
              ID <code>{c.id}</code> · вес {decimalRu(c.weight)} · секция{' '}
              {c.section_id ? (sections.get(c.section_id) ?? c.section_id) : 'без секции'}
              {c.requires_reference ? ' · нужен источник' : ''}
            </p>
            <p>{c.definition}</p>
            <ScaleTable criterion={c} selected={null} />
            {c.channel_instructions.agent_chat || c.channel_instructions.voice_call ? (
              <dl className="meta">
                {c.channel_instructions.agent_chat ? (
                  <>
                    <dt>Для чатов</dt>
                    <dd>{c.channel_instructions.agent_chat}</dd>
                  </>
                ) : null}
                {c.channel_instructions.voice_call ? (
                  <>
                    <dt>Для звонков</dt>
                    <dd>{c.channel_instructions.voice_call}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
