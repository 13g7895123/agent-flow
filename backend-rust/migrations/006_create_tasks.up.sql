CREATE TABLE tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id),
  pipeline_id         UUID NOT NULL REFERENCES pipelines(id),
  prompt              TEXT NOT NULL,
  status              task_status NOT NULL DEFAULT 'pending',
  max_retries         SMALLINT NOT NULL DEFAULT 5,
  current_retry       SMALLINT NOT NULL DEFAULT 0,
  pipeline_snapshot   JSONB NOT NULL DEFAULT '{}',
  step_outputs        JSONB NOT NULL DEFAULT '{}',
  completed_summary   TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_status ON tasks(status);
