CREATE TABLE agent_logs (
  id               BIGSERIAL PRIMARY KEY,
  execution_run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
  sequence         INTEGER NOT NULL,
  type             log_type NOT NULL,
  content          TEXT NOT NULL,
  timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_logs_run ON agent_logs(execution_run_id, sequence);
