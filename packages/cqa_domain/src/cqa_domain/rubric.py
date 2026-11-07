"""Original CQA checklist as the starting configuration (MASTER §4, source C).

Meaning is reproduced from MASTER §4 without reinterpretation. Weights
10/15/20/20/15/15/5, flag №8 weight 0. №4 allows only 0/5/10/15/20 (fraction
raw/20), №6 only 0/4/7/10 (fraction raw/10), Yes/No → 1/0. The first-reaction
threshold, tags and attachments are excluded from the original assessment.
"""

from datetime import UTC, datetime
from decimal import Context, Decimal
from fractions import Fraction

from cqa_contracts.models import (
    ChannelInstructions,
    ChecklistDraft,
    ChecklistVersion,
    Choice,
    Criterion,
    EvidencePolicy,
    Section,
)

from .checklist import build_checklist_version

_EXACT = Context(prec=60)
ORIGINAL_CHECKLIST_ID = "cqa-original"
ORIGINAL_VERSION_ID = "cqa-original-v1"
ORIGINAL_CREATED_AT = datetime(2026, 11, 7, tzinfo=UTC)

VOICE_COMMON = (
    "Звонок оценивается по тексту расшифровки. Ошибки распознавания речи (ASR), "
    "искажённые слова и пунктуацию не приписывать оператору. Внутренние консультации "
    "и неясную принадлежность реплики отмечать как ограничение, а не угадывать личность."
)


def _yes_no(yes_anchor: str, no_anchor: str) -> list[Choice]:
    return [
        Choice(id="yes", label="Да", raw_value=True, anchor=yes_anchor, score_fraction=Decimal(1)),
        Choice(id="no", label="Нет", raw_value=False, anchor=no_anchor, score_fraction=Decimal(0)),
    ]


def _criterion(
    id: str,
    title: str,
    definition: str,
    weight: int,
    choices: list[Choice],
    *,
    response_type: str = "binary",
    na_condition: str | None = None,
    voice: str = VOICE_COMMON,
    flag_when: list[str] | None = None,
) -> Criterion:
    return Criterion.model_validate(
        {
            "id": id,
            "title": title,
            "definition": definition,
            "response_type": response_type,
            "choices": choices,
            "allow_na": na_condition is not None,
            "na_condition": na_condition,
            "channel_instructions": ChannelInstructions(agent_chat="", voice_call=voice),
            "evidence_policy": EvidencePolicy(),
            "requires_reference": False,
            "weight": Decimal(weight),
            "section_id": None,
            "flag_when_choice_ids": flag_when or [],
        }
    )


SCALE_4 = [
    (
        20,
        "Все существенные вопросы клиента закрыты или дан корректный следующий шаг.",
    ),
    (15, "Основной вопрос решён, пропущена второстепенная деталь."),
    (10, "Часть запроса закрыта, существенный вопрос остался открытым."),
    (5, "Дана общая подсказка, но клиенту непонятно, как действовать."),
    (0, "Нет ответа по существу или ключевая рекомендация ошибочна."),
]

SCALE_6 = [
    (
        10,
        "Ясные и связные ответы; при явном ожидании оператор предупредил клиента.",
    ),
    (7, "Один заметный сбой, но ответ понятен и разговор можно продолжить."),
    (4, "Клиент переспрашивает из-за формулировок или порядка изложения."),
    (0, "Бессвязность или противоречия делают ход разговора непонятным."),
]


def _exact_fraction(raw: int, maximum: int) -> Decimal:
    """raw/maximum as an exact Decimal, independent of the caller's decimal context."""
    exact = Fraction(raw, maximum)
    # Decimal(str) and integer scaling are exact; only terminating fractions are allowed.
    for places in range(0, 30):
        scaled = exact * 10**places
        if scaled.denominator == 1:
            return Decimal(scaled.numerator).scaleb(-places, context=_EXACT)
    raise ValueError("Scale fraction does not terminate in decimal notation")


def _scale(points: list[tuple[int, str]], maximum: int) -> list[Choice]:
    return [
        Choice(
            id=f"p{raw}",
            label=str(raw),
            raw_value=raw,
            anchor=anchor,
            score_fraction=_exact_fraction(raw, maximum),
        )
        for raw, anchor in points
    ]


