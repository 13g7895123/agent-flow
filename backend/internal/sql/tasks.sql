-- name: ListTasksByProject :many
SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at DESC;

-- name: GetTask :one
SELECT * FROM tasks WHERE id = $1;

-- name: CreateTask :one
INSERT INTO tasks (project_id, pipeline_id, prompt, max_retries, pipeline_snapshot)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateTaskStatus :one
UPDATE tasks SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *;

-- name: UpdateTaskStarted :one
UPDATE tasks SET status = 'running', started_at = NOW(), updated_at = NOW()
WHERE id = $1 RETURNING *;

-- name: UpdateTaskCompleted :one
UPDATE tasks SET status = $2, completed_at = NOW(), updated_at = NOW()
WHERE id = $1 RETURNING *;

-- name: UpdateStepOutputs :exec
UPDATE tasks SET step_outputs = $2, updated_at = NOW() WHERE id = $1;

-- name: IncrementRetry :exec
UPDATE tasks SET current_retry = current_retry + 1, updated_at = NOW() WHERE id = $1;

-- name: CancelTask :one
UPDATE tasks SET status = 'cancelled', updated_at = NOW()
WHERE id = $1 AND status NOT IN ('done', 'failed', 'cancelled')
RETURNING *;

-- name: ListStuckTasks :many
SELECT * FROM tasks
WHERE status IN ('running', 'fixing', 'verifying')
ORDER BY created_at;
