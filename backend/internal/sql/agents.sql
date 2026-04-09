-- name: ListAgents :many
SELECT a.*,
  (SELECT COUNT(*) FROM pipeline_steps ps WHERE ps.agent_id = a.id) AS used_in_pipelines
FROM agents a
ORDER BY a.created_at DESC;

-- name: GetAgent :one
SELECT a.*,
  (SELECT COUNT(*) FROM pipeline_steps ps WHERE ps.agent_id = a.id) AS used_in_pipelines
FROM agents a
WHERE a.id = $1;

-- name: CreateAgent :one
INSERT INTO agents (name, description, system_prompt, step_prompt, model_provider, model_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateAgent :one
UPDATE agents
SET name = $2, description = $3, system_prompt = $4, step_prompt = $5,
    model_provider = $6, model_id = $7, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: ToggleAgent :one
UPDATE agents SET is_active = NOT is_active, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteAgent :exec
DELETE FROM agents WHERE id = $1;

-- name: CountAgentUsageInPipelines :one
SELECT COUNT(*) FROM pipeline_steps WHERE agent_id = $1;

-- name: CountAgents :one
SELECT COUNT(*) FROM agents;
