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

function latestInSeries(series) {
  const matches = data.datasets.filter((item) => item.series === series);
  if (!matches.length) throw new Error(`Missing Philippine dataset series: ${series}`);
  return matches.sort((a, b) => String(b.as_of).localeCompare(String(a.as_of)))[0];
}

export function latestPopulation(row) {
  const vintages = Object.entries(row || {})
    .filter(([key, value]) => /^population_\d{4}$/.test(key) && Number.isFinite(value))
    .map(([key, value]) => ({ year: Number(key.slice('population_'.length)), value }))
    .sort((a, b) => b.year - a.year);
  return vintages[0] || null;
}

export function listPhilippineDatasets() {
  const newest = new Map();
  for (const item of data.datasets) {
    const current = newest.get(item.series);
    if (!current || String(item.as_of) > String(current.as_of)) newest.set(item.series, item);
  }
  return [...newest.values()].map((item) => ({
    id: item.id,
    series: item.series,
    title: item.title,
    publisher: item.publisher,
    year: item.year,
    as_of: item.as_of,
    checked_on: item.checked_on || data.checked_on,
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
  for (const row of latestInSeries('psa-koronadal-barangays').records) {
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
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value || '1';
  const monthName = parts.find((part) => part.type === 'month')?.value || 'January';
  const year = parts.find((part) => part.type === 'year')?.value || String(date.getFullYear());
  const month = MONTHS.indexOf(monthName) + 1 || 1;
  return { month, year: Number(year), label: `${day} ${monthName} ${year}` };
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
      const population = latestPopulation(match);
      if (!population) return null;
      const cases = Number(row.count || 0);
      return {
        label: row.label,
        psa_name: match.name,
        cases,
        population: population.value,
        population_year: population.year,
        cases_per_1000: Math.round((cases / population.value) * 100000) / 100,
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
  const { month, label: asOfLabel } = manilaParts(at);
  const text = String(reasonText || '').toLowerCase();
  const geography = latestInSeries('psa-geography');
  const cityPopulation = latestPopulation(geography.records.find((row) => row.name === 'Koronadal City'));
  const adjusted = populationAdjusted(barangayRows).slice(0, 5);
  const topRate = adjusted[0] || null;
  const rawLeader = matchKoronadalBarangay(barangayRows[0]?.label);
  const rateChangesRank = Boolean(topRate && rawLeader && topRate.psa_name !== rawLeader.name);

  const matchedPrograms = latestInSeries('doh-primary-care-programs').records
    .map((program) => ({
      id: program.id,
      name: program.name,
      agency: program.agency,
      action: program.action,
      matched_keywords: matchedKeywords(text, program.keywords),
    }))
    .filter((program) => program.matched_keywords.length);

  const notifiableMatches = latestInSeries('doh-pidsr').records
    .map((disease) => ({
      name: disease.name,
      category: disease.category,
      matched_keywords: matchedKeywords(text, disease.keywords),
    }))
    .filter((disease) => disease.matched_keywords.length);

  const seasonalWatch = latestInSeries('pagasa-seasonal-health').records.map((risk) => {
    const seen = matchedKeywords(text, risk.keywords);
    const inPeak = risk.peak_months.includes(month);
    return {
      condition: risk.condition,
      level: inPeak ? 'elevated' : 'off-peak',
      seen_locally: seen.length > 0,
      guidance: risk.guidance,
    };
  }).filter((risk) => risk.seen_locally);

  const morbiditySet = latestInSeries('doh-morbidity-r12');
  const morbidityAlignment = morbiditySet.records
    .map((row) => {
      const seen = matchedKeywords(text, row.keywords);
      return {
        rank: row.rank,
        condition: row.condition,
        cases: row.cases,
        local_match: seen.length > 0,
        note: `${Number(row.cases).toLocaleString('en-PH')} ${morbiditySet.geography} cases, compared on ${asOfLabel}.`,
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
      `${morbidityAlignment[0].condition} is also on the latest ${morbiditySet.geography} morbidity list, compared on ${asOfLabel}.`,
    );
  }

  return {
    timezone: 'Asia/Manila',
    as_of_label: asOfLabel,
    month,
    month_name: MONTHS[month - 1],
    summary: summaryParts.join(' '),
    show: Boolean(rateChangesRank || notifiableMatches.length || seasonalWatch.length || morbidityAlignment.length),
    catalog_checked_on: data.checked_on,
    city_population: cityPopulation?.value ?? null,
    city_population_year: cityPopulation?.year ?? null,
    population_adjusted_barangays: rateChangesRank ? adjusted : [],
    matched_programs: matchedPrograms.slice(0, 6),
    notifiable_matches: notifiableMatches.slice(0, 6),
    seasonal_watch: seasonalWatch,
    national_morbidity_alignment: morbidityAlignment,
    recommendations,
  };
}
