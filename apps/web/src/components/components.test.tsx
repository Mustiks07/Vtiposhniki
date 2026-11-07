import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import checklistFixture from '../../../../fixtures/contracts/checklist-custom.json';
import conversationFixture from '../../../../fixtures/contracts/conversation-chat.json';
import voiceUnverified from '../../../../fixtures/contracts/conversation-voice-unverified.json';
import voiceUnavailable from '../../../../fixtures/contracts/conversation-voice-unavailable.json';
import evaluationComplete from '../../../../fixtures/contracts/evaluation-complete.json';
import evaluationHuman from '../../../../fixtures/contracts/evaluation-human-completed.json';
import evaluationSources from '../../../../fixtures/contracts/evaluation-source-fragments.json';
import scoreNoWeight from '../../../../fixtures/contracts/score-no-applicable-weight.json';
import scorePartial from '../../../../fixtures/contracts/score-partial.json';
import type { ChecklistVersion, Conversation, Criterion, EvaluationView, ScoreSummary } from '../api/types';
import { buildReplacement } from './Appeals';
import { AudioPanel } from './AudioPanel';
import { RunDetails } from './RunDetails';
import { ContributionLine, EvidenceList, rawStepText } from './CriterionDetail';
import { ScorePanel, TotalValue } from './ScorePanel';
import { Transcript } from './Transcript';

const checklist = checklistFixture as ChecklistVersion;
const conversation = conversationFixture as Conversation;

test('score panel separates automatic and effective; human completion keeps automatic without total', () => {
  render(<ScorePanel evaluation={evaluationHuman as EvaluationView} checklist={checklist} />);
  const auto = screen.getByTestId('automatic-total');
  const eff = screen.getByTestId('effective-total');
  expect(auto.textContent).toBe('нет итога');
  expect(eff.textContent).toContain('100,00');
  expect(screen.getByText(/благодаря решениям проверяющего/)).toBeTruthy();
});

test('sections are labelled and flags never change the total', () => {
  render(<ScorePanel evaluation={evaluationComplete as EvaluationView} checklist={checklist} />);
  const row = screen.getByTestId('section-row');
  expect(within(row).getByText('Synthetic section')).toBeTruthy();
  expect(row.textContent).toContain('70 / 100');
  expect(row.textContent).toContain('70,00 %');
  expect(screen.getByText(/не складываются в общий итог/)).toBeTruthy();
  expect(screen.getByTestId('flag').textContent).toContain('не меняет итог');
});

test('no_applicable_weight and incomplete_evaluation are explained differently, never as zero', () => {
  const { rerender } = render(<TotalValue score={scoreNoWeight as ScoreSummary} testId="t" />);
  expect(screen.getByTestId('t').textContent).toBe('нет итога');
  expect(screen.getByTestId('t').getAttribute('data-status')).toBe('no_applicable_weight');
  rerender(<TotalValue score={scorePartial as ScoreSummary} testId="t" />);
  expect(screen.getByTestId('t').getAttribute('data-status')).toBe('incomplete_evaluation');
  expect(screen.queryByText(/^0/)).toBeNull();
});

test('raw scale step is shown separately from the weighted result (7/10 vs 10,5/15)', () => {
  const criterion: Criterion = {
    ...(checklist.criteria[1] as Criterion),
    weight: '15',
    choices: [0, 4, 7, 10].map((raw) => ({
      schema_version: '1.0',
      id: `c${raw}`,
      label: String(raw),
      raw_value: raw,
      anchor: `anchor ${raw}`,
      score_fraction: raw === 10 ? '1' : `0.${raw}`,
    })),
  };
  expect(rawStepText(criterion, 'c7')).toBe('7/10');
  render(
    <ContributionLine
      criterion={criterion}
      contribution={{
        schema_version: '1.0',
        criterion_id: criterion.id,
        applicability: 'applicable',
        answer_choice_id: 'c7',
        raw_value: 7,
        score_fraction: '0.7',
        original_weight: '15',
        earned_weight: '10.5',
        applicable_weight: '15',
        normalized_contribution: '11.08',
      }}
    />,
  );
  expect(screen.getByTestId('raw-step').textContent).toBe('7/10');
  expect(screen.getByTestId('weighted').textContent).toBe('10,5 / 15');
  expect(screen.getByTestId('normalized').textContent).toContain('11,08');
});

test('transcript renders HTML from the conversation as inert text', () => {
  const hostile: Conversation = {
    ...conversation,
    messages: [
      { ...conversation.messages[0], text: '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script> **bold** [link](https://evil.example)' },
      ...conversation.messages.slice(1),
    ],
  };
  const { container } = render(<Transcript conversation={hostile} highlighted={[]} focusToken={0} canSeek={false} />);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('a')).toBeNull();
  expect(screen.getByText(/<img src=x onerror=/)).toBeTruthy();
  expect(screen.getAllByText(conversation.messages[0].timestamp_original).length).toBeGreaterThan(0);
});

test('evidence click highlights every message of the inclusive range', () => {
  const onShow = vi.fn();
  const first = conversation.messages[0].id;
  const last = conversation.messages[conversation.messages.length - 1].id;
  render(
    <EvidenceList
      evidence={[{ schema_version: '1.0', kind: 'range', start_message_id: first, end_message_id: last, relation: 'support', explanation: 'e' }]}
      messages={conversation.messages}
      fragments={[]}
      onShow={onShow}
      openSource={null}
      onToggleSource={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /включительно/ }));
  expect(onShow).toHaveBeenCalledWith(conversation.messages.map((m) => m.id));
});

