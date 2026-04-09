CREATE TABLE execution_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  run_index     SMALLINT NOT NULL,
  step_id       UUID,
  agent_id      UUID,
  agent_name    TEXT NOT NULL DEFAULT '',
  phase         run_phase NOT NULL,
  prompt_sent   TEXT NOT NULL DEFAULT '',
  output        TEXT NOT NULL DEFAULT '',
  exit_code     SMALLINT,
  success       BOOLEAN,
  error_message TEXT NOT NULL DEFAULT '',
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX idx_execution_runs_task ON execution_runs(task_id);
