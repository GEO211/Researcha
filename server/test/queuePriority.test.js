import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_VULNERABILITY_BONUS,
  calculateQueuePriority,
  compareQueuePriority,
} from '../../shared/queuePriority.js';
import { calculatePriority } from '../src/services/priorityService.js';

test('high severity stays ahead of a moderate infant', () => {
  const high = calculateQueuePriority({ severity: 'high' });
  const moderateInfant = calculateQueuePriority({
    severity: 'moderate',
    patient: { is_infant: true },
  });

  assert.equal(high.score, 100);
  assert.equal(moderateInfant.score, 90);
  assert.ok(high.score > moderateInfant.score);
});

test('multiple vulnerability factors are cumulative within the safety cap', () => {
  const prioritized = calculateQueuePriority({
    severity: 'moderate',
    patient: { is_senior: true, is_pwd: true },
  });
  const standard = calculateQueuePriority({ severity: 'moderate' });

  assert.equal(prioritized.rawVulnerabilityScore, 40);
  assert.equal(prioritized.vulnerabilityScore, MAX_VULNERABILITY_BONUS);
  assert.equal(prioritized.score, 99);
  assert.equal(prioritized.vulnerabilityCount, 2);
  assert.ok(prioritized.score > standard.score);
});

test('pregnancy increases priority within low severity', () => {
  const pregnant = calculateQueuePriority({
    severity: 'low',
    patient: { is_pregnant: true },
  });
  const standard = calculateQueuePriority({ severity: 'low' });

  assert.equal(pregnant.score, 45);
  assert.ok(pregnant.score > standard.score);
});

test('demographic combinations cannot overtake a higher severity band', () => {
  const high = calculateQueuePriority({
    severity: 'high',
    patient: { is_senior: true, is_pwd: true },
  });
  const moderateAll = calculateQueuePriority({
    severity: 'moderate',
    patient: {
      is_infant: true,
      is_pregnant: true,
      is_senior: true,
      is_pwd: true,
      is_child: true,
      is_indigenous: true,
      is_solo_parent: true,
    },
  });

  assert.equal(high.score, 139);
  assert.equal(moderateAll.score, 99);
  assert.ok(high.score > moderateAll.score);
});

test('ties use severity, factor count, registration time, then queue number', () => {
  const base = {
    priority_score: 80,
    severity_rank: 2,
    vulnerability_count: 1,
  };
  const earlier = { ...base, created_at: '2026-10-05T05:00:00.000Z', queue_number: 'M-002' };
  const later = { ...base, created_at: '2026-10-05T05:05:00.000Z', queue_number: 'M-001' };
  assert.ok(compareQueuePriority(earlier, later) < 0);

  const firstQueue = { ...earlier, queue_number: 'M-001' };
  const secondQueue = { ...earlier, queue_number: 'M-002' };
  assert.ok(compareQueuePriority(firstQueue, secondQueue) < 0);
});

test('missing severity and flags are handled without crashing', () => {
  const priority = calculateQueuePriority({ patient: null, severity: null });
  assert.equal(priority.severity, 'moderate');
  assert.equal(priority.score, 60);
  assert.deepEqual(priority.factors, []);
});

test('checkbox strings are normalized safely', () => {
  const priority = calculateQueuePriority({
    severity: 'low',
    patient: {
      is_infant: 'false',
      is_pregnant: '',
      is_senior: 'true',
    },
  });

  assert.equal(priority.score, 40);
  assert.deepEqual(priority.factors, ['Senior citizen']);
});

test('server compatibility mapping keeps the new band separate from the legacy level', async () => {
  const priority = await calculatePriority({
    patient: { is_infant: true },
    referral: { severity_level: 'moderate' },
  });

  assert.equal(priority.priorityScore, 90);
  assert.equal(priority.priorityBand, 'high');
  assert.equal(priority.priorityLevel, 'priority_2_vulnerable');
});

test('adding a new high-severity patient recalculates the deterministic order', () => {
  const waiting = [
    { ...calculateQueuePriority({ severity: 'low' }), created_at: '2026-10-05T05:00:00Z', queue_number: 'S-001' },
    { ...calculateQueuePriority({ severity: 'moderate' }), created_at: '2026-10-05T05:05:00Z', queue_number: 'S-002' },
  ].map((entry) => ({
    ...entry,
    priority_score: entry.score,
    severity_rank: entry.severityRank,
    vulnerability_count: entry.vulnerabilityCount,
  }));

  const newHigh = calculateQueuePriority({ severity: 'high' });
  waiting.push({
    ...newHigh,
    priority_score: newHigh.score,
    severity_rank: newHigh.severityRank,
    vulnerability_count: newHigh.vulnerabilityCount,
    created_at: '2026-10-05T05:10:00Z',
    queue_number: 'S-003',
  });

  waiting.sort(compareQueuePriority);
  assert.equal(waiting[0].queue_number, 'S-003');
});

test('changing severity from low to high moves the patient ahead', () => {
  const row = {
    created_at: '2026-10-05T05:05:00Z',
    queue_number: 'S-002',
  };
  const other = calculateQueuePriority({ severity: 'moderate' });
  const changed = calculateQueuePriority({ severity: 'high' });
  const waiting = [
    {
      ...row,
      priority_score: changed.score,
      severity_rank: changed.severityRank,
      vulnerability_count: changed.vulnerabilityCount,
    },
    {
      priority_score: other.score,
      severity_rank: other.severityRank,
      vulnerability_count: other.vulnerabilityCount,
      created_at: '2026-10-05T05:00:00Z',
      queue_number: 'S-001',
    },
  ].sort(compareQueuePriority);

  assert.equal(waiting[0].queue_number, row.queue_number);
});