test('source evidence opens the stored fragment; a missing chunk is labelled, not guessed', () => {
  const view = evaluationSources as EvaluationView;
  const chunk = view.source_fragments[0].chunk.chunk_id;
  const { rerender } = render(
    <EvidenceList
      evidence={[{ schema_version: '1.0', kind: 'source', source_chunk_id: chunk, relation: 'support', explanation: 'e' }]}
      messages={conversation.messages}
      fragments={view.source_fragments}
      onShow={() => undefined}
      openSource={chunk}
      onToggleSource={() => undefined}
    />,
  );
  expect(screen.getByTestId('source-fragment').textContent).toContain(view.source_fragments[0].chunk.text);
  rerender(
    <EvidenceList
      evidence={[{ schema_version: '1.0', kind: 'source', source_chunk_id: 'missing', relation: 'support', explanation: 'e' }]}
      messages={conversation.messages}
      fragments={view.source_fragments}
      onShow={() => undefined}
      openSource="missing"
      onToggleSource={() => undefined}
    />,
  );
  expect(screen.getByTestId('source-missing')).toBeTruthy();
});

test('audio: unknown mapping is never presented as exact; unavailable recording is explained', () => {
  const { rerender } = render(<AudioPanel conversation={voiceUnverified as Conversation} />);
  expect(screen.getByTestId('audio-alignment').textContent).toContain('не подтверждена');
  expect(screen.getByTestId('audio-unknown')).toBeTruthy();
  rerender(<AudioPanel conversation={voiceUnavailable as Conversation} />);
  expect(screen.getByTestId('audio-unavailable')).toBeTruthy();
  const { container } = render(
    <Transcript conversation={voiceUnverified as Conversation} highlighted={[]} focusToken={0} canSeek={false} onSeek={() => undefined} />,
  );
  expect(within(container).queryByText(/запись с/)).toBeNull();
});

test('human replacement follows the criterion snapshot, carries human_changed and the chosen range', () => {
  const c = checklist.criteria[1] as Criterion;
  const changed = buildReplacement(c, 'low', 'Новое обоснование', { start: 'm0001', end: 'm0002' });
  expect(changed).toMatchObject({ applicability: 'applicable', answer_choice_id: 'low', origin: 'human', reason_codes: ['human_changed'] });
  expect(changed.evidence[0]).toMatchObject({ kind: 'range', start_message_id: 'm0001', end_message_id: 'm0002' });
  const na = buildReplacement(c, '__na__', 'Причина N/A', null);
  expect(na).toMatchObject({ applicability: 'not_applicable', answer_choice_id: null, evidence: [] });
});

test('audio: verified mapping offers seeking to the mapped message', () => {
  const verified: Conversation = {
    ...(voiceUnverified as Conversation),
    audio: {
      schema_version: '1.0',
      availability: 'available',
      access_path: `/api/v1/conversations/${voiceUnverified.id}/audio`,
      content_hash: null,
      alignment_status: 'verified',
      mapping: [{ schema_version: '1.0', message_id: 'm0002', start_seconds: '4.5', end_seconds: null }],
      media_type: 'audio/mpeg',
    },
  };
  const onSeek = vi.fn();
  render(<Transcript conversation={verified} highlighted={[]} focusToken={0} canSeek onSeek={onSeek} />);
  fireEvent.click(screen.getByRole('button', { name: /запись с 4,5 с/ }));
  expect(onSeek).toHaveBeenCalledWith('m0002');
  const { container } = render(<AudioPanel conversation={verified} />);
  expect(container.querySelector('audio')?.getAttribute('src')).toBe(`${verified.audio.access_path}?revision=${verified.revision}`);
});

test('audio: an unknown recording with a proxy path loads on the first render and refreshes metadata', () => {
  const onAvailable = vi.fn();
  const unknown = voiceUnverified as Conversation;
  const playable: Conversation = { ...unknown, audio: { ...unknown.audio,
    access_path: `/api/v1/conversations/${unknown.id}/audio` } };
  render(<AudioPanel conversation={playable} onAvailable={onAvailable} />);
  const player = screen.getByTestId('audio-player');
  expect(player.getAttribute('src')).toBe(`${playable.audio.access_path}?revision=${playable.revision}`);
  expect(screen.queryByTestId('audio-unknown')).toBeNull();
  fireEvent.loadedMetadata(player);
  expect(onAvailable).toHaveBeenCalledOnce();
  expect(screen.getByRole('status').textContent).toContain('готова');
  expect(screen.getByTestId('audio-alignment').textContent).toContain('не подтверждена');
});

test('audio: a failed load has a retry action without a fabricated available state', () => {
  const unknown = voiceUnverified as Conversation;
  const playable: Conversation = { ...unknown, audio: { ...unknown.audio,
    access_path: `/api/v1/conversations/${unknown.id}/audio` } };
  const onAvailable = vi.fn();
  render(<AudioPanel conversation={playable} onAvailable={onAvailable} />);
  const player = screen.getByTestId('audio-player') as HTMLAudioElement;
  const load = vi.spyOn(player, 'load').mockImplementation(() => undefined);
  fireEvent.error(player);
  expect(screen.getByRole('status').textContent).toContain('Не удалось');
  expect(onAvailable).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку записи' }));
  expect(load).toHaveBeenCalledOnce();
  expect(screen.getByRole('status').textContent).toContain('Загрузка');
  load.mockRestore();
});

test('legacy evaluation without a job ledger never substitutes artifact costs for current spend', () => {
  const legacy = { ...evaluationComplete } as EvaluationView;
  delete legacy.run;
  // RunDetails reads the source evaluation/profile descriptions through react-query.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><RunDetails evaluation={legacy} /></MemoryRouter></QueryClientProvider>);
  expect(screen.getByTestId('total-cost').textContent).toContain('неизвестна');
  expect(screen.getByText(/История текущего задания недоступна/)).toBeTruthy();
});
