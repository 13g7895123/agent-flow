package handler

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"
)

func (h *Handler) ListPipelines(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT p.id, p.name, p.description, p.fixer_agent_id, p.is_default, p.is_active, p.created_at, p.updated_at,
		  (SELECT COUNT(*) FROM projects pr WHERE pr.pipeline_id = p.id) AS used_in_projects
		FROM pipelines p ORDER BY p.created_at DESC`)
	if err != nil {
		return fiber.NewError(500, err.Error())
	}
	defer rows.Close()

	var pipelines []fiber.Map
	for rows.Next() {
		var id, name, fixerAgentID string
		var desc *string
		var isDefault, isActive bool
		var createdAt, updatedAt interface{}
		var usedInProjects int64
		if err := rows.Scan(&id, &name, &desc, &fixerAgentID, &isDefault, &isActive, &createdAt, &updatedAt, &usedInProjects); err != nil {
			return fiber.NewError(500, err.Error())
		}
		// 取 steps
		steps, _ := h.getPipelineSteps(c, id)
		pipelines = append(pipelines, fiber.Map{
			"id": id, "name": name, "description": desc,
			"fixerAgentId": fixerAgentID, "isDefault": isDefault, "isActive": isActive,
			"createdAt": createdAt, "updatedAt": updatedAt,
			"usedInProjects": usedInProjects, "steps": steps,
		})
	}
	if pipelines == nil {
		pipelines = []fiber.Map{}
	}
	return c.JSON(pipelines)
}

func (h *Handler) getPipelineSteps(c *fiber.Ctx, pipelineID string) ([]fiber.Map, error) {
	rows, err := h.db.Query(c.Context(), `
		SELECT ps.id, ps."order", ps.label,
		  a.id, a.name, a.model_provider, a.model_id
		FROM pipeline_steps ps
		JOIN agents a ON a.id = ps.agent_id
		WHERE ps.pipeline_id = $1::uuid
		ORDER BY ps."order"`, pipelineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var steps []fiber.Map
	for rows.Next() {
		var sid, agentID, agentName, mp, mi string
		var order int16
		var label *string
		if err := rows.Scan(&sid, &order, &label, &agentID, &agentName, &mp, &mi); err != nil {
			return nil, err
		}
		steps = append(steps, fiber.Map{
			"id": sid, "order": order, "label": label,
			"agent": fiber.Map{"id": agentID, "name": agentName, "modelProvider": mp, "modelId": mi},
		})
	}
	if steps == nil {
		steps = []fiber.Map{}
	}
	return steps, nil
}

type PipelineStepBody struct {
	AgentID string `json:"agentId"`
	Order   int    `json:"order"`
	Label   string `json:"label"`
}

type PipelineBody struct {
	Name         string             `json:"name"`
	Description  string             `json:"description"`
	FixerAgentID string             `json:"fixerAgentId"`
	Steps        []PipelineStepBody `json:"steps"`
}

func (h *Handler) CreatePipeline(c *fiber.Ctx) error {
	var body PipelineBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(400, err.Error())
	}
	if body.Name == "" || body.FixerAgentID == "" {
		return fiber.NewError(422, "name and fixerAgentId required")
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return fiber.NewError(500, err.Error())
	}
	defer tx.Rollback(c.Context())

	var id string
	err = tx.QueryRow(c.Context(), `
		INSERT INTO pipelines (name, description, fixer_agent_id)
		VALUES ($1,$2,$3::uuid) RETURNING id::text`,
		body.Name, body.Description, body.FixerAgentID,
	).Scan(&id)
	if err != nil {
		return fiber.NewError(500, err.Error())
	}

	for _, s := range body.Steps {
		_, err = tx.Exec(c.Context(),
			`INSERT INTO pipeline_steps (pipeline_id, agent_id, "order", label) VALUES ($1::uuid,$2::uuid,$3,$4)`,
			id, s.AgentID, s.Order, s.Label,
		)
		if err != nil {
			return fiber.NewError(500, err.Error())
		}
	}

	if err := tx.Commit(c.Context()); err != nil {
		return fiber.NewError(500, err.Error())
	}

	steps, _ := h.getPipelineSteps(c, id)
	return c.Status(201).JSON(fiber.Map{
		"id": id, "name": body.Name, "description": body.Description,
		"fixerAgentId": body.FixerAgentID, "isDefault": false, "steps": steps,
	})
}

func (h *Handler) UpdatePipeline(c *fiber.Ctx) error {
	id := c.Params("id")
	var body PipelineBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(400, err.Error())
	}

	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return fiber.NewError(500, err.Error())
	}
	defer tx.Rollback(c.Context())

	_, err = tx.Exec(c.Context(), `
		UPDATE pipelines SET name=$2,description=$3,fixer_agent_id=$4::uuid,updated_at=NOW()
		WHERE id=$1::uuid`, id, body.Name, body.Description, body.FixerAgentID)
	if err != nil {
		return fiber.NewError(500, err.Error())
	}

	_, err = tx.Exec(c.Context(), "DELETE FROM pipeline_steps WHERE pipeline_id=$1::uuid", id)
	if err != nil {
		return fiber.NewError(500, err.Error())
	}
	for _, s := range body.Steps {
		_, err = tx.Exec(c.Context(),
			`INSERT INTO pipeline_steps (pipeline_id, agent_id, "order", label) VALUES ($1::uuid,$2::uuid,$3,$4)`,
			id, s.AgentID, s.Order, s.Label)
		if err != nil {
			return fiber.NewError(500, err.Error())
		}
	}

	if err := tx.Commit(c.Context()); err != nil {
		return fiber.NewError(500, err.Error())
	}

	steps, _ := h.getPipelineSteps(c, id)
	return c.JSON(fiber.Map{"id": id, "name": body.Name, "fixerAgentId": body.FixerAgentID, "steps": steps})
}

func (h *Handler) SetDefaultPipeline(c *fiber.Ctx) error {
	id := c.Params("id")
	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return fiber.NewError(500, err.Error())
	}
	defer tx.Rollback(c.Context())

	tx.Exec(c.Context(), "UPDATE pipelines SET is_default=FALSE WHERE is_default=TRUE")
	row := tx.QueryRow(c.Context(), `UPDATE pipelines SET is_default=TRUE,updated_at=NOW() WHERE id=$1::uuid RETURNING id,name,is_default`, id)
	var rid, name string
	var isDefault bool
	if err := row.Scan(&rid, &name, &isDefault); err != nil {
		return fiber.NewError(500, err.Error())
	}
	tx.Commit(c.Context())
	return c.JSON(fiber.Map{"id": rid, "name": name, "isDefault": isDefault})
}

func (h *Handler) DeletePipeline(c *fiber.Ctx) error {
	id := c.Params("id")
	var count int64
	h.db.QueryRow(c.Context(), "SELECT COUNT(*) FROM projects WHERE pipeline_id=$1::uuid", id).Scan(&count)
	if count > 0 {
		return fiber.NewError(409, "pipeline is used by projects")
	}
	h.db.Exec(c.Context(), "DELETE FROM pipelines WHERE id=$1::uuid", id)
	return c.SendStatus(204)
}

// GetPipelineSnapshot 供建立任務時取得完整 Pipeline 快照
func (h *Handler) GetPipelineSnapshot(c *fiber.Ctx, pipelineID string) (json.RawMessage, error) {
	row := h.db.QueryRow(c.Context(), `
		SELECT p.id, p.name,
		  a.id, a.name, a.model_provider, a.model_id, a.system_prompt, a.step_prompt
		FROM pipelines p
		JOIN agents a ON a.id = p.fixer_agent_id
		WHERE p.id = $1::uuid`, pipelineID)

	var pid, pname, faid, faname, famp, fami, fasp, fastp string
	if err := row.Scan(&pid, &pname, &faid, &faname, &famp, &fami, &fasp, &fastp); err != nil {
		return nil, err
	}

	steps, err := h.getPipelineStepsForSnapshot(c, pipelineID)
	if err != nil {
		return nil, err
	}

	snapshot := map[string]interface{}{
		"id":   pid,
		"name": pname,
		"fixerAgent": map[string]interface{}{
			"id": faid, "name": faname, "modelProvider": famp,
			"modelId": fami, "systemPrompt": fasp, "stepPrompt": fastp,
		},
		"steps": steps,
	}
	return json.Marshal(snapshot)
}

func (h *Handler) getPipelineStepsForSnapshot(c *fiber.Ctx, pipelineID string) ([]map[string]interface{}, error) {
	rows, err := h.db.Query(c.Context(), `
		SELECT ps.id, ps."order", ps.label,
		  a.id, a.name, a.model_provider, a.model_id, a.system_prompt, a.step_prompt
		FROM pipeline_steps ps
		JOIN agents a ON a.id = ps.agent_id
		WHERE ps.pipeline_id = $1::uuid ORDER BY ps."order"`, pipelineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var steps []map[string]interface{}
	for rows.Next() {
		var sid, agentID, agentName, mp, mi, sp, stp string
		var order int16
		var label *string
		if err := rows.Scan(&sid, &order, &label, &agentID, &agentName, &mp, &mi, &sp, &stp); err != nil {
			return nil, err
		}
		labelStr := ""
		if label != nil {
			labelStr = *label
		}
		steps = append(steps, map[string]interface{}{
			"id": sid, "order": order, "label": labelStr,
			"agent": map[string]interface{}{
				"id": agentID, "name": agentName, "modelProvider": mp,
				"modelId": mi, "systemPrompt": sp, "stepPrompt": stp,
			},
		})
	}
	return steps, nil
}
