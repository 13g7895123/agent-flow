CREATE TABLE projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  path         TEXT NOT NULL,
  test_command TEXT NOT NULL DEFAULT '',
  pipeline_id  UUID NOT NULL REFERENCES pipelines(id),
  description  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
