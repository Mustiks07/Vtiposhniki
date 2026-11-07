# Интеграция и контракт фильтра — 2026-11-07

Промежуточная поставка, не финальный release в main. Исторический отчёт foundation:
[foundation.md](foundation.md). Foundation `e526aef85ad9a368b7389488514f0d53ed531ef0`
и его теги не менялись.

## Включённые поставки

В integration/gpt-pro сохранены отдельные merge-коммиты, без squash/force-push:

| Роль | Ветка | Проверенный head |
|---|---|---|
| A | claude/domain-ai | 36adbdb14ca65dd04dcc72761ad95c151e50086a |
| B | claude/api-jobs | 923bbd83121584615cc5b459521d16ceccd99b5b |
| C | claude/web-e2e | 8dfa5b3cb157cb8397a7238011e5c1bfb2fe03e4 |

Три прежних замечания A, пять B и три C проверены и закрыты. Новые regression tests
C дополнительно проверены на старом e67d4b1 (падают) и 8dfa5b3 (проходят): пагинация
апелляций, подтверждение изменённого mapping, смена optimistic token после refetch.

## Общее изменение

[Дополнение пользователя](../specs/05_ORGANIZER_ADDENDUM.md) опубликовано дословно.
Точный [HTTP-контракт фильтра](../FLAG_FILTER_CONTRACT.md) зафиксирован интегратором.
Тег `contracts-v1.1.0` указывает общий SHA: `git rev-parse contracts-v1.1.0`.
Это маркер контракта, не релиз готовой функции.

- HTTP 1.1.0, DTO schema_version 1.0, 23 операции; расширен listConversations.
- checklist_version_id + один flag_criterion_id; flag_status; automatic/effective.
- Текущая revision, последний job выбранной версии, без исторического fallback.
- ConversationFlagQuery/Summary используют существующий FlagResult; без новых
  вычислителей флагов, типов rationale/evidence или арифметики в API/web.
- Pydantic, generated JSON Schema/OpenAPI/TypeScript и 6 новых synthetic fixtures.
- Ограниченные изменения B: совпадающая сигнатура маршрута, общая API_VERSION,
  проверка query и временный явный 501 вместо игнорирования нового фильтра.
- Обновлены README, .env.example, CI-названия и итог aggregate check.
- python-dotenv 1.2.4 закреплён как прямая зависимость API (ранее был транзитивным);
  версии установленного набора не обновлялись, lock/sync и импорты проверены.

**Выборка пока не реализована:** B заменяет guard501 запросом до пагинации; C добавляет
UI и U01–U04. Старые сценарии работают. Контракт/fixtures не являются прохождением U01–U04.

## Проверки

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

Автоматические E2E используют настоящий API с явным test evaluator; это не настоящий
AI-анализ и не измерение близости к Ground Truth.

## Приёмка дополнения

| Проверка | Фактическое покрытие / остаток |
|---|---|
| U01 | Не выполнена: server flag search, total, pagination — B/C |
| U02 | Partial и tri-state домена покрыты; поиск true/false/unknown — B/C |
| U03 | Evidence/appeals/immutable automatic покрыты; search scopes — B/C |
| U04 | Произвольные критерии и повторные оценки покрыты; flag search без дублей — B/C |
| U05 | E16–E18: подача, решение, refresh, история; API restart persistence |
| U06 | E08–E11 и regressions: criterion/mapping/weight/reuse/версии; добавить definition edit → fresh run |
| U07 | Пройден настоящий fresh production smoke на новом выдуманном тексте: Gemini 3.5 Flash-Lite, 8/8 AI proposals, valid evidence, persist/restart; не проверка accuracy |
| U08 | Не выполнена: нужен участник, который не писал приложение |
| U09 | E04/E05/E07: refresh, restart, retry; API lease/cancel/persistence tests |
| U10 | Частично: запуск и generation на этой Windows-машине подтверждены; целевой demo-ноутбук/запас квот не подтверждены; provenance покрыт E11 |

## Настоящий AI smoke

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

## Следующие поставки

A: merge общего SHA, сохранить рубрику/flags/N/A и prompt cqa-eval-v2; помощь по
реальным содержательным ошибкам после smoke. Расширение ансамблей не приоритет.

B: merge общего SHA; реализовать docs/FLAG_FILTER_CONTRACT.md в apps/api. Заменить
guard и тесты 501 на U01–U04. До COUNT/LIMIT выбрать current revision и newest job
exact version. Проверить pending/failed поверх старого true, новую revision,
arbitrary flag, scope после appeal, пустой результат и total.

C: merge общего SHA; версия/флаговый criterion/scope/status в Диалогах, серверный total
и объяснение через existing evaluation card. Не фильтровать загруженную страницу.
U01–U04 проводить после реализации B через настоящий backend. Добавить U06 definition
edit → fresh run, сохранив C4 regression tests.

Shared DTO самостоятельно не менять. Публиковать свою ветку и передавать SHA;
интегратор повторяет совместную приёмку. main обновляется после приёмки, не сейчас.

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
