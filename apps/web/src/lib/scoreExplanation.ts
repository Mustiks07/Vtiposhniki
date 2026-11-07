// View model for "why is the score below 100". Display only: it never computes a score.
// Every number is a decimal string from the server ScoreSummary of the chosen scope; a
// reduction is recognised from the server contribution (applicable, positive weight,
// score_fraction ≠ 1), never from a choice label, raw_value or a criterion number, so
// custom/reversed scales and arbitrary criterion IDs work the same way.
import type { Criterion, CriterionProposal, FlagResult, ScoreContribution, ScoreSummary } from '../api/types';
import { normDecimal } from './comparison';

export interface ExplainedItem {
  criterion: Criterion;
  /** 1-based position in the pinned checklist (display order). */
  number: number;
  proposal: CriterionProposal | undefined;
  contribution: ScoreContribution | undefined;
}

export interface ExplainedFlag extends ExplainedItem {
  detected: boolean | null;
}

export interface ScoreExplanationModel {
  status: ScoreSummary['status'];
  total: string | null;
  /** Applicable weighted criteria that did not receive their full share. Checklist order. */
  reductions: ExplainedItem[];
  /** Excluded from the applicable weight, not penalised. */
  notApplicable: ExplainedItem[];
  /** Undetermined or missing answers of weighted criteria: need review, not a penalty. */
  needsReview: ExplainedItem[];
  /** Flag criteria with a detected violation (separate from the score). */
  critical: ExplainedFlag[];
  /** Flag criteria whose result is unknown (not "no violation"). */
  flagsUnknown: ExplainedFlag[];
  /** Flag criteria with an explicit negative result. */
  flagsClear: ExplainedFlag[];
}

const positive = (weight: string | null | undefined) => {
  const w = normDecimal(weight);
  return w !== null && w !== '0' && !w.startsWith('-');
};

export function explainScore(
  criteria: Criterion[],
  proposals: CriterionProposal[],
  score: ScoreSummary,
): ScoreExplanationModel {
  const byProposal = new Map(proposals.map((p) => [p.criterion_id, p]));
  const byContribution = new Map(score.contributions.map((c) => [c.criterion_id, c]));
  const byFlag = new Map<string, FlagResult>(score.flags.map((f) => [f.criterion_id, f]));
  const model: ScoreExplanationModel = {
    status: score.status,
    total: score.total_score,
    reductions: [],
    notApplicable: [],
    needsReview: [],
    critical: [],
    flagsUnknown: [],
    flagsClear: [],
  };
  criteria.forEach((criterion, index) => {
    const item: ExplainedItem = {
      criterion,
      number: index + 1,
      proposal: byProposal.get(criterion.id),
      contribution: byContribution.get(criterion.id),
    };
    if (criterion.response_type === 'flag') {
      const flag = byFlag.get(criterion.id);
      const detected = flag ? flag.detected : null;
      const target = detected === true ? model.critical : detected === false ? model.flagsClear : model.flagsUnknown;
      target.push({ ...item, detected });
      return;
    }
    const c = item.contribution;
    // Zero-weight criteria never explain a lower total.
    if (!positive(c?.original_weight ?? criterion.weight)) return;
    if (!c || !item.proposal || c.applicability === 'undetermined') {
      model.needsReview.push(item);
      return;
    }
    if (c.applicability === 'not_applicable') {
      model.notApplicable.push(item);
      return;
    }
    if (normDecimal(c.score_fraction) !== '1') model.reductions.push(item);
  });
  return model;
}
