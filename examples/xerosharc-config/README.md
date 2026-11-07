# Xerosharc: проверенный production-профиль

7 ноября 2026 проверен полный fresh-запуск на одном **выдуманном** разговоре через
настоящие API/worker: 8 критериев и 8 доказательств, artifact complete, domain
validation и profile hash совпали. Результат и job сохранились после restart.
Это проверка подключения и обработки, не измерение точности модели.

Запрошено `gpt-6.1-sol`; шлюз сообщил модель **`xeros_core`**. CallRecord хранит
оба значения раздельно. По этому ответу нельзя подтвердить, какая модель работает
за шлюзом. Официальный экспорт использует только reported actual model.
Прямые OpenAI/Anthropic API этим подключением не заявляются.

Один provider call: 5081 input + 1503 output tokens; из output 161 reasoning.
Цена неизвестна: таблица тарифов не настроена. Каталог и smoke не доказывают
заявленный продавцом остаток токенов или стабильность будущих запросов.

Копировать `profiles/` и `corpora/` в свой `CQA_CONFIG_DIR` (по умолчанию
`data/private/config`) и заполнить **только локальный** `.env`:

```dotenv
XEROSHARC_API_KEY=<ваш ключ>
XEROSHARC_BASE_URL=https://xerosharc.site/v1
```

После перезапуска API выбрать профиль `live-xerosharc-sol-v1`.
Профиль содержит только имя переменной ключа, ограничивает calls/tokens/deadline,
не использует fallback/reviewer или test evaluator. Пустой корпус явно отражается
в limitations. Отсутствующий ключ/невалидный endpoint блокируют production.
Менять зарегистрированный ID/version нельзя: для других настроек создать новую
версию. DEV сдача остаётся результатом Gemini и не пересчитывается этим профилем.
