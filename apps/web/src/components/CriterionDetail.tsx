import type {
  Choice,
  Criterion,
  CriterionProposal,
  Evidence,
  Message,
  ReviewRecord,
  ScoreContribution,
  SourceFragment,
} from '../api/types';
import { evidenceMessageIds, evidenceRefText } from '../lib/evidence';
import { approxRu, decimalRu, rawValueText } from '../lib/format';
import { applicabilityLabel, originLabel, reasonCodeLabel, relationLabel, responseTypeLabel } from '../lib/labels';
import { Badge } from './States';

type ReviewRecordT = ReviewRecord;
export type { ReviewRecordT };

/** The best step of a scale: the choice whose score_fraction is "1" (display only). */
function topChoice(criterion: Criterion): Choice | undefined {
  return criterion.choices.find((c) => c.score_fraction !== null && Number(c.score_fraction) === 1);
}

export function answerText(criterion: Criterion | undefined, proposal: CriterionProposal | undefined): string {
  if (!proposal) return 'нет ответа';
  if (proposal.applicability === 'not_applicable') return 'N/A';
  if (proposal.applicability === 'undetermined') return 'не определено';
  const choice = criterion?.choices.find((c) => c.id === proposal.answer_choice_id);
  return choice ? choice.label : (proposal.answer_choice_id ?? '—');
}

/** "7/10" for numeric scales: raw value of the chosen step over the raw value of the top step. */
export function rawStepText(criterion: Criterion, choiceId: string | null): string | null {
  if (criterion.response_type !== 'scale' || !choiceId) return null;
  const chosen = criterion.choices.find((c) => c.id === choiceId);
  const top = topChoice(criterion);
  if (!chosen) return null;
  if (top && typeof chosen.raw_value === 'number' && typeof top.raw_value === 'number') {
    return `${String(chosen.raw_value).replace('.', ',')}/${String(top.raw_value).replace('.', ',')}`;
  }
  return rawValueText(chosen.raw_value);
}

export function ContributionLine({ criterion, contribution }: { criterion: Criterion; contribution: ScoreContribution | undefined }) {
  if (criterion.response_type === 'flag') {
    return <p className="hint">Флаг: вес 0, в итог не входит.</p>;
  }
  if (!contribution) return <p className="hint">Сервер не вернул вклад критерия.</p>;
  const step = rawStepText(criterion, contribution.answer_choice_id);
  return (
    <dl className="meta contribution" data-testid="contribution">
      {step ? (
        <>
          <dt>Исходная ступень шкалы</dt>
          <dd data-testid="raw-step">{step}</dd>
        </>
      ) : null}
      <dt>Доля шкалы</dt>
      <dd>{decimalRu(contribution.score_fraction)}</dd>
      <dt>Взвешенный результат / исходный вес</dt>
      <dd data-testid="weighted">
        {contribution.applicability === 'applicable'
          ? `${decimalRu(contribution.earned_weight)} / ${decimalRu(contribution.original_weight)}`
          : `— / ${decimalRu(contribution.original_weight)} (${applicabilityLabel[contribution.applicability]}, исключён из расчёта)`}
      </dd>
      <dt>Нормализованный вклад в общий итог</dt>
      <dd data-testid="normalized" title={contribution.normalized_contribution ?? undefined}>
        {contribution.normalized_contribution === null ? '—' : `${approxRu(contribution.normalized_contribution)} п. из 100`}
      </dd>
    </dl>
  );
}

function SourceView({ chunkId, fragments }: { chunkId: string; fragments: SourceFragment[] }) {
  const fragment = fragments.find((f) => f.chunk.chunk_id === chunkId);
  if (!fragment) {
    return (
      <p className="notice" data-testid="source-missing">
        Фрагмент источника <code>{chunkId}</code> не найден среди сохранённых в карточке. Текст не подставляется.
      </p>
    );
  }
  const s = fragment.source;
  return (
    <div className="source" data-testid="source-fragment">
      <p>
        <strong>{s.title}</strong> · версия {s.version} · {s.provenance}
        {s.legal_entity ? ` · ${s.legal_entity}` : ''}
        {s.product ? ` · ${s.product}` : ''}
      </p>
      <p className="muted">
        {fragment.chunk.locator}
        {s.published_at ? ` · опубликовано ${s.published_at}` : ''}
        {s.effective_from ? ` · действует с ${s.effective_from}` : ''}
        {s.effective_until ? ` по ${s.effective_until}` : ''} · загружено {s.retrieved_at}
      </p>
      {s.safe_url ? (
        <p>
          <a href={s.safe_url} target="_blank" rel="noopener noreferrer nofollow">
            Открыть источник
          </a>
        </p>
      ) : null}
      <blockquote className="source-text">{fragment.chunk.text}</blockquote>
    </div>
  );
}

