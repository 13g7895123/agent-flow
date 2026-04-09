-- name: InsertAgentLog :exec
INSERT INTO agent_logs (execution_run_id, sequence, type, content)
VALUES ($1, $2, $3, $4);

-- name: ListLogsByRun :many
SELECT * FROM agent_logs WHERE execution_run_id = $1 ORDER BY sequence;
