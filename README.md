# CQA — foundation

Проверяемый каркас Conversation Quality Analytics. Это исходная база для трёх
независимых исполнителей, а не готовое приложение и не измеренная AI-точность.
Сервер публикует общие контракты и явные HTTP-заглушки; бизнес-операции ещё не
реализованы. Никаких скрытых тестовых оценок в production-режиме.

Согласованные требования: [MASTER](docs/specs/00_MASTER_SPEC.md),
[Claude A](docs/specs/01_CLAUDE_DOMAIN_AI.md),
[Claude B](docs/specs/02_CLAUDE_API_JOBS.md),
[Claude C](docs/specs/03_CLAUDE_WEB_E2E.md),
[интеграция](docs/specs/04_GPT_PRO_INTEGRATION.md).
Состояние поставки и ограничения: [handoff интегратора](docs/handoffs/gpt-pro.md).

## Среда и чистая установка

Python **3.13.5**, uv **0.13.7**, Node **26.1.0**, npm **11.13.0**.
Версии закреплены в manifests, `uv.lock`, `package-lock.json`, `.python-version`
и `.node-version`. Docker не требуется. SQLite и миграции предусмотрены для
одного локального экземпляра на постоянном диске; worker/хранение реализует B.

Из корня репозитория после установки указанных Python и Node:

```sh
python -m pip install uv==0.13.7
npm install --global npm@11.13.0
uv sync --locked --all-packages --dev
npm ci
npx playwright install chromium
```

На Linux для браузерного smoke вместо последней команды:
`npx playwright install --with-deps chromium`.
В PowerShell при запрете запуска `npm.ps1` используйте `npm.cmd` и `npx.cmd`.
Если uv установлен в текущей среде вне PATH, используйте `python -m uv`.
Локальная техническая установка интегратора `.tools/bin/uv.exe` игнорируется Git
и не является обязательной частью проекта.

## Запуск

API с контрактными заглушками и готовой production-сборкой web:

```sh
npm run build
uv run uvicorn cqa_api.main:app --host 127.0.0.1 --port 8000
```

Открыть [локальный интерфейс](http://127.0.0.1:8000) и
[OpenAPI](http://127.0.0.1:8000/docs).
Рабочий health: `GET /api/v1/health`. Не реализованные операции возвращают
явный `501` в общей форме ошибки. Это проверка каркаса, не импорт/оценка.

Разработка web в отдельном терминале: `npm run dev`.
Vite обслуживает [локальный dev-интерфейс](http://127.0.0.1:5173), API остаётся
на порту 8000. Worker entrypoint: `uv run python -m cqa_api.worker`;
в foundation он явно сообщает, что реализация ещё отсутствует, и завершается
с ошибкой. Не запускайте второй независимый scheduler поверх будущей БД B.

## Контракты и проверки

Единственный источник публичных моделей — `packages/cqa_contracts/src`.
HTTP operation contract находится в том же пакете. JSON Schema/OpenAPI/TypeScript
в `contracts/` генерируются; не редактируйте их вручную.
Десятичные значения передаются строками, `null` остаётся `null`.
Безопасный экспорт использует отдельные DTO без транскрипта, свободных пояснений
и URL. Контрактные fixtures в `fixtures/contracts/` полностью синтетические.

| Действие | Команда из корня |
|---|---|
| Обновить generated-контракты | `uv run python scripts/generate_contracts.py` |
| Проверить отсутствие drift | `uv run python scripts/generate_contracts.py --check` |
| Python lint | `uv run ruff check .` |
| Python typecheck | `uv run mypy` |
| Python/fixture/API smoke | `uv run pytest` |
| TypeScript | `npm run typecheck` |
| Web unit tests | `npm test` |
| Production web build | `npm run build` |
| Browser smoke | `npm run e2e` |
| Общая проверка foundation | `uv run python scripts/check.py` |

Browser smoke использует настоящий сервер каркаса и production assets.
Он не подтверждает E01–E20 или готовность полного пользовательского цикла.
CI выполняет проверки на Windows и Linux. Реальные AI-вызовы в CI не выполняются.
Стоимость и точность провайдеров на этом этапе не измерялись.

## Владение и общий старт

| Владелец | Ветка | Пути |
|---|---|---|
| Claude A | `claude/domain-ai` | `packages/cqa_domain`, `packages/cqa_ai`, `fixtures/evaluation`, свой handoff |
| Claude B | `claude/api-jobs` | `apps/api`, свой handoff |
| Claude C | `claude/web-e2e` | `apps/web`, свой handoff |
| Интегратор | `integration/gpt-pro` | общие контракты/fixtures, scripts, manifests/lockfiles, CI, общая документация |

Все четыре ветки стартуют с одного опубликованного foundation SHA, указанного
в отчёте поставки. Использовать отдельные клоны/worktrees и отдельные `.env`/БД.
Сначала проверить `git rev-parse HEAD`. Не переключать общую рабочую директорию
между агентами. Изменение shared-контрактов/зависимостей направлять интегратору;
продолжающиеся ветки интегрируются merge-коммитами с сохранением истории.

Ещё отсутствуют: исходная бизнес-рубрика, scoring/hash/AI и провайдеры A;
импорт, постоянная БД, миграции, worker, retries, апелляции и экспорт B;
продуктовые экраны и полная браузерная приёмка C. Заглушки намеренно не реализуют
эти модули и не выдаются за результаты их тестирования.

## Приватные данные

Копируйте `.env.example` в `.env` только локально. `CQA_DATASET_URL` и ключи
`GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY` остаются пустыми в Git.
Production не подставляет fixture при отсутствии ключа. Явный тестовый оценщик
предназначен для изолированных проверок контракта.

Реальные разговоры, аудио, БД, результаты запусков, signed URLs, скриншоты и
traces с личными данными хранить в игнорируемом `data/private/`.
Не публиковать приватные материалы под видом fixtures. Каждый исполнитель
проверяет diff перед публикацией; `.gitignore` не заменяет эту проверку.
