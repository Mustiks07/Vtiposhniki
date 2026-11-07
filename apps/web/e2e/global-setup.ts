import { servers } from './support';

/**
 * Browser acceptance needs the real business API. Against the foundation stub every
 * scenario would fail for an unrelated reason, so stop early with an explicit message.
 * This is a failure, never a skip: E01–E20 are not reported as passed without the API.
 */
export default async function globalSetup() {
  const res = await fetch(`${servers.complete}/api/v1/health`);
  const health = (await res.json()) as { phase?: string; evaluator_mode?: string };
  if (health.phase === 'foundation') {
    throw new Error(
      'E2E requires the real CQA API (Claude B). The API started from CQA_E2E_API_ROOT is the foundation stub ' +
        '(phase=foundation). Run on the integration branch or set CQA_E2E_API_ROOT to a checkout containing apps/api B.',
    );
  }
  if (health.evaluator_mode !== 'test') {
    throw new Error('Deterministic E2E scenarios require the explicit test evaluator (CQA_MODE=test).');
  }
}
