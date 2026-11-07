# Официальная сдача результатов JSON 1.0

Источник: локальный `CQA_Student_Guide_Appendix_Results (2).pdf`, 3 страницы,
SHA-256 `cf9e282fee6ee6fdc9ac0b857a513e21ff3010ef99db8e4d61df64f8c079f741`.
Текст поручения: [дополнение](specs/06_OFFICIAL_SUBMISSION_ADDENDUM.md).
Пользователь подтвердил имя команды **Vtiposhniki** и ветку сдачи **main**.
Дедлайн — **8 ноября 2026, 12:00 UTC+5**: общий Q&A, сообщение 3056 от
7 ноября, 17:34:41 UTC+5 («Завтра в 12:00 дедлайн»). Сверено с предоставленным
экспортом `ChatExport_2026-11-07 (1)/messages.html`, SHA-256
`eca62ccfba3b0234f87d1b8e9fa40fc6dcca458e174c6b7eedbf16c740c70da8`.
Это состояние объявлений на момент экспорта. Доступ к PROD отдельно предоставляют организаторы;
CLI не подставляет PROD в DEV URL и не скачивает ещё не выданный набор.

Пути в сдаваемой ветке: `results/dev/results.json` (60 чатов + 5 звонков) и
`results/prod/results.json` (10 контрольных чатов). Пока контрольные данные не
получены, второго файла нет: его нельзя заполнять примерами или копией DEV.
Синтетический пример из PDF находится только в `fixtures/submission/`.

Для живой демонстрации используйте README и локальное приложение. Видео не является
обязательным по сообщению 3084 того же Q&A от 7 ноября, 18:03:21 UTC+5.

## Источники и ограничения адаптера

`cqa_contracts.submission` — единственный источник типов. Из него генерируются
`contracts/organizer-results.schema.json` и TypeScript. `cqa_submission` берёт
закреплённые версии из SQLite в одной read-only transaction, используя существующие
API readers. Обычный SafeExport, UI и HTTP операции не меняются.

Карта восьми критериев явная. Semantic/scoring hashes сравниваются с исходной
доменной рубрикой: похожее название, чужая шкала, другой вес или условие N/A не
принимаются. Команда `init` создаёт отдельный официальный чек-лист и сохраняет
фактически выданный API version ID. Последующие пользовательские версии не меняют
этот снимок. Исходные ID, channel/language, revision и все исходные turns сверяются
с приватным manifest. В `source_index` учитываются клиент, оператор, бот и события.
Необратимое объединение или удаление сообщений вызывает ошибку подготовки.

В `value` попадает исходная ступень; итог вычисляет только `cqa_domain.score` и
сверяет с сохранённым automatic_score. Итог сериализуется JSON number. Официальный
экспорт использует только automatic; human overrides остаются в продукте.
Partial/undetermined/failed становятся `status=error`, а не N/A или нулём. Это наша
политика переноса внутренних состояний, не отдельная цитата из PDF. Незавершённые
задания по умолчанию блокируют выгрузку; `--allow-unfinished` явно оформляет их как
error, если ждать больше нельзя. Это не делает их реально обработанными.

Model.name собирается из CallRecord.actual в сохранённом журнале, включая реально
использованные reviewer/fallback. Неиспользованная конфигурация не попадает в список.
Если ни одна фактическая модель не подтверждена, подготовка прекращается.
Поддерживаемые сейчас Gemini/DeepSeek/OpenRouter/Xerosharc — облачные: mode=external_api.
Количество моделей не превращает режим в hybrid. Test evaluator подавать нельзя.

## Подготовка и выполнение

Из корня установленного проекта выполнить `uv sync --locked --all-packages --dev`.
Подготовить production-профиль и ключ по [README](../README.md) и
[проверенному примеру](../examples/live-config/README.md), затем запустить API:

```sh
npm run build
uv run uvicorn cqa_api.main:app --host 127.0.0.1 --port 8000 --workers 1
```

В другом терминале, из того же корня (на Windows можно заменить `uv run cqa-submit`
на `.venv\Scripts\python.exe -m cqa_submission`):

```sh
uv run cqa-submit init --team-name Vtiposhniki --branch main --profile-id live-gemini-35-flash-lite-v1 --profile-version 1 --config data/private/submission/config-pinned.json
uv run cqa-submit import --source data/private/submission/dev.source.json --dataset dev --manifest data/private/submission/dev.manifest.json
uv run cqa-submit evaluate --manifest data/private/submission/dev.manifest.json --config data/private/submission/config-pinned.json --run data/private/submission/dev-official.run.json --interval-seconds 6 --timeout-seconds 3600
```

`dev.source.json` — **реально полученный** неизменённый ответ организаторов с
`isSuccess=true` и `data.records`, исходными `conversation_id` и `transcript`.
Его нужно сохранить приватно; команда не угадывает адрес API. Импорт через JSON
сохраняет полный текстовый transcript; signed audio URL не копируется в публичные
выходы. Звонки оцениваются по расшифровке, акустический анализ не заявляется.

