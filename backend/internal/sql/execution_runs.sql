-- name: CreateExecutionRun :one
INSERT INTO execution_runs (task_id, run_index, step_id, agent_id, agent_name, phase, prompt_sent)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: CompleteExecutionRun :exec
UPDATE execution_runs
SET output = $2, exit_code = $3, success = $4, error_message = $5,
    duration_ms = $6, completed_at = NOW()
WHERE id = $1;

-- name: ListRunsByTask :many
SELECT * FROM execution_runs WHERE task_id = $1 ORDER BY run_index, created_at;
