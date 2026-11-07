"""Build the onboarding example data for the web tutorial (synthetic, fictional service).

The answers below are an explanatory illustration of the rules, chosen by hand; they are
not an AI result and not an independent reference. All numbers (total, contributions,
weights) are produced by the existing domain scorer, never by the frontend.

Run from the repository root:
    uv run python apps/web/scripts/build_tutorial_example.py          # write
    uv run python apps/web/scripts/build_tutorial_example.py --check  # verify file is current
"""

import json
import sys
from decimal import Decimal
from pathlib import Path

from cqa_contracts.models import (
    AudioMetadata,
    Conversation,
    CriterionProposal,
    Evidence,
    Message,
)
from cqa_domain import conversation_content_hash, score, sectioned_original_checklist

OUT = Path(__file__).resolve().parents[1] / "src" / "tutorial" / "closing-na.json"
EXAMPLE_ID = "closing-na"

MESSAGES = [
    ("client", "Как отключить уведомления?", "00:00"),
    ("operator", "Здравствуйте! Я Анна. Выключите переключатель уведомлений в настройках.", "00:05"),
    ("client", "Получилось, спасибо. До свидания!", "00:18"),
    ("operator", "Хорошо.", "00:24"),
]


def rng(start: str, end: str, relation: str, explanation: str) -> Evidence:
    return Evidence(
        kind="range",
        start_message_id=start,
        end_message_id=end,
        relation=relation,  # type: ignore[arg-type]
        explanation=explanation,
    )


def msg(ids: list[str], relation: str, explanation: str) -> Evidence:
    return Evidence(kind="message", message_ids=ids, relation=relation, explanation=explanation)  # type: ignore[arg-type]


# criterion id -> (applicability, choice id or None, rationale, reason codes, evidence)
ANSWERS = {
    "c1_contact": (
        "applicable", "yes",
        "Оператор в первом ответе поздоровался и назвал себя: «Здравствуйте! Я Анна».",
        ["criteria_met"], [msg(["m0002"], "support", "Приветствие и представление.")],
    ),
    "c2_needs": (
        "not_applicable", None,
        "Запрос был понятен сразу: клиент спросил, как отключить уведомления. Уточнять было нечего.",
        ["not_applicable"], [msg(["m0001"], "support", "Вопрос сформулирован полностью.")],
    ),
    "c3_identification": (
        "not_applicable", None,
        "Общий вопрос о настройке приложения не раскрывает данных клиента и не требует действий со счётом,"
        " поэтому идентификация не нужна.",
        ["not_applicable"], [rng("m0001", "m0002", "support", "Общая инструкция без персональных данных.")],
    ),
    "c4_consultation": (
        "applicable", "p20",
        "Оператор дал конкретный шаг, клиент подтвердил результат: «Получилось».",
        ["criteria_met"], [rng("m0002", "m0003", "support", "Инструкция и подтверждение клиента.")],
    ),
    "c5_empathy": (
        "applicable", "yes",
        "Ответ вежливый, по существу вопроса; недовольства клиент не выражал.",
        ["criteria_met"], [msg(["m0002"], "support", "Вежливый ответ по существу.")],
    ),
    "c6_dialog_management": (
        "applicable", "p10",
        "Ответ ясный и последовательный, ожидания не было.",
        ["criteria_met"], [rng("m0001", "m0004", "context", "Весь короткий диалог.")],
    ),
    "c7_closing": (
        "applicable", "no",
        "Клиент попрощался, оператор ответил только «Хорошо»: не подвёл итог, не предложил дальнейшую помощь"
        " и не попрощался. Прощание клиента не заменяет действие оператора.",
        ["missing_expected_action"],
        [rng("m0003", "m0004", "support", "Завершающий участок: прощание клиента и ответ оператора.")],
    ),
    "c8_gross_errors": (
        "applicable", "no",
        "Оскорблений, предложения платных услуг в обход компании и раскрытия данных нет.",
        ["no_violation_detected"], [rng("m0001", "m0004", "context", "Весь диалог.")],
    ),
}


def build() -> str:
    checklist = sectioned_original_checklist()
    messages = [
        Message(id=f"m{i + 1:04d}", ordinal=i + 1, speaker=s, text=t, timestamp_original=ts, source_index=i)  # type: ignore[arg-type]
        for i, (s, t, ts) in enumerate(MESSAGES)
    ]
    pending = Conversation(
        id=f"tutorial-{EXAMPLE_ID}",
        external_id=f"tutorial-{EXAMPLE_ID}",
        revision=1,
        content_hash="0" * 64,
        channel="agent_chat",
        language="RU",
        messages=messages,
        audio=AudioMetadata(availability="unavailable", alignment_status="unavailable"),
        warnings=[],
    )
    conversation = pending.model_copy(update={"content_hash": conversation_content_hash(pending)})
    proposals = [
        CriterionProposal(
            criterion_id=cid,
            applicability=a,  # type: ignore[arg-type]
            answer_choice_id=choice,
            rationale=rationale,
            reason_codes=codes,  # type: ignore[arg-type]
            evidence=evidence,
            origin="test",
        )
        for cid, (a, choice, rationale, codes, evidence) in ANSWERS.items()
    ]
    assert [p.criterion_id for p in proposals] == [c.id for c in checklist.criteria]
    summary = score(checklist, proposals)
    # Totals of the domain contributions (Decimal, done here, not in the browser).
    applicable = sum((Decimal(str(c.applicable_weight)) for c in summary.contributions), Decimal(0))
    earned = sum((Decimal(str(c.earned_weight or 0)) for c in summary.contributions), Decimal(0))
    assert summary.status == "complete" and str(summary.total_score) == "92.31", summary.total_score
    assert applicable == 65 and earned == 60, (applicable, earned)
    payload = {
        "id": EXAMPLE_ID,
        "note": "Synthetic onboarding example. Answers are a hand-set illustration; no AI run.",
        "applicable_weight": f"{applicable.normalize():f}",
        "earned_weight": f"{earned.normalize():f}",
        "conversation": json.loads(conversation.model_dump_json()),
        "checklist": json.loads(checklist.model_dump_json()),
        "proposals": [json.loads(p.model_dump_json()) for p in proposals],
        "score": json.loads(summary.model_dump_json()),
    }
    return json.dumps(payload, ensure_ascii=False, indent=1) + "\n"


def main() -> int:
    text = build()
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print(f"{OUT} is out of date; run without --check", file=sys.stderr)
            return 1
        print("tutorial example is current")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
