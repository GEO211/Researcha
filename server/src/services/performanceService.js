import { createPerformanceMetric } from '../lib/supabase/store.js';

export function startTimer() {
  return process.hrtime.bigint();
}

export async function recordMetric(operation, startedAt, referenceId = null) {
  const elapsedNs = process.hrtime.bigint() - startedAt;
  const durationMs = Math.max(1, Math.round(Number(elapsedNs) / 1_000_000));

  await createPerformanceMetric({ operation, duration_ms: durationMs, reference_id: referenceId });
}
