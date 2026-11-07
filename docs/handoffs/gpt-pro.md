# Интеграция поиска флагов и приёмка — 2026-11-07

Промежуточная поставка, не финальный release в main. Исторический отчёт foundation:
[foundation.md](foundation.md). Foundation `e526aef85ad9a368b7389488514f0d53ed531ef0`
и его теги не менялись.

## Включённые поставки

В integration/gpt-pro сохранены отдельные merge-коммиты, без squash/force-push:

| Роль | Ветка | Проверенный head |
|---|---|---|
| A | claude/domain-ai | edc7c15f35009c373a89f2e5f18cdbd242ea7975 |
| B | claude/api-jobs | 392a7130405ec819c93125ed2bc4b22f2a7dcb44 |
| C | claude/web-e2e | f16957f1bb79f59ba1684473bb06136a442aadbd |

Все три новые поставки происходят от общего
`b9e69c94c373b1192b8b7694fa71049d4c3f48ef` (`integration-v1.1.1`).
Совместная поставка поиска закрепляется тегом `integration-flags-v1`:
`git rev-parse integration-flags-v1`. Публичные DTO, generated-файлы и lockfiles
при этих поставках не менялись. Прежние поставки A 36adbdb, B 923bbd8 и C 8dfa5b3
сохранены в истории вместе с исходным контрактом и исправлением часов.

Три прежних замечания A, пять B и три C проверены и закрыты. Новые regression tests
C дополнительно проверены на старом e67d4b1 (падают) и 8dfa5b3 (проходят): пагинация
апелляций, подтверждение изменённого mapping, смена optimistic token после refetch.

## Общее изменение

[Дополнение пользователя](../specs/05_ORGANIZER_ADDENDUM.md) опубликовано дословно.
Точный [HTTP-контракт фильтра](../FLAG_FILTER_CONTRACT.md) зафиксирован интегратором.
Тег `contracts-v1.1.0` сохраняет исходный контрактный SHA
`48f806fedb739d8d437e7ec1d1879e15c52d4a8d`. Тег `integration-v1.1.1` добавляет
исправление часов, описанное ниже; новые поставки объединены поверх него.
Теги не переписывались; это промежуточная интеграционная поставка.

- HTTP 1.1.0, DTO schema_version 1.0, 23 операции; расширен listConversations.
- checklist_version_id + один flag_criterion_id; flag_status; automatic/effective.
- Текущая revision, последний job выбранной версии, без исторического fallback.
- ConversationFlagQuery/Summary используют существующий FlagResult; без новых
  вычислителей флагов, типов rationale/evidence или арифметики в API/web.
- Pydantic, generated JSON Schema/OpenAPI/TypeScript и 6 новых synthetic fixtures.
- API B: выбор newest job exact version по current revision, чтение существующих
  domain flags, фильтр до COUNT/LIMIT/OFFSET; count/page в одной read transaction.
  Общая валидация query сохранена, временный guard 501 удалён.
- Web C: выбор версии/критерия/status/scope, серверные total и пагинация,
  переход к существующей карточке и доказательствам; U01–U04 и новый U06.
- A: 11 новых проверок tri-state, partial, произвольного ID и immutable automatic;
  исходная рубрика, арифметика и prompt не менялись.
- Обновлены README, .env.example, CI-названия и итог aggregate check.
- python-dotenv 1.2.4 закреплён как прямая зависимость API (ранее был транзитивным);
  версии установленного набора не обновлялись, lock/sync и импорты проверены.

Выборка реализована и прошла совместные проверки. Ограниченные интеграционные правки
в web: удалён keepPreviousData для списка разговоров, чтобы новые условия/страница
не подписывали старые строки и total. Два теста с задержанным ответом воспроизвели
ошибку до правки и прошли после неё. В flags.spec.ts click + ожидание checked/scope
заменяют мгновенную проверку radio при асинхронной URL-навигации. U01 теперь сначала
дожидается 25 строк первой страницы, затем проверяет отсутствие искомого разговора.

## Проверки

