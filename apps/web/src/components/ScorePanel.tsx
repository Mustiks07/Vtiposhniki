import type { ChecklistVersion, EvaluationView, ScoreSummary } from '../api/types';
import { decimalRu, totalRu } from '../lib/format';
import { scoreStatusExplanation, scoreStatusLabel } from '../lib/labels';
import { Badge } from './States';

export function TotalValue({ score, testId }: { score: ScoreSummary; testId?: string }) {
  if (score.status === 'complete' && score.total_score !== null) {
    return (
      <span className="total" data-testid={testId}>
        {totalRu(score.total_score)}
        <span className="total-unit"> из 100</span>
      </span>
    );
  }
  return (
    <span className="total total-none" data-testid={testId} data-status={score.status}>
      нет итога
    </span>
  );
}

function ScoreBlock({
  title,
  score,
  note,
  testId,
}: {
  title: string;
  score: ScoreSummary;
  note?: string;
  testId: string;
}) {
  return (
    <div className="score-block" data-testid={`${testId}-block`}>
      <h3>{title}</h3>
      <TotalValue score={score} testId={testId} />
      <div>
        <Badge status={score.status}>{scoreStatusLabel[score.status]}</Badge>
      </div>
      {score.status !== 'complete' ? <p className="hint">{scoreStatusExplanation[score.status]}</p> : null}
      {note ? <p className="hint">{note}</p> : null}
    </div>
  );
}

function FlagList({ flags, criterionTitle, scope }: {
  flags: ScoreSummary["flags"];
  criterionTitle: Map<string, string>;
  scope: "automatic" | "effective";
}) {
  return flags.length ? (
        <ul className="flags" aria-label="Флаги грубых нарушений">
          {flags.map((f) => (
            <li key={f.criterion_id} data-testid="flag" data-detected={String(f.detected)}>
              <span className={`flag-icon ${f.detected ? 'flag-on' : ''}`} aria-hidden="true">
                {f.detected ? '⚑' : '⚐'}
              </span>{' '}
              {criterionTitle.get(f.criterion_id) ?? f.criterion_id}:{' '}
              <strong>
                {f.detected === true
                  ? 'нарушение обнаружено'
                  : f.detected === false
                    ? 'нарушение не обнаружено'
                    : 'не определено'}
              </strong>
              <span className="hint">
                {' '}
                · флаг без баллов, не меняет итог · {scope === 'automatic' ? 'оценка AI' : 'после пересмотра'}
              </span>
            </li>
          ))}
        </ul>
  ) : null;
}

