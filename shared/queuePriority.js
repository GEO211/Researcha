export const SEVERITY_SCORES = Object.freeze({
  critical: 140,
  high: 100,
  moderate: 60,
  low: 20,
});

export const SEVERITY_RANKS = Object.freeze({
  critical: 4,
  high: 3,
  moderate: 2,
  low: 1,
});

export const PRIORITY_MODIFIERS = Object.freeze({
  is_infant: 30,
  is_pregnant: 25,
  is_senior: 20,
  is_pwd: 20,
  is_child: 15,
  is_indigenous: 10,
  is_solo_parent: 10,
});

export const PRIORITY_FACTOR_LABELS = Object.freeze({
  is_infant: 'Infant',
  is_pregnant: 'Pregnant',
  is_senior: 'Senior citizen',
  is_pwd: 'PWD',
  is_child: 'Child',
  is_indigenous: 'Indigenous (IP)',
  is_solo_parent: 'Solo parent',
});

export const PRIORITY_LEVELS = Object.freeze([
  { value: 'critical', minScore: 100, label: 'Critical priority' },
  { value: 'high', minScore: 80, label: 'High priority' },
  { value: 'medium', minScore: 50, label: 'Medium priority' },
  { value: 'normal', minScore: 0, label: 'Normal priority' },
]);

// Severity bands are 40 points apart. Capping the combined demographic bonus
// below that gap prevents vulnerability flags from overriding a higher
// medical-severity band.
export const MAX_VULNERABILITY_BONUS = 39;

const DEFAULT_SEVERITY = 'moderate';

function normalizedSeverity(value) {
  const key = String(value || '').trim().toLowerCase();
  return Object.hasOwn(SEVERITY_SCORES, key) ? key : DEFAULT_SEVERITY;
}

function isPrioritySelected(value) {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function queueNumberParts(value) {
  const text = String(value || '');
  const match = text.match(/^(.*?)-?(\d+)$/);
  return match
    ? { prefix: match[1], number: Number(match[2]) }
    : { prefix: text, number: Number.MAX_SAFE_INTEGER };
}

export function priorityLevelForScore(score) {
  const numericScore = Number.isFinite(Number(score)) ? Number(score) : 0;
  return PRIORITY_LEVELS.find((level) => numericScore >= level.minScore) || PRIORITY_LEVELS.at(-1);
}

export function legacyPriorityLevel(priorityLevel) {
  if (priorityLevel === 'critical') return 'priority_1_emergency';
  if (priorityLevel === 'high' || priorityLevel === 'medium') return 'priority_2_vulnerable';
  return 'priority_3_standard';
}

export function calculateQueuePriority({ patient = {}, severity } = {}) {
  const severityKey = normalizedSeverity(severity);
  const severityScore = SEVERITY_SCORES[severityKey];
  const selectedFactors = Object.entries(PRIORITY_MODIFIERS)
    .filter(([key]) => isPrioritySelected(patient?.[key]))
    .map(([key, modifier]) => ({
      key,
      label: PRIORITY_FACTOR_LABELS[key],
      modifier,
    }));
  const rawVulnerabilityScore = selectedFactors.reduce((sum, factor) => sum + factor.modifier, 0);
  const vulnerabilityScore = Math.min(rawVulnerabilityScore, MAX_VULNERABILITY_BONUS);
  const score = severityScore + vulnerabilityScore;
  const priority = priorityLevelForScore(score);

  return {
    score,
    priorityLevel: priority.value,
    priorityLabel: priority.label,
    legacyPriorityLevel: legacyPriorityLevel(priority.value),
    severity: severityKey,
    severityRank: SEVERITY_RANKS[severityKey],
    severityScore,
    vulnerabilityScore,
    rawVulnerabilityScore,
    vulnerabilityCount: selectedFactors.length,
    factors: selectedFactors.map((factor) => factor.label),
    reasons: [
      `${severityKey[0].toUpperCase()}${severityKey.slice(1)} severity`,
      ...selectedFactors.map((factor) => `${factor.label} (+${factor.modifier})`),
      ...(rawVulnerabilityScore > MAX_VULNERABILITY_BONUS
        ? [`Vulnerability bonus capped at +${MAX_VULNERABILITY_BONUS} for severity safety`]
        : []),
    ],
  };
}

export function compareQueuePriority(a = {}, b = {}) {
  const scoreDiff = Number(b.priority_score || 0) - Number(a.priority_score || 0);
  if (scoreDiff) return scoreDiff;

  const severityDiff = Number(b.severity_rank || 0) - Number(a.severity_rank || 0);
  if (severityDiff) return severityDiff;

  const vulnerabilityDiff = Number(b.vulnerability_count || 0) - Number(a.vulnerability_count || 0);
  if (vulnerabilityDiff) return vulnerabilityDiff;

  const timeA = new Date(a.created_at || 0).getTime();
  const timeB = new Date(b.created_at || 0).getTime();
  if (timeA !== timeB) return timeA - timeB;

  const queueA = queueNumberParts(a.queue_number);
  const queueB = queueNumberParts(b.queue_number);
  if (queueA.number !== queueB.number) return queueA.number - queueB.number;
  return queueA.prefix.localeCompare(queueB.prefix);
}
