# CQA API (Claude B)

Серверная часть: импорт, постоянная БД, очередь заданий, версии. Команды — из корня
репозитория. Среда и установка описаны в корневом [README](../../README.md).
Текущее состояние и ограничения — в [handoff](../../docs/handoffs/claude-b.md).

## Запуск

Явный тестовый режим: синтетический оценщик foundation, без сети и ключей.
Отдельная runtime-БД лежит в игнорируемом каталоге.

PowerShell:

```powershell
$env:CQA_MODE="test"; $env:CQA_EVALUATOR="test"
$env:CQA_DATA_DIR="data/private/b-test"
$env:CQA_DATABASE_URL="sqlite:///data/private/b-test/cqa.sqlite3"
uv run uvicorn cqa_api.main:app --host 127.0.0.1 --port 8000
```

Bash:

```bash
CQA_MODE=test CQA_EVALUATOR=test CQA_DATA_DIR=data/private/b-test \
  CQA_DATABASE_URL=sqlite:///data/private/b-test/cqa.sqlite3 \
  uv run uvicorn cqa_api.main:app --host 127.0.0.1 --port 8000
```

Production-режим — значения по умолчанию. Тестовый оценщик в нём недоступен:
`CQA_MODE` и `CQA_EVALUATOR` обязаны совпадать, иначе сервер не стартует.

Исполнитель заданий работает внутри API (`CQA_WORKER_ENABLED=true`). Отдельный
процесс `uv run python -m cqa_api.worker` — альтернатива: тогда в API поставьте
`CQA_WORKER_ENABLED=false`. Один управляемый исполнитель на БД.

## Сквозной проход в тестовом режиме

```bash
curl -s -X POST localhost:8000/api/v1/imports -H 'content-type: application/json' \
  -d '{"source":"json","records":[{"external_id":"demo-1","channel":"agent_chat","language":"RU",
       "messages":[{"speaker":"client","text":"Вопрос","timestamp_original":"00:01"},
                   {"speaker":"operator","text":"Ответ","timestamp_original":"00:05"}]}]}'
```

Далее: `POST /checklists`, затем `POST /evaluation-batches` с `Idempotency-Key`,
профилем `test-synthetic` и полученными ID, затем `GET /jobs/{id}` и
`GET /evaluations/{id}`. Результат помечен `evaluator_mode=test` и `origin=test`.

## Настройки

Значения задаются окружением или локальным `.env`; в Git их нет.

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `CQA_MODE`, `CQA_EVALUATOR` | `production` | Режим; оба `test` — явный тестовый |
| `CQA_TEST_SCENARIO` | `complete` | Сценарий тестового оценщика: complete/partial/failed |
| `CQA_DATA_DIR` | `data/private` | Приватные данные |
| `CQA_DATABASE_URL` | `sqlite:///data/private/cqa.sqlite3` | Только файл SQLite на локальном диске |
| `CQA_CONFIG_DIR` | `<data_dir>/config` | Каталоги `profiles/*.json`, `corpora/*.json` |
| `CQA_DATASET_URL` | пусто | Секретный адрес организаторов; `{group_id}` в нём подставляется, иначе добавляется query-параметр |
| `CQA_IMPORT_MAX_BYTES`, `CQA_IMPORT_MAX_RECORDS` | 10 MiB, 1000 | Лимиты тела запроса и записей |
| `CQA_ORGANIZER_TIMEOUT_SECONDS` | 30 | Таймаут скачивания |
| `CQA_SQLITE_BUSY_TIMEOUT_MS` | 5000 | Ожидание блокировки записи |
| `CQA_SQLITE_SYNCHRONOUS` | `FULL` | Долговечность WAL: `FULL` или `NORMAL` |
| `CQA_WORKER_ENABLED`, `CQA_WORKER_CONCURRENCY` | `true`, 2 | Исполнитель внутри API |
| `CQA_WORKER_POLL_SECONDS`, `CQA_LEASE_SECONDS` | 0.5, 60 | Опрос очереди и срок lease |
| `CQA_RETRY_BASE_SECONDS`, `CQA_RETRY_MAX_SECONDS` | 5, 60 | Экспоненциальная пауза между попытками |
| `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY` | пусто | Ключи читает только сервер |

## Проверки

```bash
uv run pytest apps/api/tests
uv run ruff check apps/api
uv run mypy
```

Тесты используют только временные БД и `httpx.MockTransport`: сети, ключей и
приватных данных не требуют.

## Устройство

- `db.py` — WAL, внешние ключи, `BEGIN IMMEDIATE` для записи, миграции Alembic из
  `migrations/`. Миграция выполняется при старте API и исполнителя.
- `ports.py` — единственный вход в `cqa_domain`/`cqa_ai`. Сервер не считает баллы и
  не канонизирует hash сам.
- `testmode.py` — только `CQA_MODE=test`. Пока функция `cqa_domain` не реализована,
  используется явная заглушка: `score` без арифметики (`total_score=null`), hash с
  отдельным префиксом, заведомо не канонический. Реализованная функция A сразу
  получает приоритет. `business_ready` остаётся `false`, пока домена нет.
- `importing.py`, `organizer.py` — атомарный импорт и приватный адаптер организаторов.
- `jobs.py`, `worker.py` — постоянные задания, попытки, lease, общий бюджет, запись
  вызовов; вызов оценщика идёт вне транзакций.
