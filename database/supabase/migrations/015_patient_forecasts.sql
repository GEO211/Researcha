CREATE TABLE IF NOT EXISTS patient_forecasts (
  id SERIAL PRIMARY KEY,
  scope_key VARCHAR(120) NOT NULL,
  scope_type VARCHAR(30) NOT NULL CHECK (scope_type IN ('receiving_center', 'referring_center', 'citywide')),
  health_center_id INT REFERENCES health_centers(id),
  forecast_date DATE NOT NULL,
  predicted_patient_count INT NOT NULL CHECK (predicted_patient_count >= 0),
  lower_bound INT NOT NULL CHECK (lower_bound >= 0),
  upper_bound INT NOT NULL CHECK (upper_bound >= lower_bound),
  hourly_forecast JSONB NOT NULL DEFAULT '[]'::jsonb,
  severity_forecast JSONB NOT NULL DEFAULT '{}'::jsonb,
  vulnerability_forecast JSONB NOT NULL DEFAULT '{}'::jsonb,
  peak_start_hour INT,
  peak_end_hour INT,
  predicted_queue_load VARCHAR(20) NOT NULL CHECK (predicted_queue_load IN ('low', 'moderate', 'high', 'critical', 'unavailable')),
  expected_peak_queue INT,
  model_name VARCHAR(80) NOT NULL,
  model_version VARCHAR(30) NOT NULL,
  training_data_start DATE NOT NULL,
  training_data_end DATE NOT NULL,
  training_days INT NOT NULL,
  source_record_count INT NOT NULL,
  source_updated_at TIMESTAMPTZ,
  confidence_status VARCHAR(30) NOT NULL,
  validation_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  explanation_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  actual_patient_count INT,
  absolute_error NUMERIC(12,4),
  squared_error NUMERIC(16,4),
  absolute_percentage_error NUMERIC(12,4),
  actual_updated_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_patient_forecast_scope_date UNIQUE (scope_key, forecast_date)
);

CREATE INDEX IF NOT EXISTS idx_patient_forecasts_scope_date
  ON patient_forecasts (scope_key, forecast_date DESC);

CREATE INDEX IF NOT EXISTS idx_patient_forecasts_accuracy
  ON patient_forecasts (scope_key, actual_patient_count)
  WHERE actual_patient_count IS NOT NULL;
