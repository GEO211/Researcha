import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPhilippineAiContext,
  latestPopulation,
  listPhilippineDatasets,
  matchKoronadalBarangay,
} from '../../shared/philippineDatasets.js';

test('philippine datasets cover Koronadal and national programs', () => {
  const datasets = listPhilippineDatasets();
  assert.ok(datasets.length >= 10);
  assert.ok(datasets.some((item) => item.series === 'psa-koronadal-barangays'));
  assert.ok(datasets.every((item) => item.record_count > 0 && item.publisher && item.as_of && item.checked_on === '2026-10-07'));
});

test('barangay populations sum to the PSA 2020 Koronadal total', () => {
  const rows = [
    'Assumption', 'Avanceña', 'Cacub', 'Caloocan', 'Carpenter Hill', 'Concepcion',
    'Esperanza', 'General Paulino Santos', 'Mabini', 'Magsaysay', 'Mambucal', 'Morales',
    'Namnama', 'New Pangasinan', 'Paraiso', 'Rotonda', 'San Isidro', 'San Jose',
    'San Roque', 'Santa Cruz', 'Santo Niño', 'Sarabia', 'Zone I', 'Zone II', 'Zone III',
    'Zone IV', 'Zulueta',
  ].map((name) => matchKoronadalBarangay(name));

  assert.equal(rows.length, 27);
  assert.ok(rows.every(Boolean));
  assert.equal(rows.reduce((sum, row) => sum + latestPopulation(row).value, 0), 195398);
  assert.ok(rows.every((row) => latestPopulation(row).year === 2020));
  assert.equal(matchKoronadalBarangay('Barangay Saravia Health Center').name, 'Sarabia');
  assert.equal(matchKoronadalBarangay('Topland').population_2020, 9814);
  assert.equal(matchKoronadalBarangay('Sta. Cruz').name, 'Santa Cruz');
});

test('ai context rates referrals against population and DOH programs', () => {
  const context = buildPhilippineAiContext({
    barangayRows: [
      { label: 'Barangay General Paulino Santos Health Center', count: 20 },
      { label: 'Topland', count: 20 },
    ],
    reasonText: 'Hypertension follow-up and dengue fever',
    at: new Date('2026-10-05T00:00:00+08:00'),
  });

  assert.equal(context.month_name, 'October');
  assert.equal(context.as_of_label, '5 October 2026');
  assert.equal(context.summary.includes('2025'), false);
  assert.ok(context.national_morbidity_alignment.every((row) => !String(row.note).includes('2025')));
  assert.equal(context.catalog_checked_on, '2026-10-07');
  assert.equal(context.city_population, 201844);
  assert.equal(context.city_population_year, 2024);
  assert.equal(context.show, true);
  assert.equal(context.population_adjusted_barangays[0].psa_name, 'Zulueta');
  assert.ok(context.population_adjusted_barangays[0].cases_per_1000
    > context.population_adjusted_barangays[1].cases_per_1000);
  assert.ok(context.matched_programs.some((program) => program.id === 'philpen'));
  assert.ok(context.notifiable_matches.some((disease) => disease.name === 'Dengue'));
  assert.ok(context.seasonal_watch.some((risk) => risk.condition === 'Dengue' && risk.level === 'elevated'));
  assert.ok(context.recommendations.length >= 2);
});

test('hides the reference block when live referrals do not need it', () => {
  const context = buildPhilippineAiContext({
    barangayRows: [
      { label: 'Barangay Morales Health Center', count: 8 },
    ],
    reasonText: 'Laboratory result interpretation and treatment plan',
    at: new Date('2026-10-05T00:00:00+08:00'),
  });

  assert.equal(context.show, false);
  assert.equal(context.population_adjusted_barangays.length, 0);
  assert.equal(context.seasonal_watch.length, 0);
  assert.equal(context.summary, '');
});
