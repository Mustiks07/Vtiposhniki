// Russian UI labels for contract enums. Original conversation text is never translated.
import type { ReasonCode } from '../api/types';

export const languageLabel: Record<string, string> = { RU: 'Русский', KZ: 'Қазақша', EN: 'English' };
export const channelLabel: Record<string, string> = { agent_chat: 'Чат', voice_call: 'Звонок' };

export const speakerLabel: Record<string, string> = {
  client: 'Клиент',
  operator: 'Оператор',
  bot: 'Бот',
  system: 'Система',
};

export const evaluationListStatusLabel: Record<string, string> = {
  unevaluated: 'Не оценён',
  pending: 'В обработке',
  complete: 'Оценка полная',
  partial: 'Оценка неполная',
  failed: 'Ошибка оценки',
};

export const jobStateLabel: Record<string, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  retry_wait: 'Ожидает повтора',
  succeeded: 'Обработка завершена',
  failed: 'Ошибка',
  cancelled: 'Отменено',
};

export const artifactStatusLabel: Record<string, string> = {
  complete: 'Оценка полная',
  partial: 'Оценка неполная',
  failed: 'Оценка не получена',
};

export const scoreStatusLabel: Record<string, string> = {
  complete: 'Итог рассчитан',
  no_applicable_weight: 'Нет применимых весов',
  incomplete_evaluation: 'Оценка неполная',
};

export const scoreStatusExplanation: Record<string, string> = {
  no_applicable_weight:
    'Итог не рассчитан: ни один взвешенный критерий не применим (все N/A или нулевые веса). Это не 0 баллов.',
  incomplete_evaluation:
    'Итог не рассчитан: по части критериев ответ не определён. Это не 0 баллов — нужен ответ по каждому критерию.',
};

export const applicabilityLabel: Record<string, string> = {
  applicable: 'Применим',
  not_applicable: 'N/A',
  undetermined: 'Не определено',
};

export const responseTypeLabel: Record<string, string> = {
  binary: 'Да/Нет',
  scale: 'Шкала',
  flag: 'Флаг нарушения',
};

export const originLabel: Record<string, string> = {
  ai: 'AI',
  test: 'Тестовый оценщик',
  human: 'Решение проверяющего',
};

export const relationLabel: Record<string, string> = {
  support: 'подтверждает',
  counter: 'опровергает',
  context: 'контекст',
};

export const reasonCodeLabel: Record<ReasonCode, string> = {
  criteria_met: 'Критерий выполнен',
  criteria_partially_met: 'Выполнен частично',
  criteria_not_met: 'Не выполнен',
  not_applicable: 'Неприменим',
  missing_expected_action: 'Пропущено ожидаемое действие',
  insufficient_evidence: 'Недостаточно данных',
  conflicting_evidence: 'Противоречивые данные',
  factual_verification_limited: 'Фактическая проверка ограничена',
  violation_detected: 'Нарушение обнаружено',
  no_violation_detected: 'Нарушений нет',
  other: 'Другое',
  human_confirmed: 'Подтверждено человеком',
  human_changed: 'Изменено человеком',
};

export const callPurposeLabel: Record<string, string> = {
  primary: 'основной',
  review: 'reviewer',
  repair: 'исправление формата',
  fallback: 'резервный',
};

export const callOutcomeLabel: Record<string, string> = {
  started: 'начат',
  succeeded: 'успешно',
  failed: 'ошибка',
  timeout: 'таймаут',
  cancelled: 'отменён',
  unknown: 'неизвестно',
};

export const errorCodeLabel: Record<string, string> = {
  validation_error: 'Данные не прошли проверку',
  not_found: 'Не найдено',
  revision_conflict: 'Данные изменились в другом окне',
  idempotency_conflict: 'Конфликт повторного запроса',
  open_appeal_exists: 'По этому критерию уже есть открытая апелляция',
  invalid_state: 'Действие недоступно в текущем состоянии',
  payload_too_large: 'Слишком большой объём данных',
  configuration_error: 'Сервер не настроен для этого действия',
  provider_error: 'Ошибка провайдера модели',
  budget_exceeded: 'Исчерпан бюджет вызовов',
  timeout: 'Превышено время ожидания',
  cancelled: 'Отменено',
  lease_lost: 'Задание перехвачено другим исполнителем',
  persistence_error: 'Ошибка сохранения',
  audio_unavailable: 'Запись недоступна',
  not_implemented: 'Функция ещё не реализована на сервере',
  internal_error: 'Внутренняя ошибка сервера',
};

export const detailReasonLabel: Record<string, string> = {
  invalid: 'некорректное значение',
  missing: 'отсутствует обязательное поле',
  duplicate: 'дубликат',
  conflicting_duplicate: 'конфликтующий дубликат',
  limit_exceeded: 'превышен лимит',
  unsupported: 'не поддерживается',
};
