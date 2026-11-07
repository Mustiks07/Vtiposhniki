// Onboarding examples: fictional data, hand-set answers, numbers from cqa_domain (see
// apps/web/scripts/build_tutorial_example.py). Bundled with the web build; never sent to
// the API, never imported into the working database, never exported.
import type { ChecklistVersion, Conversation, CriterionProposal, ScoreSummary } from '../api/types';
import closingNa from './closing-na.json';

export interface TutorialExample {
  id: string;
  applicable_weight: string;
  earned_weight: string;
  conversation: Conversation;
  checklist: ChecklistVersion;
  proposals: CriterionProposal[];
  score: ScoreSummary;
}

const examples: Record<string, TutorialExample> = {
  [closingNa.id]: closingNa as unknown as TutorialExample,
};

export { DEFAULT_EXAMPLE_ID } from './ids';

export function tutorialExample(id: string | null | undefined): TutorialExample | null {
  return (id && examples[id]) || null;
}

/** The example dialog in the plain-text import format, for the user to edit and import. */
export function exampleAsPlainText(example: TutorialExample): string {
  return example.conversation.messages
    .map(
      (m) =>
        `${m.timestamp_original ? `[${m.timestamp_original}] ` : ''}${m.speaker}: ${m.text.replace(/\n/g, '\n  ')}`,
    )
    .join('\n');
}
