import { calculateQueuePriority } from '../../../shared/queuePriority.js';

export async function calculatePriority({ patient, referral }) {
  const priority = calculateQueuePriority({
    patient,
    severity: referral?.severity_level,
  });
  return {
    ...priority,
    priorityScore: priority.score,
    priorityBand: priority.priorityLevel,
    priorityLevel: priority.legacyPriorityLevel,
  };
}
