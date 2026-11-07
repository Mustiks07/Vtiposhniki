import type { Conversation, ProfileSummary } from '../api/types';

/** Display an excerpt, never invent a topic or replace the original transcript. */
export function conversationTitle(conversation: Pick<Conversation, 'messages' | 'channel'>): string {
  const client = conversation.messages.filter((m) => m.speaker === 'client' && m.text.trim());
  const greeting = /^(здравствуйте|здравствуй|добрый (день|вечер)|доброе утро|привет|hello|hi|good (morning|evening)|сәлем|сәлеметсіз бе)[.!?\s]*$/iu;
  const message = client.find((m) => !greeting.test(m.text.trim())) ?? client[0]
    ?? conversation.messages.find((m) => m.text.trim() && m.speaker === 'operator');
  if (!message) return conversation.channel === 'voice_call' ? 'Запись разговора' : 'Диалог с клиентом';
  const text = message.text.trim().replace(/\s+/gu, ' ');
  return text.length > 105 ? `${text.slice(0, 104).trimEnd()}…` : text;
}

export function profileLabel(profile: ProfileSummary['profile']): string {
  if (profile.mode === 'test') return 'Тестовый оценщик';
  const provider = ({ xerosharc: 'Xerosharc', gemini: 'Gemini', deepseek: 'DeepSeek', openrouter: 'OpenRouter' } as Record<string, string>)[profile.primary.provider] ?? 'AI-провайдер';
  const purpose: Record<string, string> = {
    'live-xerosharc-quality-v1': 'Основной профиль',
    'boundary-xerosharc-v7-1': 'Контрольные чаты',
    'boundary-gemini-v7-1': 'Резерв для чатов',
    'live-gemini-35-flash-lite-v1': 'Исходный профиль DEV',
  };
  const prompt = profile.prompt_version.replace(/^cqa-eval-/, '');
  return `${provider} · ${purpose[profile.id] ?? profile.primary.model} · инструкции ${prompt}`;
}

export function scopeLabel(scope: string): string {
  return scope === 'automatic' ? 'Оценка AI' : 'После пересмотра';
}
