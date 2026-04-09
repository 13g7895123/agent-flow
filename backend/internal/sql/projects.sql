-- name: ListProjects :many
SELECT pr.*, p.name AS pipeline_name
FROM projects pr
JOIN pipelines p ON p.id = pr.pipeline_id
ORDER BY pr.created_at DESC;

-- name: GetProject :one
SELECT pr.*, p.name AS pipeline_name
FROM projects pr
JOIN pipelines p ON p.id = pr.pipeline_id
WHERE pr.id = $1;

-- name: CreateProject :one
INSERT INTO projects (name, path, test_command, pipeline_id, description)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateProject :one
UPDATE projects
SET name = $2, path = $3, test_command = $4, pipeline_id = $5, description = $6, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteProject :exec
DELETE FROM projects WHERE id = $1;
