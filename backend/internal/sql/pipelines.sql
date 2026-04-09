-- name: ListPipelines :many
SELECT p.*,
  (SELECT COUNT(*) FROM projects pr WHERE pr.pipeline_id = p.id) AS used_in_projects
FROM pipelines p
ORDER BY p.created_at DESC;

-- name: GetPipeline :one
SELECT p.*,
  (SELECT COUNT(*) FROM projects pr WHERE pr.pipeline_id = p.id) AS used_in_projects
FROM pipelines p
WHERE p.id = $1;

-- name: CreatePipeline :one
INSERT INTO pipelines (name, description, fixer_agent_id, is_default)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdatePipeline :one
UPDATE pipelines
SET name = $2, description = $3, fixer_agent_id = $4, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: ClearDefaultPipeline :exec
UPDATE pipelines SET is_default = FALSE WHERE is_default = TRUE;

-- name: SetDefaultPipeline :one
UPDATE pipelines SET is_default = TRUE, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeletePipeline :exec
DELETE FROM pipelines WHERE id = $1;

-- name: CountPipelineUsageInProjects :one
SELECT COUNT(*) FROM projects WHERE pipeline_id = $1;
