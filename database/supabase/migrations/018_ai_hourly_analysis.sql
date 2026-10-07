CREATE TABLE IF NOT EXISTS ai_hourly_analysis (
  id BIGSERIAL PRIMARY KEY,
  analysis_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  records_analyzed INT NOT NULL DEFAULT 0,
  current_value NUMERIC(12, 2),
  prediction NUMERIC(12, 2),
  prediction_3h NUMERIC(12, 2),
  prediction_6h NUMERIC(12, 2),
  prediction_24h NUMERIC(12, 2),
  confidence NUMERIC(6, 4),
  trend VARCHAR(20),
  anomaly_detected BOOLEAN NOT NULL DEFAULT FALSE,
  anomaly_score NUMERIC(12, 4),
  insight TEXT,
  recommendation TEXT,
  alert_level VARCHAR(20) NOT NULL DEFAULT 'none',
  model_version VARCHAR(40),
  model_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  comparisons JSONB NOT NULL DEFAULT '{}'::jsonb,
  series JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ai_hourly_period UNIQUE (period_start)
);

CREATE INDEX IF NOT EXISTS idx_ai_hourly_analysis_period
  ON ai_hourly_analysis (period_start DESC);

CREATE INDEX IF NOT EXISTS idx_ai_hourly_analysis_status
  ON ai_hourly_analysis (status, period_start DESC);