export function EvidenceList({
  evidence,
  messages,
  fragments,
  onShow,
  openSource,
  onToggleSource,
}: {
  evidence: Evidence[];
  messages: Message[];
  fragments: SourceFragment[];
  onShow: (ids: string[]) => void;
  openSource: string | null;
  onToggleSource: (chunkId: string) => void;
}) {
  if (!evidence.length) return <p className="muted">Доказательства не указаны.</p>;
  const byId = new Map(messages.map((m) => [m.id, m]));
  return (
    <ul className="evidence">
      {evidence.map((ev, i) => {
        if (ev.kind === 'source' && ev.source_chunk_id) {
          const chunk = ev.source_chunk_id;
          return (
            <li key={i} data-testid="evidence" data-kind="source">
              <button type="button" className="link" aria-expanded={openSource === chunk} onClick={() => onToggleSource(chunk)}>
                Источник {chunk}
              </button>{' '}
              <span className="muted">({relationLabel[ev.relation]})</span> — {ev.explanation}
              {openSource === chunk ? <SourceView chunkId={chunk} fragments={fragments} /> : null}
            </li>
          );
        }
        const ids = evidenceMessageIds(ev, messages);
        const label = ev.kind === 'range' ? `Диапазон ${evidenceRefText(ev)} (включительно)` : `Реплика ${evidenceRefText(ev)}`;
        return (
          <li key={i} data-testid="evidence" data-kind={ev.kind}>
            {ids.length ? (
              <button type="button" className="link" onClick={() => onShow(ids)} data-message-ids={ids.join(' ')}>
                {label}
              </button>
            ) : (
              <span className="field-error">{label}: ссылка не найдена в этой revision</span>
            )}{' '}
            <span className="muted">({relationLabel[ev.relation]})</span> — {ev.explanation}
            {ev.kind === 'message' && ids.length ? (
              <blockquote className="quote">
                {ids.map((id) => (
                  <span key={id} className="quote-line">
                    <span className="msg-id">{id}</span> {byId.get(id)?.text}
                  </span>
                ))}
              </blockquote>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ProposalView({
  criterion,
  proposal,
  messages,
  fragments,
  onShow,
  openSource,
  onToggleSource,
}: {
  criterion: Criterion;
  proposal: CriterionProposal;
  messages: Message[];
  fragments: SourceFragment[];
  onShow: (ids: string[]) => void;
  openSource: string | null;
  onToggleSource: (chunkId: string) => void;
}) {
  return (
    <div className="proposal">
      <p>
        <Badge status={proposal.applicability === 'undetermined' ? 'undetermined' : 'complete'}>
          {answerText(criterion, proposal)}
        </Badge>{' '}
        <span className="muted">· источник ответа: {originLabel[proposal.origin] ?? proposal.origin}</span>
      </p>
      {proposal.applicability === 'not_applicable' ? (
        <p className="notice">
          <strong>Причина N/A:</strong> {proposal.rationale}
          {criterion.na_condition ? <span className="muted"> (условие чек-листа: {criterion.na_condition})</span> : null}
        </p>
      ) : null}
      {proposal.applicability === 'undetermined' ? (
        <p className="notice notice-warn">Ответ не определён: данных недостаточно для вывода. Это не N/A и не 0 баллов.</p>
      ) : null}
      <h4>Обоснование</h4>
      <p className="rationale">{proposal.rationale}</p>
      <p className="codes">
        {proposal.reason_codes.map((c) => (
          <span key={c} className="code-chip">
            {reasonCodeLabel[c] ?? c}
          </span>
        ))}
      </p>
      <h4>Доказательства</h4>
      <EvidenceList
        evidence={proposal.evidence}
        messages={messages}
        fragments={fragments}
        onShow={onShow}
        openSource={openSource}
        onToggleSource={onToggleSource}
      />
      {(proposal.limitations ?? []).length ? (
        <>
          <h4>Ограничения</h4>
          <ul>
            {(proposal.limitations ?? []).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </>
      ) : null}
      {(proposal.review_reasons ?? []).length ? (
        <>
          <h4>Причины проверки</h4>
          <ul>
            {(proposal.review_reasons ?? []).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function ScaleTable({ criterion, selected }: { criterion: Criterion; selected: string | null | undefined }) {
  return (
    <div className="table-wrap" tabIndex={0} aria-label="Варианты ответа">
      <table className="table compact">
        <caption>
          {responseTypeLabel[criterion.response_type]} · вес {decimalRu(criterion.weight)}
          {criterion.allow_na ? ` · N/A разрешён: ${criterion.na_condition ?? ''}` : ' · N/A запрещён'}
        </caption>
        <thead>
          <tr>
            <th scope="col">Ответ</th>
            <th scope="col">raw_value</th>
            <th scope="col">Смысл ступени</th>
            <th scope="col">Доля</th>
          </tr>
        </thead>
        <tbody>
          {criterion.choices.map((c) => (
            <tr key={c.id} className={c.id === selected ? 'row-selected' : undefined} aria-current={c.id === selected ? 'true' : undefined}>
              <td>
                {c.id === selected ? <span aria-hidden="true">▸ </span> : null}
                {c.label}
                {(criterion.flag_when_choice_ids ?? []).includes(c.id) ? ' ⚑' : ''}
              </td>
              <td>{rawValueText(c.raw_value)}</td>
              <td>{c.anchor}</td>
              <td>{c.score_fraction === null ? '—' : decimalRu(c.score_fraction)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReviewNote({ review }: { review: ReviewRecordT | undefined }) {
  if (!review) return null;
  const text: Record<string, string> = {
    agreed: 'Независимый reviewer согласился с оценкой.',
    conflicted: 'Независимый reviewer пришёл к другому выводу. По политике v1 сохранён исходный ответ; конфликт требует внимания проверяющего.',
    skipped: 'Перепроверка пропущена.',
    failed: 'Перепроверка не завершилась; сохранён исходный допустимый ответ.',
  };
  return (
    <div className={`notice ${review.outcome === 'conflicted' ? 'notice-warn' : ''}`} data-testid="review-note">
      <p>{text[review.outcome]}</p>
      {(review.limitations ?? []).length ? (
        <ul>
          {(review.limitations ?? []).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
