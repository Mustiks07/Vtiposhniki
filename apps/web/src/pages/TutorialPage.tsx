import { useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { answerText, ScaleTable } from '../components/CriterionDetail';
import { ScoreExplanation } from '../components/ScoreExplanation';
import { TotalValue } from '../components/ScorePanel';
import { Empty } from '../components/States';
import { Transcript } from '../components/Transcript';
import { evidenceMessageIds } from '../lib/evidence';
import { explainScore } from '../lib/scoreExplanation';
import { tutorialExample } from '../tutorial/example';

export const TUTORIAL_LABEL = 'Учебный пример. Ответы заданы для объяснения интерфейса; AI-запуск не выполнялся.';

const STEPS = [
  { title: 'Почему не 100?', hint: 'Причина снижения' },
  { title: 'Проверить по разговору', hint: 'Доказательство' },
  { title: 'Почему здесь N/A?', hint: 'Не применялось' },
  { title: 'Попробовать свой диалог', hint: 'Ваш текст' },
] as const;

/**
 * Interactive onboarding on a fictional dialog. It uses the same ScoreExplanation and
 * Transcript components as a real evaluation card, but reads a bundled example and makes
 * no API writes: nothing is imported, evaluated or appealed from this page.
 */
export function TutorialPage() {
  const { exampleId } = useParams();
  const example = tutorialExample(exampleId);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const raw = Number(params.get('step'));
  const step = Number.isInteger(raw) && raw >= 1 && raw <= STEPS.length ? raw : 1;
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [focusToken, setFocusToken] = useState(0);
  const [openCriterion, setOpenCriterion] = useState<string | null>(null);
  const [copyExample, setCopyExample] = useState(false);
  const ids = { steps: useId(), copy: useId() };
  const model = useMemo(
    () => (example ? explainScore(example.checklist.criteria, example.proposals, example.score) : null),
    [example],
  );

  if (!example || !model) {
    return (
      <div className="page">
        <Empty title="Учебный пример не найден">
          <Link to="/conversations">Вернуться к диалогам</Link>
        </Empty>
      </div>
    );
  }
  const messages = example.conversation.messages;
  const closing = model.reductions[0];
  const proposalOf = (cid: string) => example.proposals.find((p) => p.criterion_id === cid);

  function goStep(n: number) {
    const next = new URLSearchParams(params);
    if (n === 1) next.delete('step');
    else next.set('step', String(n));
    setParams(next, { replace: true });
  }
  function showEvidence(cid: string, index: number) {
    const item = proposalOf(cid)?.evidence[index];
    if (!item) return;
    setHighlighted(evidenceMessageIds(item, messages));
    setFocusToken((t) => t + 1);
  }
  function back() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/conversations');
  }
  function tryOwn() {
    const q = new URLSearchParams({ paste: 'open' });
    if (copyExample) q.set('example', example!.id);
    navigate(`/conversations?${q.toString()}`);
  }

  const criterion = openCriterion ? example.checklist.criteria.find((c) => c.id === openCriterion) : undefined;
  const openProposal = openCriterion ? proposalOf(openCriterion) : undefined;

  return (
    <div className="page tutorial-page">
      <p className="crumbs">
        <button type="button" className="link" onClick={back}>
          ← Назад
        </button>
      </p>
      <header className="page-heading">
        <div>
          <p className="eyebrow">УЧЕБНЫЙ ПРИМЕР</p>
          <h1>Как читать оценку разговора</h1>
          <p className="page-intro">Четыре коротких шага: итог, доказательство, N/A и ваш собственный диалог.</p>
        </div>
      </header>
      <p className="tutorial-banner" data-testid="tutorial-label">
        {TUTORIAL_LABEL}
      </p>

      <nav aria-label="Шаги примера">
        <p className="hint" id={ids.steps} data-testid="tutorial-progress">
          Шаг {step} из {STEPS.length}
        </p>
        <ol className="tutorial-steps" aria-describedby={ids.steps}>
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button type="button" aria-current={step === i + 1 ? 'step' : undefined} onClick={() => goStep(i + 1)}>
                <span>
                  {i + 1}. {s.title}
                </span>
                <small>{s.hint}</small>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="tutorial-layout">
        <div>
          <section className="panel tutorial-step-panel" aria-live="polite" data-testid="tutorial-step" data-step={step}>
            {step === 1 ? (
              <>
                <h2>Почему не 100?</h2>
                <p>
                  Итог считает сервер по правилам чек-листа. Применимый вес — {example.applicable_weight}, получено —{' '}
                  {example.earned_weight}. Не хватает одного критерия: <strong>{closing?.criterion.title}</strong>, ответ
                  «{closing ? answerText(closing.criterion, closing.proposal) : ''}».
                </p>
                <p className="hint">Блок «Почему снижена оценка» справа — тот же, что в настоящей карточке результата.</p>
              </>
            ) : step === 2 ? (
              <>
                <h2>Проверить по разговору</h2>
                <p>
                  Клиент написал «До свидания!», оператор ответил только «Хорошо». Итог не подведён, помощь не
                  предложена, оператор не попрощался. Прощание клиента не заменяет действие оператора.
                </p>
                <button
                  type="button"
                  className="primary"
                  data-testid="tutorial-highlight-closing"
                  onClick={() => closing && showEvidence(closing.criterion.id, 0)}
                >
                  Подсветить завершающий участок
                </button>
              </>
            ) : step === 3 ? (
              <>
                <h2>Почему здесь N/A?</h2>
                <ul>
                  <li>
                    <strong>Выявление потребности:</strong> запрос был понятен сразу — уточнять было нечего.
                  </li>
                  <li>
                    <strong>Идентификация:</strong> общий вопрос о настройке не раскрывает данных и не требует
                    действий со счётом.
                  </li>
                  <li>
                    N/A — <strong>не штраф</strong>: критерий исключается из применимого веса. Поэтому итог считается
                    от {example.applicable_weight}, а не от всех весов чек-листа.
                  </li>
                </ul>
                <button type="button" onClick={() => showEvidence('c2_needs', 0)}>
                  Показать вопрос клиента
                </button>
              </>
            ) : (
              <>
                <h2>Попробовать свой диалог</h2>
                <p>
                  Откроется обычная вставка текста. Импорт и запуск оценки — отдельные действия, которые вы выполняете
                  сами. Настоящий оценщик даст собственный ответ выбранного профиля — он может отличаться от учебной
                  разметки.
                </p>
                <label className="inline-check" htmlFor={ids.copy}>
                  <input
                    id={ids.copy}
                    type="checkbox"
                    checked={copyExample}
                    onChange={(e) => setCopyExample(e.target.checked)}
                  />{' '}
                  Перенести текст примера в поле для редактирования (если поле пустое)
                </label>
                <div className="row">
                  <button type="button" className="primary" onClick={tryOwn} data-testid="tutorial-try-own">
                    Вставить свой диалог
                  </button>
                </div>
                <p className="hint">
                  Апелляцию можно подать на настоящей оценке: кнопка «Оспорить» в блоке причин или в разборе критерия.
                </p>
              </>
            )}
            <div className="tutorial-nav">
              <button type="button" disabled={step === 1} onClick={() => goStep(step - 1)}>
                ← Предыдущий шаг
              </button>
              {step < STEPS.length ? (
                <button type="button" onClick={() => goStep(step + 1)}>
                  Следующий шаг →
                </button>
              ) : (
                <Link className="button" to="/conversations">
                  Выйти из примера
                </Link>
              )}
            </div>
          </section>
          <Transcript conversation={example.conversation} highlighted={highlighted} focusToken={focusToken} canSeek={false} />
        </div>

        <div>
          <section className="panel tutorial-score" aria-label="Итог учебного примера">
            <TotalValue score={example.score} testId="tutorial-total" />
            <span className="hint">
              применимый вес {example.applicable_weight} · получено {example.earned_weight}
            </span>
          </section>
          <ScoreExplanation
            model={model}
            checklistState="ready"
            sourceLabel="учебная разметка, не AI"
            highlightCriterion={step <= 2 ? closing?.criterion.id : null}
            actions={{ messages, onShowEvidence: showEvidence, onOpenCriterion: setOpenCriterion }}
          />
          {criterion && openProposal ? (
            <section className="panel" aria-labelledby={`${ids.steps}-crit`} data-testid="tutorial-criterion">
              <h2 id={`${ids.steps}-crit`}>{criterion.title}</h2>
              <p className="definition">{criterion.definition}</p>
              {criterion.allow_na && criterion.na_condition ? (
                <p className="hint">N/A допускается, если: {criterion.na_condition}</p>
              ) : null}
              <ScaleTable criterion={criterion} selected={openProposal.answer_choice_id} />
              <p className="rationale">{openProposal.rationale}</p>
              <button type="button" className="link" onClick={() => setOpenCriterion(null)}>
                Закрыть разбор
              </button>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
