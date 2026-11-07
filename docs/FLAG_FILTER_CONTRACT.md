# Поиск диалогов по флагу — HTTP contract 1.1.0

Основание: [дополнение организаторов, переданное пользователем](specs/05_ORGANIZER_ADDENDUM.md).
Это согласованное решение интегратора, а не цитата организаторов о точной HTTP-схеме.
Pydantic и `operations.py` — источник типов; generated-файлы обновляются генератором.
DTO `schema_version=1.0` сохраняется: расширение добавляет необязательные query/response
поля. Версия OpenAPI повышена с 1.0.0 до 1.1.0; существующие запросы сохраняют смысл.

**Статус поставки:** контракт и примеры опубликованы, реализация выборки принадлежит B,
экрана — C. До их поставки новые корректные запросы получают явный HTTP 501; сервер
не игнорирует фильтр. Это НЕ реализация U01–U04. Удалить временный guard после приёмки B.

## Операция и параметры

Расширяется только `GET /api/v1/conversations` (`listConversations`). Список оценок
сохраняет свой прежний контракт. Новых публичных маршрутов нет.

| Параметр | Тип / default | Значение |
|---|---|---|
| `checklist_version_id` | ID / отсутствует | Точная неизменяемая версия чек-листа для выбора запуска |
| `flag_criterion_id` | ID / отсутствует | Один конкретный `response_type=flag` из этой версии |
| `flag_status` | `detected`, `not_detected`, `unknown` / отсутствует | Отбор по серверному состоянию флага; отсутствие означает все состояния |
| `flag_scope` | `automatic`, `effective` / `automatic` | Исходный AI или результат с решениями человека |

`flag_criterion_id` требует `checklist_version_id`. `flag_status` или scope `effective`
требует `flag_criterion_id`. ID непустые, до 200 символов. Неправильная комбинация —
422 `validation_error` (shared `conversation_flag_query`). Неизвестная версия — 404;
несуществующий или нефлаговый criterion выбранной версии — 422. Эти проверки БД делает B.

Версия без criterion допустима: статус и latest evaluation выбираются в этой версии,
но отбора по флагу и `flag_summary` нет. Без новых параметров прежнее поведение:
последний запуск текущей revision среди всех чек-листов. `flag_scope=automatic`
без выбора criterion равнозначен отсутствию параметра.

В этой поставке поддерживается **один выбранный флаг**, без «любого флага» и без
нескольких ID. Это минимальный вариант дополнения. Не интерпретировать отсутствующий
criterion как «любой». Не изобретать агрегирование во frontend. Если multi-select
понадобится, выпустить следующее согласованное расширение с правилами из дополнения.

## Как выбирать актуальный результат

1. Начать с всех разговоров и только их текущей `latest_revision`.
2. Для каждого разговора выбрать последний **job по монотонному `jobs.seq`** с этой
   revision и точным `checklist_version_id`, если он задан. Чек-лист не подменяется
   последней версией на момент запроса. Среди разных профилей этой версии берётся
   последний запущенный job; отдельного profile/batch фильтра в этой поставке нет.
3. Использовать только evaluation выбранного job. Сначала выбирается job, потом
   проверяется флаг. Нельзя искать историческую evaluation, удовлетворяющую фильтру.
   Новый pending/failed/cancelled запуск перекрывает старый successful результат.
4. Состояния queued/running/retry_wait — `evaluation_status=pending`; отсутствие job —
   unevaluated; failed/cancelled — failed. Последние два могут не иметь evaluation ID.
   При успешном job `evaluation_status` отражает статус исходного artifact, независимо
   от выбранного flag_scope. Partial automatic может иметь complete effective.
5. Флаг читать из `automatic_score.flags` или `effective_score.flags`, полученных от
   domain. Не использовать total, rationale, название, номер критерия или поиск слов.

| Исходные данные выбранного результата | `flag_summary.status` | `result.detected` |
|---|---|---|
| Явный true, включая partial из-за другого критерия | detected | true |
| Явный false | not_detected | false |
| null, отсутствующий флаг или evaluation; pending/failed/cancelled/unevaluated | unknown | null |

Для отсутствующего/недействительного результата вернуть `FlagResult` выбранного
criterion с `detected=null`, `answer_choice_id=null`. Никакой исторический флаг не
подставляется. N/A и undetermined не становятся отрицательными по умолчанию.

Фильтры language/channel/status и новые параметры сочетаются через AND. Отбор по
флагу выполняется **до COUNT и LIMIT/OFFSET**. `total` — все совпадения, даже за первой
страницей. Один разговор — одна строка, порядок `conversations.seq DESC` (seq уникален).
Count и page читаются в одной read transaction. При отсутствии подходящего job
разговор остаётся доступен для unknown, а не теряется из-за INNER JOIN.

## Ответ и объяснение

У `ConversationSummary` добавлено необязательное nullable `flag_summary`:

```json
{
  "schema_version": "1.0",
  "checklist_version_id": "selected-version",
  "latest_job_id": "selected-job",
  "scope": "automatic",
  "status": "detected",
  "result": {
    "schema_version": "1.0",
    "criterion_id": "arbitrary-flag-id",
    "detected": true,
    "answer_choice_id": "violation"
  }
}
```

`latest_evaluation_id` на строке указывает ровно на выбранную evaluation.
`flag_summary=null` означает «флаг не выбран», а не unknown. При выбранном флаге
summary присутствует и для unknown; `latest_job_id=null`, если job отсутствует.
Для объяснения открыть существующий `getEvaluation(latest_evaluation_id)` с выбранным
criterion и scope: `artifact.automatic_final`/`effective_proposals`, rationale, evidence,
source_fragments и сохранённая conversation revision уже есть в контракте.
Не копировать текст доказательств в новый независимый DTO.

UI подписывает версию, текущую revision/правило последнего запуска и выбранный scope.
Criterion берётся из конфигурации выбранной версии; только флаг исходной рубрики имеет
соответствующий смысл «Грубые ошибки». Произвольный флаг отображается под своим title.
Не угадывать смысл по ID `8`, слову в title или низкому баллу. После апелляции исходный
automatic неизменен, effective обновляется; список перезапрашивается с тем же scope.

## Обязательная проверка B/C

- U01: минимум 30 разговоров при limit=25, единственный detected за первой страницей;
  правильный total, переходы страниц, стабильный порядок.
- U02: true при partial; false отдельно от null/нет оценки/pending/failed/undetermined.
- U03: объяснение открывает реальные исходные сообщения; appeal меняет effective,
  но не automatic. Новый поиск с каждым scope подтверждает различие.
- U04: произвольный ID флага; другая версия/новая revision; старый true и новый
  pending/failed/false; повторная оценка без дубля разговора.
- Проверить отсутствие критериев/unknown version, неверные query и запросы без новых
  параметров. Возврат 501 сейчас проверяет только безопасную границу, не успешный поиск.

Fixtures `conversation-flag-*.json` — синтетические формы ответа, не вычислительный
эталон и не доказательство выполнения запроса к БД. Счёт и флаги вычисляет только domain.
