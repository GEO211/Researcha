import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const data = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'philippineDatasets.json'), 'utf8'),
);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function dataset(id) {
  return data.datasets.find((item) => item.id === id);
}

export function listPhilippineDatasets() {
  return data.datasets.map((item) => ({
    id: item.id,
    title: item.title,
    publisher: item.publisher,
    year: item.year,
    geography: item.geography,
    description: item.description,
    source_url: item.source_url,
    source_note: item.source_note,
    record_count: item.records.length,
  }));
}

export function normalizePlaceKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^brgy\.?\s+/, '')
    .replace(/^barangay\s+/, '')
    .replace(/\s+health\s+center$/, '')
    .replace(/\s+city\s+health\s+center$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function barangayIndex() {
  const index = new Map();
  for (const row of dataset('psa-2020-koronadal-barangays').records) {
    index.set(normalizePlaceKey(row.name), row);
    for (const alias of row.aliases || []) {
      index.set(normalizePlaceKey(alias), row);
    }
  }
  return index;
}

const BARANGAYS = barangayIndex();

export function matchKoronadalBarangay(value) {
  const key = normalizePlaceKey(value);
  if (!key) return null;
  return BARANGAYS.get(key) || null;
}

function manilaParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === 'month')?.value || 1);
  const year = Number(parts.find((part) => part.type === 'year')?.value || date.getFullYear());
  return { month, year };
}

function includesKeyword(text, keyword) {
  const needle = String(keyword || '').toLowerCase().trim();
  if (!needle) return false;
  if (needle.endsWith(' ')) return text.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(text);
}

function matchedKeywords(text, keywords = []) {
  return keywords.filter((keyword) => includesKeyword(text, keyword));
}

function populationAdjusted(barangayRows = []) {
  const ranked = barangayRows
    .map((row, index) => {
      const match = matchKoronadalBarangay(row.label);
      if (!match) return null;
      const cases = Number(row.count || 0);
      return {
        label: row.label,
        psa_name: match.name,
        cases,
        population_2020: match.population_2020,
        cases_per_1000: Math.round((cases / match.population_2020) * 100000) / 100,
        population_share_percent: match.share_percent,
        raw_rank: index + 1,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.cases_per_1000 - a.cases_per_1000 || b.cases - a.cases);

  return ranked.map((row, index) => ({ ...row, rate_rank: index + 1 }));
}

export function buildPhilippineAiContext({
  barangayRows = [],
  reasonText = '',
  at = new Date(),
} = {}) {
  const { month } = manilaParts(at);
  const text = String(reasonText || '').toLowerCase();
  const geography = dataset('psa-2020-geography').records;
  const city = geography.find((row) => row.name === 'Koronadal City');
  const adjusted = populationAdjusted(barangayRows).slice(0, 5);
  const topRate = adjusted[0] || null;
  const rawLeader = matchKoronadalBarangay(barangayRows[0]?.label);
  const rateChangesRank = Boolean(topRate && rawLeader && topRate.psa_name !== rawLeader.name);

  const matchedPrograms = dataset('doh-primary-care-programs').records
    .map((program) => ({
      id: program.id,
      name: program.name,
      agency: program.agency,
      action: program.action,
      matched_keywords: matchedKeywords(text, program.keywords),
    }))
    .filter((program) => program.matched_keywords.length);

  const notifiableMatches = dataset('doh-pidsr').records
    .map((disease) => ({
      name: disease.name,
      category: disease.category,
      matched_keywords: matchedKeywords(text, disease.keywords),
    }))
    .filter((disease) => disease.matched_keywords.length);

  const seasonalWatch = dataset('pagasa-seasonal-health').records.map((risk) => {
    const seen = matchedKeywords(text, risk.keywords);
    const inPeak = risk.peak_months.includes(month);
    return {
      condition: risk.condition,
      level: inPeak ? 'elevated' : 'off-peak',
      seen_locally: seen.length > 0,
      guidance: risk.guidance,
    };
  }).filter((risk) => risk.seen_locally);

  const morbidityAlignment = dataset('doh-fhsis-r12-2025').records
    .map((row) => {
      const seen = matchedKeywords(text, row.keywords);
      return {
        rank: row.rank,
        condition: row.condition,
        cases: row.cases,
        local_match: seen.length > 0,
        note: `${Number(row.cases).toLocaleString('en-PH')} SOCCSKSARGEN cases in December 2025.`,
      };
    })
    .filter((row) => row.local_match);

  const recommendations = [];
  if (rateChangesRank) {
    recommendations.push(
      `${topRate.psa_name} leads once referrals are divided by barangay population: ${topRate.cases_per_1000} cases per 1,000 residents.`,
    );
  }
  if (matchedPrograms[0]) {
    recommendations.push(matchedPrograms[0].action);
  }
  const activeSeason = seasonalWatch.find((risk) => risk.level === 'elevated');
  if (activeSeason) {
    recommendations.push(`${MONTHS[month - 1]} watch for ${activeSeason.condition}: ${activeSeason.guidance}`);
  }
  if (notifiableMatches[0]) {
    recommendations.push(
      `${notifiableMatches[0].name} appears in current referrals. Confirm whether it needs a ${notifiableMatches[0].category} PIDSR report.`,
    );
  }

  const summaryParts = [];
  if (rateChangesRank) {
    summaryParts.push(
      `${topRate.psa_name} is not the largest raw caseload, but it has the highest rate at ${topRate.cases_per_1000} referrals per 1,000 residents.`,
    );
  }
  if (morbidityAlignment[0]) {
    summaryParts.push(
      `${morbidityAlignment[0].condition} is also in the December 2025 SOCCSKSARGEN morbidity list (${morbidityAlignment[0].note})`,
    );
  }

  return {
    timezone: 'Asia/Manila',
    month,
    month_name: MONTHS[month - 1],
    summary: summaryParts.join(' '),
    show: Boolean(rateChangesRank || notifiableMatches.length || seasonalWatch.length || morbidityAlignment.length),
    city_population_2024: city.population_2024,
    population_adjusted_barangays: rateChangesRank ? adjusted : [],
    matched_programs: matchedPrograms.slice(0, 6),
    notifiable_matches: notifiableMatches.slice(0, 6),
    seasonal_watch: seasonalWatch,
    national_morbidity_alignment: morbidityAlignment,
    recommendations,
  };
}