export function ScorePanel({
  evaluation,
  checklist,
  scope = 'effective',
  onScope,
  onCriterion,
}: {
  evaluation: EvaluationView;
  checklist: ChecklistVersion | undefined;
  scope?: 'automatic' | 'effective';
  onScope?: (scope: 'automatic' | 'effective') => void;
  onCriterion?: (id: string) => void;
}) {
  const hasDecisions = evaluation.human_decisions.length > 0;
  const sectionTitle = new Map((checklist?.sections ?? []).map((s) => [s.id, s.title]));
  const criterionTitle = new Map((checklist?.criteria ?? []).map((c) => [c.id, c.title]));
  const effective = evaluation.effective_score;
  const displayed = scope === 'automatic' ? evaluation.automatic_score : effective;
  const flagSections = new Map(
    (checklist?.sections ?? []).flatMap((section) => {
      const criteria = checklist?.criteria.filter((c) => c.section_id === section.id) ?? [];
      return criteria.length && criteria.every((c) => c.response_type === 'flag')
        ? [[section.id, displayed.flags.filter((f) => criteria.some((c) => c.id === f.criterion_id))] as const]
        : [];
    }),
  );
  const sectionFlagIds = new Set([...flagSections.values()].flat().map((f) => f.criterion_id));
  const humanCompleted =
    hasDecisions && evaluation.automatic_score.status !== 'complete' && effective.status === 'complete';

  return (
    <section className={`panel score scope-${scope}`} aria-labelledby="score-title">
      <div className="score-heading">
        <h2 id="score-title">Итог оценки</h2>
        <span className="hint">{scope === 'automatic' ? 'Оценка AI' : 'После пересмотра'}</span>
      </div>
      {onScope ? (
        <div className="view-switch" role="group" aria-label="Источник оценки">
          <button type="button" aria-pressed={scope === 'automatic'} onClick={() => onScope('automatic')}>
            Оценка AI
          </button>
          <button type="button" aria-pressed={scope === 'effective'} onClick={() => onScope('effective')}>
            После пересмотра
          </button>
        </div>
      ) : null}
      <div className="score-grid">
        <ScoreBlock
          title="Оценка AI · automatic"
          score={evaluation.automatic_score}
          testId="automatic-total"
          note="Не изменяется решениями проверяющего."
        />
        <ScoreBlock
          title="После пересмотра · effective"
          score={effective}
          testId="effective-total"
          note={
            humanCompleted
              ? 'Итог стал полным благодаря решениям проверяющего; автоматическая оценка остаётся неполной.'
              : hasDecisions
                ? `Учтено решений: ${evaluation.human_decisions.length}.`
                : 'Решений проверяющего нет — совпадает с automatic.'
          }
        />
      </div>

      {displayed.contributions.length ? (
        <div className="composition" aria-label="Состав итога: вес и набранная доля каждого критерия">
          {displayed.contributions
            .filter((c) => Number(c.original_weight) > 0)
            .map((c) => (
              <button
                type="button"
                key={c.criterion_id}
                className={`composition-part composition-${c.applicability}`}
                style={{ flexGrow: Number(c.original_weight) }}
                onClick={() => onCriterion?.(c.criterion_id)}
                title={`${criterionTitle.get(c.criterion_id) ?? c.criterion_id}: ${c.applicability === 'applicable' ? `${decimalRu(c.earned_weight)} / ${decimalRu(c.original_weight)}` : c.applicability === 'not_applicable' ? 'N/A · исключён из итога' : 'Не определено'}`}
                aria-label={`Состав итога: ${criterionTitle.get(c.criterion_id) ?? c.criterion_id}`}
              >
                <span style={{ width: `${Number(c.score_fraction ?? 0) * 100}%` }} />
              </button>
            ))}
        </div>
      ) : null}
      <p className="composition-legend">
        <span>Вес критерия / набранная доля</span>
        <span className="hatch-key">N/A — исключён из итога</span>
      </p>

      {displayed.section_results.length ? (
        <div className="table-wrap" tabIndex={0} aria-label="Результаты секций">
          <table className="table compact section-table">
            <caption>Разделы чек-листа. Проценты секций не складываются в общий итог.</caption>
            <thead>
              <tr>
                <th scope="col">Секция</th>
                <th scope="col">Получено веса / применимый вес</th>
                <th scope="col">Процент секции</th>
              </tr>
            </thead>
            <tbody>
              {displayed.section_results.map((s) => (
                <tr key={s.section_id} data-testid="section-row">
                  <th scope="row">{sectionTitle.get(s.section_id) ?? s.section_id}</th>
                  {flagSections.has(s.section_id) ? (
                    <td colSpan={2}>
                      <FlagList flags={flagSections.get(s.section_id) ?? []} criterionTitle={criterionTitle} scope={scope} />
                    </td>
                  ) : (
                    <>
                      <td>{decimalRu(s.section_earned_weight)} / {decimalRu(s.section_applicable_weight)}</td>
                      <td>{s.section_percent === null ? 'нет применимого веса' : `${totalRu(s.section_percent)} %`}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <FlagList
        flags={displayed.flags.filter((f) => !sectionFlagIds.has(f.criterion_id))}
        criterionTitle={criterionTitle}
        scope={scope}
      />
    </section>
  );
}
