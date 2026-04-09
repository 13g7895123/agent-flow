package handler

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type CreateTaskBody struct {
	Prompt     string `json:"prompt"`
	MaxRetries int    `json:"maxRetries"`
}

func (h *Handler) ListTasks(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	rows, err := h.db.Query(c.Context(), `
		SELECT id, project_id, pipeline_id, prompt, status,
		  max_retries, current_retry, pipeline_snapshot, step_outputs,
		  created_at, updated_at, started_at, completed_at
		FROM tasks WHERE project_id=$1::uuid ORDER BY created_at DESC`, projectID)
	if err != nil {
		return fiber.NewError(500, err.Error())
	}
	defer rows.Close()

	var tasks []fiber.Map
	for rows.Next() {
		var id, projectIDStr, pipelineID, prompt, status string
		var maxRetries, currentRetry int16
		var snapshotRaw, outputsRaw json.RawMessage
		var createdAt, updatedAt, startedAt, completedAt interface{}
		if err := rows.Scan(&id, &projectIDStr, &pipelineID, &prompt, &status,
			&maxRetries, &currentRetry, &snapshotRaw, &outputsRaw,
			&createdAt, &updatedAt, &startedAt, &completedAt); err != nil {
			return fiber.NewError(500, err.Error())
		}
		tasks = append(tasks, fiber.Map{
			"id": id, "projectId": projectIDStr, "pipelineId": pipelineID,
			"prompt": prompt, "status": status,
			"maxRetries": maxRetries, "currentRetry": currentRetry,
			"pipelineSnapshot": snapshotRaw, "stepOutputs": outputsRaw,
			"createdAt": createdAt, "updatedAt": updatedAt,
			"startedAt": startedAt, "completedAt": completedAt,
		})
	}
	if tasks == nil {
		tasks = []fiber.Map{}
	}
	return c.JSON(tasks)
}

func (h *Handler) CreateTask(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	var body CreateTaskBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(400, err.Error())
	}
	if body.Prompt == "" {
		return fiber.NewError(422, "prompt required")
	}
	if body.MaxRetries <= 0 {
		body.MaxRetries = 5
	}

	// 取 project 的 pipelineId
	var pipelineID, projectPath, testCommand string
	err := h.db.QueryRow(c.Context(),
		"SELECT pipeline_id::text, path, test_command FROM projects WHERE id=$1::uuid", projectID,
	).Scan(&pipelineID, &projectPath, &testCommand)
	if err != nil {
		return fiber.NewError(404, "project not found")
	}

	// 建立 pipeline snapshot
	snapshot, err := h.GetPipelineSnapshot(c, pipelineID)
	if err != nil {
		return fiber.NewError(500, "failed to build pipeline snapshot: "+err.Error())
	}

	// 將 projectPath 和 testCommand 注入 snapshot（供 orchestrator 使用）
	var snapshotMap map[string]interface{}
	json.Unmarshal(snapshot, &snapshotMap)
	snapshotMap["projectPath"] = projectPath
	snapshotMap["testCommand"] = testCommand
	snapshotWithMeta, _ := json.Marshal(snapshotMap)

	row := h.db.QueryRow(c.Context(), `
		INSERT INTO tasks (project_id, pipeline_id, prompt, max_retries, pipeline_snapshot)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5)
		RETURNING id,project_id,pipeline_id,prompt,status,max_retries,current_retry,pipeline_snapshot,step_outputs,created_at,updated_at`,
		projectID, pipelineID, body.Prompt, body.MaxRetries, snapshotWithMeta,
	)

	var id, projID, pipID, prompt, status string
	var maxR, curR int16
	var snapRaw, outRaw json.RawMessage
	var createdAt, updatedAt interface{}
	if err := row.Scan(&id, &projID, &pipID, &prompt, &status, &maxR, &curR, &snapRaw, &outRaw, &createdAt, &updatedAt); err != nil {
		return fiber.NewError(500, err.Error())
	}

	// 入佇列
	taskUID, err := uuid.Parse(id)
	if err != nil {
		return fiber.NewError(500, "invalid task id: "+err.Error())
	}
	if err := h.enqueue(taskUID); err != nil {
		return fiber.NewError(500, "enqueue failed: "+err.Error())
	}

	return c.Status(201).JSON(fiber.Map{
		"id": id, "projectId": projID, "pipelineId": pipID,
		"prompt": prompt, "status": status,
		"maxRetries": maxR, "currentRetry": curR,
		"pipelineSnapshot": snapRaw, "stepOutputs": outRaw,
		"createdAt": createdAt, "updatedAt": updatedAt,
	})
}

func (h *Handler) GetTask(c *fiber.Ctx) error {
	id := c.Params("id")
	row := h.db.QueryRow(c.Context(), `
		SELECT id,project_id,pipeline_id,prompt,status,max_retries,current_retry,
		  pipeline_snapshot,step_outputs,created_at,updated_at,started_at,completed_at
		FROM tasks WHERE id=$1::uuid`, id)
	var tid, projID, pipID, prompt, status string
	var maxR, curR int16
	var snapRaw, outRaw json.RawMessage
	var createdAt, updatedAt, startedAt, completedAt interface{}
	if err := row.Scan(&tid, &projID, &pipID, &prompt, &status, &maxR, &curR, &snapRaw, &outRaw, &createdAt, &updatedAt, &startedAt, &completedAt); err != nil {
		return fiber.NewError(404, "task not found")
	}
	return c.JSON(fiber.Map{
		"id": tid, "projectId": projID, "pipelineId": pipID,
		"prompt": prompt, "status": status,
		"maxRetries": maxR, "currentRetry": curR,
		"pipelineSnapshot": snapRaw, "stepOutputs": outRaw,
		"createdAt": createdAt, "updatedAt": updatedAt,
		"startedAt": startedAt, "completedAt": completedAt,
	})
}

func (h *Handler) CancelTask(c *fiber.Ctx) error {
	id := c.Params("id")
	uid, err := uuid.Parse(id)
	if err != nil {
		return fiber.NewError(400, "invalid task id")
	}
	h.orchestrator.Cancel(uid)
	row := h.db.QueryRow(c.Context(),
		`UPDATE tasks SET status='cancelled',updated_at=NOW()
		 WHERE id=$1::uuid AND status NOT IN ('done','failed','cancelled')
		 RETURNING id,status`, id)
	var tid, status string
	if err := row.Scan(&tid, &status); err != nil {
		return fiber.NewError(409, "task cannot be cancelled")
	}
	return c.JSON(fiber.Map{"id": tid, "status": status})
}

func (h *Handler) RetryTask(c *fiber.Ctx) error {
	id := c.Params("id")
	row := h.db.QueryRow(c.Context(),
		`UPDATE tasks SET status='pending',current_retry=0,updated_at=NOW()
		 WHERE id=$1::uuid AND status='failed'
		 RETURNING id,prompt,pipeline_id,project_id,max_retries,pipeline_snapshot`, id)
	var tid, prompt, pipID, projID string
	var maxR int16
	var snapRaw json.RawMessage
	if err := row.Scan(&tid, &prompt, &pipID, &projID, &maxR, &snapRaw); err != nil {
		return fiber.NewError(409, "only failed tasks can be retried")
	}
	taskUID, err := uuid.Parse(tid)
	if err != nil {
		return fiber.NewError(500, "invalid task id")
	}
	if err := h.enqueue(taskUID); err != nil {
		return fiber.NewError(500, "enqueue failed")
	}
	return c.JSON(fiber.Map{"id": tid, "status": "pending"})
}