def original_checklist_draft() -> ChecklistDraft:
    criteria = [
        _criterion(
            "c1_contact",
            "Установление контакта",
            "Да: в первом ответе оператора есть приветствие на языке клиента И оператор "
            "представился. Приветствие бота не заменяет первый ответ оператора. "
            "Иначе — Нет. N/A запрещён.",
            10,
            _yes_no(
                "Первый ответ оператора содержит приветствие на языке клиента и представление.",
                "В первом ответе оператора нет приветствия на языке клиента или представления.",
            ),
        ),
        _criterion(
            "c2_needs",
            "Выявление потребности",
            "Да: оператор учёл уже известные детали и уточнил недостающее до того, как "
            "дать ответ. Нет: ответ дан без учёта известных деталей или без уточнения "
            "недостающего.",
            15,
            _yes_no(
                "Известные детали учтены, недостающее уточнено до ответа.",
                "Известные детали не учтены или недостающее не уточнено до ответа.",
            ),
            na_condition="Данных клиента хватало для ответа с самого начала.",
        ),
        _criterion(
            "c3_identification",
            "Идентификация",
            "Да: личность клиента подтверждена до раскрытия данных или выполнения "
            "защищённого действия. Нет: проверка была необходима, но подтверждения нет "
            "(или оно получено после раскрытия). Согласие на обработку данных не является "
            "идентификацией; системное подтверждение может быть её доказательством.",
            20,
            _yes_no(
                "Личность подтверждена до раскрытия данных или защищённого действия.",
                "Проверка была необходима, но личность не подтверждена до раскрытия/действия.",
            ),
            na_condition="Запрос клиента не требовал идентификации.",
        ),
        _criterion(
            "c4_consultation",
            "Корректная и полная консультация",
            "Корректность и полнота ответа и следующего шага по существенным вопросам "
            "клиента. Допустимы только ступени 0, 5, 10, 15, 20. Учитывать карту "
            "существенных вопросов, закрытые пункты и следующий шаг. Непроверенное "
            "продуктовое утверждение не считать доказанно верным или ложным.",
            20,
            _scale(SCALE_4, 20),
            response_type="scale",
            na_condition="Разговор закончился до того, как клиент сформулировал запрос.",
        ),
        _criterion(
            "c5_empathy",
            "Эмпатия и клиентоориентированность",
            "Да: оператор вежлив; при недовольстве или неудобстве клиента — реагирует на "
            "конкретную проблему клиента. Нет: невежливость или отсутствие реакции на "
            "выраженное недовольство/неудобство. N/A запрещён.",
            15,
            _yes_no(
                "Вежливость; на недовольство/неудобство есть реакция по конкретной проблеме.",
                "Невежливость или нет реакции на конкретное недовольство/неудобство.",
            ),
        ),
        _criterion(
            "c6_dialog_management",
            "Управление диалогом, скорость и грамотность",
            "Ясность, порядок изложения, предупреждение об ожидании. Допустимы только "
            "ступени 0, 4, 7, 10. Оценивается отдельно от №4. N/A запрещён.",
            15,
            _scale(SCALE_6, 10),
            response_type="scale",
            voice=VOICE_COMMON
            + " Для звонков №6: логичность, понятность, уместность выражений, речевые "
            "формулировки и наблюдаемое управление паузами. Темп, дикцию и разборчивость "
            "не оценивать без фактического анализа звука; при недоступном звуке сохранять "
            "ограничение, а не ставить N/A.",
        ),
        _criterion(
            "c7_closing",
            "Завершение",
            "Да: (оператор подвёл итог ИЛИ предложил дальнейшую помощь) И попрощался. "
            "Нет: условие не выполнено.",
            5,
            _yes_no(
                "Подведён итог или предложена дальнейшая помощь, и есть прощание.",
                "Нет итога/предложения помощи или нет прощания.",
            ),
            na_condition="Разговор оборвался до возможности завершения.",
        ),
        _criterion(
            "c8_gross_errors",
            "Грубые ошибки",
            "Отдельный флаг, не влияет на итоговый балл. Да: оскорбление клиента, "
            "предложение платной услуги в обход компании или раскрытие конфиденциальной "
            "информации. Самого предложения частной платной услуги достаточно; согласие "
            "клиента и перевод денег не требуются.",
            0,
            [
                Choice(
                    id="yes",
                    label="Да",
                    raw_value=True,
                    anchor="Есть оскорбление, платная услуга в обход компании или раскрытие "
                    "конфиденциальной информации.",
                    score_fraction=None,
                ),
                Choice(
                    id="no",
                    label="Нет",
                    raw_value=False,
                    anchor="Грубых ошибок не обнаружено.",
                    score_fraction=None,
                ),
            ],
            response_type="flag",
            flag_when=["yes"],
        ),
    ]
    return ChecklistDraft(title="CQA: исходный чек-лист качества", criteria=criteria)


def original_checklist() -> ChecklistVersion:
    """Pinned starting version with computed hashes and a fixed creation time."""
    return build_checklist_version(
        original_checklist_draft(),
        checklist_id=ORIGINAL_CHECKLIST_ID,
        version_id=ORIGINAL_VERSION_ID,
        created_at=ORIGINAL_CREATED_AT,
    )


def original_checklist_json() -> str:
    return original_checklist().model_dump_json(indent=2) + "\n"


def sectioned_original_checklist_draft() -> ChecklistDraft:
    """PDF grouping as a new scoring configuration; the v1 rubric stays immutable."""
    draft = original_checklist_draft()
    groups = [
        ("opening", "Начало и понимание запроса", ["c1_contact", "c2_needs"]),
        ("resolution", "Безопасность и решение", ["c3_identification", "c4_consultation"]),
        (
            "dialogue",
            "Ведение и завершение диалога",
            ["c5_empathy", "c6_dialog_management", "c7_closing"],
        ),
        ("violations", "Грубые нарушения", ["c8_gross_errors"]),
    ]
    section_by_criterion = {cid: sid for sid, _, ids in groups for cid in ids}
    return draft.model_copy(
        update={
            "sections": [Section(id=sid, title=title) for sid, title, _ in groups],
            "criteria": [
                c.model_copy(update={"section_id": section_by_criterion[c.id]})
                for c in draft.criteria
            ],
        }
    )


def sectioned_original_checklist() -> ChecklistVersion:
    return build_checklist_version(
        sectioned_original_checklist_draft(),
        checklist_id=ORIGINAL_CHECKLIST_ID,
        version_id="cqa-original-v2-sections",
        created_at=datetime(2026, 11, 8, tzinfo=UTC),
    )