Текущий совместный код: **557 Python-тестов**, импорты, reproducible generation,
51 fixture, Ruff, mypy (56 files), **32 web unit-теста**, TypeScript/build и
**34/34 браузерных сценария** без retries. Команды: `uv run python scripts/check.py`,
`npm test`, `npm run build`, `npm run e2e` (из корня).
Первый общий прогон завершился exit1: 32/34 E2E прошли, два упали на немедленном
radio.check(), хотя сохранённый DOM уже показывал верный effective результат.
После описанных web-правок повторно прошли все web unit/build/E2E. Python-код не
менялся после успешных 557 тестов, повторный локальный Python-прогон не потребовался.
Локальные журналы: `.tmp/flag-integration-check.log` (первый общий прогон),
`.tmp/flag-stale-before.log` (воспроизведение дефекта), `.tmp/flag-web-final.log`
(успешный полный web-прогон). CI точного опубликованного SHA проверяется отдельно.

Предыдущая приёмка общего контракта (исторические результаты):

Windows, Python 3.13.5, uv 0.13.7, Node 26.1.0, npm 11.13.0. В новой рабочей копии
прошли `uv sync --locked --all-packages --dev` и `npm ci`.
Общая команда: `uv run python scripts/check.py`. Прошли импорты, reproducible
генерация, 51 fixture (Pydantic/JSON Schema), Ruff, mypy (56 source files),
502 Python-теста, TypeScript, 26 web unit tests и production build.
Первый E2E-прогон выявил гонку нового теста C: pager менялся раньше строк. Затем
полный набор выявил неверное сравнение «Все» с первой страницей только открытых
апелляций. Ограниченная интеграционная правка только regressions.spec.ts добавляет
ожидание строк/identity и самостоятельную mixed-state fixture. Три повторения
спецификации прошли 9/9; финальный полный `npm run e2e` прошёл **29/29** без retries.
Локальные журналы: `.tmp/integration-check.log` (исходный прогон), `.tmp/web-final.log`
(успешная повторная проверка typecheck/E2E). Исходный aggregate exit1 не скрывается;
все его этапы затем прошли, Python/unit/build не повторялись без изменений к ним.
CI Ubuntu 24.04/Windows 2025 проверяет тот же код после публикации.

Первый CI на 48f806f обнаружил календарную зависимость двух API recovery tests:
MutableClock закреплён на 2026-11-07, а shared SyntheticEvaluator проверял deadline
по реальному datetime.now. После истечения этой даты тестовые jobs ошибочно падали.
Исправление: optional clock в SyntheticEvaluator, test-mode wiring передаёт те же
часы, что использует queue; прямой helper теста тоже их передаёт. Новые regression
cases с 2001/2099 проверяют timestamps и реальное соблюдение simulated deadline.
Production evaluator не изменён. Исторический failed CI не выдаётся за успешный.
После исправления локально прошли Ruff, mypy и все 62 затронутых contract/jobs tests.

Автоматические E2E используют настоящий API с явным test evaluator; это не настоящий
AI-анализ и не измерение близости к Ground Truth.

## Приёмка дополнения

| Проверка | Фактическое покрытие / остаток |
|---|---|
| U01 | Пройдено: 30 разговоров, единственный detected за первой страницей, total и две страницы; дополнительные API-тесты на 32 разговорах и snapshot |
| U02 | Пройдено: true/false при partial, N/A/undetermined/null/missing flag и состояния jobs; API и UI разделяют unknown и negative |
| U03 | Пройдено: automatic/effective после human decision, поиск по обоим scope, rationale и переход к исходным сообщениям |
| U04 | Пройдено: произвольный флаг из UI, re-evaluation/new revision без дублей; API exact version/latest job/across profiles и отсутствие старого fallback |
| U05 | E16–E18: подача, решение, refresh, история; API restart persistence |
| U06 | Пройдено: UI меняет definition/вес и добавляет критерий → новая версия → fresh run, итог 30 вместо 100; старая карточка сохраняет правила/итог |
| U07 | Пройден настоящий fresh production smoke на новом выдуманном тексте: Gemini 3.5 Flash-Lite, 8/8 AI proposals, valid evidence, persist/restart; не проверка accuracy |
| U08 | Не выполнена: нужен участник, который не писал приложение |
| U09 | E04/E05/E07: refresh, restart, retry; API lease/cancel/persistence tests |
| U10 | Частично: запуск и generation на этой Windows-машине подтверждены; целевой demo-ноутбук/запас квот не подтверждены; provenance покрыт E11 |

