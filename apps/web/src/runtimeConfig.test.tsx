import { afterEach, expect, test } from 'vitest';
import { apiBase, embedding } from './runtimeConfig';

afterEach(() => { delete window.CQA_CONFIG; });

test('host can configure an API base before startup; the normal default stays relative', () => {
  expect(apiBase()).toBe('/api/v1');
  window.CQA_CONFIG = { apiBase: 'https://cqa.example/api/v1/' };
  expect(apiBase()).toBe('https://cqa.example/api/v1');
});

test('only explicit embed mode activates the conversation entrypoint', () => {
  expect(embedding('?conversation=conv_123')).toEqual({ embedded: false, conversation: null });
  expect(embedding('?embed=1&conversation=conv_123')).toEqual({ embedded: true, conversation: 'conv_123' });
});
