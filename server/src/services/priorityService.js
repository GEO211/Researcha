import { getActivePriorityRules, getSystemSetting } from '../lib/supabase/store.js';

const FALLBACK_RULES = {
  clinical_urgency: {
    emergency: 100,
    urgent: 60,
    routine: 20,
  },
  demographic: {
    is_senior: 25,
    is_pregnant: 25,
    is_pwd: 25,
  },
  referral_type: {
    emergency: 50,
    specialist_consultation: 30,
    follow_up: 15,
    routine: 5,
  },
  severity: {
    low: 5,
    moderate: 15,
    high: 35,
    critical: 60,
  },
};

async function loadRules() {
  const rows = await getActivePriorityRules();
  const rules = structuredClone(FALLBACK_RULES);

  for (const row of rows) {
    rules[row.category] ||= {};
    rules[row.category][row.condition_key] = Number(row.score_value);
  }

  return rules;
}

async function loadThresholds() {
  const [emergencyRow, vulnerableRow] = await Promise.all([
    getSystemSetting('priority.emergency.threshold'),
    getSystemSetting('priority.vulnerable.threshold'),
  ]);

  return {
    emergency: Number(emergencyRow?.setting_value) || 100,
    vulnerable: Number(vulnerableRow?.setting_value) || 50,
  };
}

export async function calculatePriority({ patient, referral }) {
  const rules = await loadRules();
  const thresholds = await loadThresholds();
  const clinicalScore = rules.clinical_urgency[referral.clinical_urgency] || 0;
  const referralScore = rules.referral_type[referral.referral_type] || 0;
  const severityScore = rules.severity[referral.severity_level || 'moderate'] || 0;

  const demographicScore =
    (patient.is_senior ? rules.demographic.is_senior || 0 : 0) +
    (patient.is_pregnant ? rules.demographic.is_pregnant || 0 : 0) +
    (patient.is_pwd ? rules.demographic.is_pwd || 0 : 0);

  const score = clinicalScore + referralScore + demographicScore + severityScore;
  const isVulnerable = Boolean(patient.is_senior || patient.is_pregnant || patient.is_pwd);

  if (referral.clinical_urgency === 'emergency' || score >= thresholds.emergency) {
    return { priorityScore: score, priorityLevel: 'priority_1_emergency' };
  }

  if (isVulnerable || score >= thresholds.vulnerable) {
    return { priorityScore: score, priorityLevel: 'priority_2_vulnerable' };
  }

  return { priorityScore: score, priorityLevel: 'priority_3_standard' };
}