## Настоящий AI smoke

После объединения фильтра проведено отдельное чтение уже сохранённой production
оценки: API проверил все три состояния в обоих scope, UI нашёл запись как
not_detected и открыл правильный флаг/обоснование. Дополнительно прошли 8 rationales,
переход к evidence с фокусом, refresh и явная ошибка старого failed job.
Worker отключён, новых provider calls и записей jobs/evaluations нет, сервер остановлен.
Это проверка сохранённого настоящего результата, не новый fresh AI-прогон. Первое
чтение evidence в приватном smoke опередило URL-навигацию; добавлено ожидание заголовка
выбранного критерия, повторный smoke прошёл полностью. Оба локальных отчёта сохранены
в ignored data/private/live, исходные тексты/ответы не опубликованы.

Ключи предоставлены пользователем и записаны только в ignored .env. Один новый
выдуманный разговор прошёл реальный production API/worker с исходной рубрикой,
профилем live-gemini-35-flash-lite-v1 и фактической моделью gemini-3.5-flash-lite.
Job succeeded, artifact complete, 8 AI proposals/8 evidence refs; canonical profile
hash, domain validation, пересчёт и чтение после restart проверены. Один успешный
вызов: 4614 input + 1419 output = 6033 tokens. Cost unknown; human accuracy не измерена.
Настройки без ключей: [examples/live-config](../../examples/live-config/README.md).

Сначала реально проверены и сохранены ошибки: OpenRouter network и rate limit,
Gemini 2.5 Flash-Lite 404 (дважды, второй запрос с безопасной диагностикой). Провайдер
объяснил: старая модель недоступна новым пользователям и предложил 3.5 Flash-Lite;
официальный тариф новой модели проверен перед запуском. Всего 5 provider attempts,
никакого test fallback. Ошибки и успешная оценка остаются в приватной истории.
Каталог models и health.business_ready сами по себе доступ/квоты не доказывают.
Старые профили в локальной БД сохранены; для нового запуска выбрать рабочий профиль.

Отдельный Chromium smoke на настоящем production API подтвердил отображение
сохранённого результата: 8 критериев/обоснований, фактическая модель, переход по
доказательству с фокусом на исходной реплике, refresh. Сохранённые failed job/evaluation
показывают ошибку и отсутствие итога. Worker был отключён; число calls/jobs/evaluations
не менялось. API-процесс остановлен, скриншоты/реальные данные не публиковались.

## Дальнейшая приёмка

Поставки A/B/C для этого расширения приняты, новых заданий на реализацию фильтра нет.
Для дальнейшей работы сначала merge `integration-flags-v1` в свою продолжающуюся
ветку; чужие ветки не переписывать. Shared DTO самостоятельно не менять.
До финального release остаются U08 с независимым участником и U10 на целевой
демонстрационной машине с подтверждением действующих квот. main не обновлялся.

## Открытые ограничения

- SyntheticEvaluator пока использует placeholder profile_hash, а API отдельно не
  сверяет artifact.profile_hash с pinned profile. Это известная общая задача,
  не свидетельство неправильного hash у настоящего A evaluator.
- При unknown usage консервативное резервирование default token cap может исключить
  retry. Production-профиль должен иметь конечные лимиты; бюджет не сбрасывается.
- Без версионированного тарифа CallRecord.cost остаётся null, даже если внешний
  каталог называет модель бесплатной. Ноль в историю не подставляется.
- Организаторский формат/подписанный URL, verified audio/seek и sources в браузере
  требуют отдельной приёмки; component/API tests её не заменяют.
- Независимой оценки на размеченном GT нет; replay A не объявляется human accuracy.

Ключи, runtime-БД, live-входы/ответы и профили остаются в игнорируемых .env/data/private.
