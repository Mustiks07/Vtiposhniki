# Claude B handoff

Foundation SHA: `e526aef85ad9a368b7389488514f0d53ed531ef0`. Ветка: `claude/api-jobs`.

Статус: промежуточная поставка B1. B2 и B3 в работе; этот файл будет заменён полным
отчётом. R01–R26 не заявляются.

## B1: что работает

Импорт (JSON и организаторы) → постоянное задание → явный тестовый оценщик
foundation → сохранённый результат → чтение через API, в том числе после перезапуска.
Реализованы маршруты health, imports, conversations, checklists и версии, batches,
jobs, evaluations, evaluator-profiles, knowledge-sources. Остальные пока отвечают
явным 501: audio, retry, appeals, export.

Запуск и настройки: [apps/api/README.md](../../apps/api/README.md).

## Что важно интеграторам

- C: API уже можно подключать в тестовом режиме. Пока домена A нет, `total_score`
  равен `null`, а `business_ready` — `false`.
- GPT Pro: `apps/web/e2e/foundation.spec.ts` проверяет 501 на `/conversations` и
  `phase=foundation`. После B1 эта проверка по замыслу падает, спецификация
  принадлежит C/интегратору, правки нужны с их стороны.
