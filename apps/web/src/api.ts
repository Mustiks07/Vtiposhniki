import type { components, paths } from '../../../contracts/typescript/api';
import { buildUrl } from './api/client';

export type Health = components['schemas']['Health'];
export type HealthResponse = paths['/api/v1/health']['get']['responses'][200]['content']['application/json'];

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(buildUrl('/health'), { signal });
  if (!response.ok) throw new Error('Сервер недоступен');
  return response.json() as Promise<HealthResponse>;
}
