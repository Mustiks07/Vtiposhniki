import type { ChecklistVersion, VersionList } from '../api/types';
import { decimalRu, serverTime } from '../lib/format';
import { responseTypeLabel } from '../lib/labels';
import { ScaleTable } from './CriterionDetail';
import './checklist-design.css';

/** The API returns creation order, newest first. Never infer a version from its opaque ID. */
export function checklistVersionLabel(version: ChecklistVersion, history?: VersionList): string {
  const index = history?.items.findIndex((item) => item.version_id === version.version_id) ?? -1;
  const number = history && index >= 0 ? history.total - history.offset - index : null;
  return `${number !== null && number > 0 ? `Версия ${number}` : 'Сохранённая версия'} · ${serverTime(version.created_at)}`;
}

/** Read-only snapshot; all rule and scale values come from the saved version. */
export function ChecklistView({
  version,
  label,
  showTitle = true,
}: {
  version: ChecklistVersion;
  label?: string;
  showTitle?: boolean;
}) {
  const sections = version.sections ?? [];
  const groups = [
    ...sections.map((section) => ({
      ...section,
      key: 'section:' + section.id,
      criteria: version.criteria.filter((c) => c.section_id === section.id),
    })),
    {
      key: 'ungrouped',
      title: sections.length ? 'Без секции' : 'Критерии оценки',
      criteria: version.criteria.filter((c) => !c.section_id || !sections.some((s) => s.id === c.section_id)),
    },
  ].filter((group) => group.criteria.length > 0);
  return (
    <div className="checklist-view" data-testid="checklist-view">
      {showTitle ? <h2>{version.title}</h2> : null}
      <div className="checklist-snapshot-summary">
        <span>{label ?? checklistVersionLabel(version)}</span>
        <span>
          Критериев: <strong>{version.criteria.length}</strong>
        </span>
        <span>
          Разделов: <strong>{sections.length}</strong>
        </span>
      </div>
      {groups.map((group) => (
        <section className="checklist-rule-group" key={group.key} aria-label={group.title}>
          <h3>{group.title}</h3>
          <ol className="criteria-snapshot">
            {group.criteria.map((c) => (
              <li key={c.id} data-testid="snapshot-criterion" data-criterion-id={c.id}>
                <details className="checklist-rule">
                  <summary>
                    <span className="checklist-rule-number">
                      {String(version.criteria.indexOf(c) + 1).padStart(2, '0')}
                    </span>
                    <span className="checklist-rule-title">
                      {c.title}
                      <small>
                        {responseTypeLabel[c.response_type]}
                        {c.allow_na ? ' · N/A разрешён' : ''}
                      </small>
                    </span>
                    <span className="checklist-rule-weight">
                      {c.response_type === 'flag' ? (
                        'Вне итогового балла'
                      ) : (
                        <>
                          Вес <strong>{decimalRu(c.weight)}</strong>
                        </>
                      )}
                    </span>
                    <span className="checklist-rule-chevron" aria-hidden="true">
                      ⌄
                    </span>
                  </summary>
                  <div className="checklist-rule-content">
                    <p className="definition">{c.definition}</p>
                    <ScaleTable criterion={c} selected={null} />
                    {c.requires_reference ? <p className="hint">Для оценки нужен источник (база знаний).</p> : null}
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
                    <details className="checklist-technical">
                      <summary>Технические сведения критерия</summary>
                      <dl className="meta">
                        <dt>ID критерия</dt>
                        <dd>
                          <code>{c.id}</code>
                        </dd>
                        <dt>ID секции</dt>
                        <dd>
                          <code>{c.section_id ?? '—'}</code>
                        </dd>
                      </dl>
                    </details>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <details className="checklist-technical">
        <summary>Технические сведения версии</summary>
        <dl className="meta">
          <dt>ID чек-листа</dt>
          <dd>
            <code>{version.checklist_id}</code>
          </dd>
          <dt>ID версии</dt>
          <dd>
            <code>{version.version_id}</code>
          </dd>
          <dt>Хеш правил</dt>
          <dd>
            <code>{version.semantic_hash}</code>
          </dd>
          <dt>Хеш расчёта</dt>
          <dd>
            <code>{version.scoring_config_hash}</code>
          </dd>
        </dl>
      </details>
    </div>
  );
}
