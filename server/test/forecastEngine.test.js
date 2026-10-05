import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDateDays,
  asDateKey,
  calculateAccuracyMetrics,
  generateForecastAnalysis,
} from '../src/services/forecastEngine.js';

const TODAY = '2026-04-15';

function historyRows(days, countForDay = () => 5) {
  const rows = [];
  for (let offset = -days; offset <= 0; offset += 1) {
    const date = addDateDays(TODAY, offset);
    const count = Number(countForDay(date, offset));
    rows.push({
      date,
      patient_count: count,
      high_count: Math.floor(count * 0.2),
      moderate_count: Math.floor(count * 0.5),
      low_count: count - Math.floor(count * 0.2) - Math.floor(count * 0.5),
      critical_count: 0,
      senior_count: Math.floor(count * 0.25),
      pregnant_count: Math.floor(count * 0.1),
      pwd_count: Math.floor(count * 0.15),
      child_count: Math.floor(count * 0.2),
      infant_count: Math.floor(count * 0.05),
      indigenous_count: Math.floor(count * 0.1),
      solo_parent_count: Math.floor(count * 0.1),
    });
  }
  return rows;
}

function hourlyRows() {
  return Array.from({ length: 7 }, (_, weekday) => (
    [7, 8, 9, 10, 11, 13, 14, 15, 16].map((hour) => ({
      weekday,
      hour,
      patient_count: hour >= 9 && hour <= 11 ? 12 : 4,
    }))
  )).flat();
}

test('fewer than 30 completed days returns historical estimates, not a forecast', () => {
  const result = generateForecastAnalysis({
    dailyRows: historyRows(12),
    hourlyRows: hourlyRows(),
    todayDate: TODAY,
  });

  assert.equal(result.status, 'insufficient_data');
  assert.equal(result.forecasts.length, 0);
  assert.equal(result.model, null);
  assert.match(result.message, /insufficient historical data/i);
});

test('forecast output is deterministic and never random', () => {
  const input = {
    dailyRows: historyRows(45, (_date, offset) => 8 + (Math.abs(offset) % 7)),
    hourlyRows: hourlyRows(),
    todayDate: TODAY,
  };

  assert.deepEqual(generateForecastAnalysis(input), generateForecastAnalysis(input));
});

test('future rows cannot leak into chronological training', () => {
  const baseRows = historyRows(45, (_date, offset) => 6 + (Math.abs(offset) % 5));
  const base = generateForecastAnalysis({
    dailyRows: baseRows,
    hourlyRows: hourlyRows(),
    todayDate: TODAY,
  });
  const withFutureRows = generateForecastAnalysis({
    dailyRows: [
      ...baseRows,
      { date: addDateDays(TODAY, 1), patient_count: 999, high_count: 999 },
      { date: addDateDays(TODAY, 2), patient_count: 999, high_count: 999 },
    ],
    hourlyRows: hourlyRows(),
    todayDate: TODAY,
  });

  assert.deepEqual(withFutureRows.forecasts, base.forecasts);
  assert.deepEqual(withFutureRows.model, base.model);
});

test('model selection compares baseline and advanced models chronologically', () => {
  const rows = historyRows(70, (date) => {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return day === 1 ? 20 : day === 5 ? 12 : 4;
  });
  const result = generateForecastAnalysis({
    dailyRows: rows,
    hourlyRows: hourlyRows(),
    todayDate: TODAY,
  });

  assert.equal(result.status, 'forecast_available');
  assert.equal(result.model.validation.selected, 'weekday_recent_trend');
  assert.ok(result.model.validation.advanced.mae < result.model.validation.baseline.mae);
});

test('ranges contain forecasts and severity allocations equal daily totals', () => {
  const result = generateForecastAnalysis({
    dailyRows: historyRows(45, (_date, offset) => 10 + (Math.abs(offset) % 4)),
    hourlyRows: hourlyRows(),
    todayDate: TODAY,
  });

  for (const forecast of result.forecasts) {
    assert.ok(forecast.lower <= forecast.expected);
    assert.ok(forecast.upper >= forecast.expected);
    assert.equal(
      Object.values(forecast.severity).reduce((sum, value) => sum + value, 0),
      forecast.expected,
    );
    assert.equal(
      forecast.hourly.reduce((sum, row) => sum + row.expected, 0),
      forecast.expected,
    );
  }
});

test('missing optional classification fields are handled safely', () => {
  const rows = historyRows(40, () => 5).map(({ date, patient_count }) => ({ date, patient_count }));
  const result = generateForecastAnalysis({
    dailyRows: rows,
    hourlyRows: [],
    capacityRows: [],
    todayDate: TODAY,
  });

  assert.equal(result.status, 'forecast_available');
  assert.equal(result.forecasts[0].severity.unknown, result.forecasts[0].expected);
  assert.equal(result.forecasts[0].expectedPeakQueue, null);
  assert.equal(result.forecasts[0].capacityStatus, 'unavailable');
});

test('anomaly detection is gated and never assigns a cause', () => {
  const insufficient = generateForecastAnalysis({
    dailyRows: historyRows(10),
    todayDate: TODAY,
  });
  assert.equal(insufficient.anomaly.status, 'unavailable');

  const sufficient = generateForecastAnalysis({
    dailyRows: historyRows(50, (_date, offset) => (offset === 0 ? 100 : 5)),
    hourlyRows: hourlyRows(),
    todayDate: TODAY,
  });
  assert.ok(['normal', 'elevated', 'anomalous'].includes(sufficient.anomaly.status));
  assert.equal('cause' in sufficient.anomaly, false);
});

test('missing calendar days are filled with zero demand', () => {
  const result = generateForecastAnalysis({
    dailyRows: [
      { date: addDateDays(TODAY, -40), patient_count: 20 },
      { date: addDateDays(TODAY, -20), patient_count: 18 },
      { date: addDateDays(TODAY, -1), patient_count: 16 },
    ],
    hourlyRows: hourlyRows(),
    todayDate: TODAY,
  });

  assert.equal(result.coverage.calendar_days, 40);
  assert.equal(result.coverage.active_days, 3);
  assert.equal(result.coverage.record_count, 54);
  assert.equal(result.status, 'forecast_available');
  assert.ok(result.forecasts[0].lowDemandStartHour != null);
});

test('date keys stay on the Manila calendar date', () => {
  assert.equal(asDateKey('2026-10-05T16:30:00.000Z'), '2026-10-05');
  assert.equal(asDateKey(new Date('2026-10-04T16:00:00.000Z')), '2026-10-05');
});

test('accuracy metrics require seven completed forecast/actual pairs', () => {
  const six = Array.from({ length: 6 }, (_, index) => ({
    forecast_date: addDateDays('2026-01-01', index),
    predicted_patient_count: 10,
    actual_patient_count: 12,
  }));
  assert.equal(calculateAccuracyMetrics(six).available, false);

  const seven = [...six, {
    forecast_date: '2026-01-07',
    predicted_patient_count: 10,
    actual_patient_count: 12,
  }];
  const metrics = calculateAccuracyMetrics(seven);
  assert.equal(metrics.available, true);
  assert.equal(metrics.mae, 2);
  assert.equal(metrics.rmse, 2);
  assert.equal(metrics.mape, 16.67);
});

