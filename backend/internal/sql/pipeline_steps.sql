-- name: ListStepsByPipeline :many
SELECT ps.*,
  a.id AS agent_id, a.name AS agent_name, a.description AS agent_description,
  a.system_prompt, a.step_prompt, a.model_provider, a.model_id, a.is_active
FROM pipeline_steps ps
JOIN agents a ON a.id = ps.agent_id
WHERE ps.pipeline_id = $1
ORDER BY ps."order";

-- name: DeleteStepsByPipeline :exec
DELETE FROM pipeline_steps WHERE pipeline_id = $1;

-- name: CreatePipelineStep :one
INSERT INTO pipeline_steps (pipeline_id, agent_id, "order", label)
VALUES ($1, $2, $3, $4)
RETURNING *;
