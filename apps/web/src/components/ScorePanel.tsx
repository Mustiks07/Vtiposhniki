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

function ScoreBlock({ title, score, note, testId }: { title: string; score: ScoreSummary; note?: string; testId: string }) {
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

export function ScorePanel({ evaluation, checklist }: { evaluation: EvaluationView; checklist: ChecklistVersion | undefined }) {
  const hasDecisions = evaluation.human_decisions.length > 0;
  const sectionTitle = new Map((checklist?.sections ?? []).map((s) => [s.id, s.title]));
  const criterionTitle = new Map((checklist?.criteria ?? []).map((c) => [c.id, c.title]));
  const effective = evaluation.effective_score;
  const humanCompleted =
    hasDecisions && evaluation.automatic_score.status !== 'complete' && effective.status === 'complete';

  return (
    <section className="panel score" aria-labelledby="score-title">
      <h2 id="score-title">Итог оценки</h2>
      <div className="score-grid">
        <ScoreBlock
          title="Automatic — результат оценщика"
          score={evaluation.automatic_score}
          testId="automatic-total"
          note="Не изменяется решениями проверяющего."
        />
        <ScoreBlock
          title="Effective — после решений проверяющего"
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

      {effective.section_results.length ? (
        <div className="table-wrap" tabIndex={0} aria-label="Результаты секций">
          <table className="table compact">
            <caption>Секции (effective). Проценты секций не складываются в общий итог.</caption>
            <thead>
              <tr>
                <th scope="col">Секция</th>
                <th scope="col">Получено веса / применимый вес</th>
                <th scope="col">Процент секции</th>
              </tr>
            </thead>
            <tbody>
              {effective.section_results.map((s) => (
                <tr key={s.section_id} data-testid="section-row">
                  <th scope="row">{sectionTitle.get(s.section_id) ?? s.section_id}</th>
                  <td>
                    {decimalRu(s.section_earned_weight)} / {decimalRu(s.section_applicable_weight)}
                  </td>
                  <td>{s.section_percent === null ? 'нет применимого веса' : `${totalRu(s.section_percent)} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {effective.flags.length ? (
        <ul className="flags" aria-label="Флаги грубых нарушений">
          {effective.flags.map((f) => (
            <li key={f.criterion_id} data-testid="flag" data-detected={String(f.detected)}>
              <span className={`flag-icon ${f.detected ? 'flag-on' : ''}`} aria-hidden="true">
                {f.detected ? '⚑' : '⚐'}
              </span>{' '}
              {criterionTitle.get(f.criterion_id) ?? f.criterion_id}:{' '}
              <strong>
                {f.detected === true ? 'нарушение обнаружено' : f.detected === false ? 'нарушение не обнаружено' : 'не определено'}
              </strong>
              <span className="hint"> — флаг показывается отдельно и не меняет итог.</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