Проверка размера/каналов/дублей выполняется до импорта. Сам импорт не вызывает AI.
`evaluate` создаёт по одному fresh job и сохраняет idempotency keys **до** POST.
Повтор той же команды с тем же run-файлом продолжает обработку без дублирования
ранее принятых заданий. Нельзя удалять receipt ради повторения запроса.
На первом отказе команда останавливается. После проверки провайдера продолжить:

```sh
uv run cqa-submit evaluate --manifest data/private/submission/dev.manifest.json --config data/private/submission/config-pinned.json --run data/private/submission/dev-official.run.json --continue-on-failure --max-consecutive-failures 3 --interval-seconds 6 --timeout-seconds 3600
```

Успешные/ошибочные завершённые jobs не пересоздаются. Три новых последовательных
отказа снова останавливают запуск. При необходимости повторной AI-оценки создать
отдельный run-файл: это новые вызовы с новой историей, а не сброс старого бюджета.
Расходы и фактическая бесплатная квота зависят от аккаунта; без тарифа cost=unknown.

## Выгрузка и проверка

Путь к SQLite должен соответствовать запущенному API. Для подготовленной локальной
конфигурации это `data/private/live/cqa.sqlite3`. Сначала создать приватный кандидат:

```sh
uv run cqa-submit export --manifest data/private/submission/dev.manifest.json --config data/private/submission/config-pinned.json --run data/private/submission/dev-official.run.json --database data/private/live/cqa.sqlite3 --output data/private/submission/dev.candidate.json
uv run cqa-submit validate --file data/private/submission/dev.candidate.json --manifest data/private/submission/dev.manifest.json --config data/private/submission/config-pinned.json --run data/private/submission/dev-official.run.json --database data/private/live/cqa.sqlite3
```

CLI печатает dataset, total, ok/error, SHA-256 и признак сверки с сохранёнными
оценками. `validate` только с `--file/--manifest` проверяет типы, покрытие, арифметику
и границы evidence; сверка происхождения требует также config/run/database.

До публичной записи прочитать все rationale. Адреса, телефоны, email и типичные ключи
автоматически удаляются, но регулярное выражение не гарантирует распознавание имён
или всех персональных данных. Дополнительные буквальные значения для удаления
записываются в приватный `config-pinned.json`, поле `redactions`; затем кандидат
создаётся заново. Удаление личных деталей не должно подменять основание оценки.
Объяснения длиннее 600 символов блокируются для осмысленного сокращения, а не
обрезаются посреди отрицания или вывода. Ни raw provider error, ни transcript в
официальный файл не копируются. Собственно ID сохраняются по требованию формата.

После просмотра передать **SHA-256 именно проверенного кандидата**:

```sh
uv run cqa-submit export --manifest data/private/submission/dev.manifest.json --config data/private/submission/config-pinned.json --run data/private/submission/dev-official.run.json --database data/private/live/cqa.sqlite3 --output results/dev/results.json --reviewed-sha256 <SHA256_ПРОВЕРЕННОГО_КАНДИДАТА>
uv run cqa-submit validate --file results/dev/results.json --manifest data/private/submission/dev.manifest.json --config data/private/submission/config-pinned.json --run data/private/submission/dev-official.run.json --database data/private/live/cqa.sqlite3
```

При изменении текста или результатов старый hash не подходит. Файл сначала
полностью валидируется, затем записывается через временный файл, fsync и atomic
replace; ошибка оставляет предыдущий корректный результат целым. Этот CLI не
выполняет commit/push и не подтверждает, что файл уже опубликован.

Для PROD после фактической выдачи данных повторить те же команды с `--dataset prod`,
приватными `prod.source.json`, `prod.manifest.json`, `prod-official.run.json` и
`results/prod/results.json`. Проверяются ровно **заданные 10 ID**, а не любые десять.

## Публикация и удалённая проверка

Публиковать только проверенный код и официальные JSON. Source/manifest/run/config,
БД, ключи и полные ответы остаются в `data/private/` или `.env`.
Сначала проверить ветку и diff; интеграцию с main выполнять с сохранением истории.
После реальной сдачи обоих наборов:

```sh
git add -- results/dev/results.json results/prod/results.json
git diff --cached --check
git commit -m "Submit verified organizer results"
git push origin main
git fetch origin main
git rev-parse HEAD origin/main
git cat-file -e origin/main:results/dev/results.json
git cat-file -e origin/main:results/prod/results.json
git diff --exit-code HEAD origin/main -- results/dev/results.json results/prod/results.json
```

Указанные две проверки наличия файлов обязательны для полной сдачи. Пока PROD не
получен, публикация DEV является частичной сдачей; не объявлять R-EXPORT-10 закрытым.
Не использовать force-push. Отсутствующий file/неуспешный push нельзя скрывать.

## Автоматическая приёмка

```sh
uv run pytest packages/cqa_submission/tests apps/api/tests/test_submission_integration.py
uv run python scripts/generate_contracts.py --check
uv run python scripts/check.py
```

R-EXPORT-01–08 покрываются синтетическими тестами адаптера, схемы и реального API/
SQLite. Пример 85.38 не является GT. R-EXPORT-09/10 подтверждаются отдельно фактическим
прогоном, проверкой rationale и чтением опубликованных файлов.
