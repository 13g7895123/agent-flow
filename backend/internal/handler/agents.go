package handler

import (
	"github.com/gofiber/fiber/v2"
)

func (h *Handler) GetAgent(c *fiber.Ctx) error {
	id := c.Params("id")
	row := h.db.QueryRow(c.Context(), `
		SELECT a.id, a.name, a.description, a.system_prompt, a.step_prompt,
		       a.model_provider, a.model_id, a.is_active, a.created_at, a.updated_at,
		       (SELECT COUNT(*) FROM pipeline_steps ps WHERE ps.agent_id = a.id) AS used_in_pipelines
		FROM agents a WHERE a.id=$1::uuid`, id)

	var aid, name, desc, sp, stp, mp, mi string
	var isActive bool
	var createdAt, updatedAt interface{}
	var usedInPipelines int64
	if err := row.Scan(&aid, &name, &desc, &sp, &stp, &mp, &mi, &isActive, &createdAt, &updatedAt, &usedInPipelines); err != nil {
		return fiber.NewError(404, "agent not found")
	}
	return c.JSON(fiber.Map{
		"id": aid, "name": name, "description": desc,
		"systemPrompt": sp, "stepPrompt": stp,
		"modelProvider": mp, "modelId": mi,
		"isActive": isActive, "createdAt": createdAt, "updatedAt": updatedAt,
		"usedInPipelines": usedInPipelines,
	})
}

func (h *Handler) ListAgents(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT a.id, a.name, a.description, a.system_prompt, a.step_prompt,
		       a.model_provider, a.model_id, a.is_active, a.created_at, a.updated_at,
		       (SELECT COUNT(*) FROM pipeline_steps ps WHERE ps.agent_id = a.id) AS used_in_pipelines
		FROM agents a ORDER BY a.created_at DESC`)
	if err != nil {
		return fiber.NewError(500, err.Error())
	}
	defer rows.Close()

	var agents []fiber.Map
	for rows.Next() {
		var (
			id, name, desc, sp, stp, mp, mi string
			isActive                         bool
			createdAt, updatedAt             interface{}
			usedInPipelines                  int64
		)
		if err := rows.Scan(&id, &name, &desc, &sp, &stp, &mp, &mi, &isActive, &createdAt, &updatedAt, &usedInPipelines); err != nil {
			return fiber.NewError(500, err.Error())
		}
		agents = append(agents, fiber.Map{
			"id": id, "name": name, "description": desc,
			"systemPrompt": sp, "stepPrompt": stp,
			"modelProvider": mp, "modelId": mi,
			"isActive": isActive, "createdAt": createdAt, "updatedAt": updatedAt,
			"usedInPipelines": usedInPipelines,
		})
	}
	if agents == nil {
		agents = []fiber.Map{}
	}
	return c.JSON(agents)
}

type AgentBody struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	SystemPrompt  string `json:"systemPrompt"`
	StepPrompt    string `json:"stepPrompt"`
	ModelProvider string `json:"modelProvider"`
	ModelID       string `json:"modelId"`
}

func (h *Handler) CreateAgent(c *fiber.Ctx) error {
	var body AgentBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(400, err.Error())
	}
	if body.Name == "" || body.SystemPrompt == "" || body.StepPrompt == "" {
		return fiber.NewError(422, "name, systemPrompt, stepPrompt required")
	}
	if body.ModelProvider == "" {
		body.ModelProvider = "claude"
	}
	if body.ModelProvider == "gemini" && body.ModelID == "" {
		return fiber.NewError(422, "modelId required for gemini")
	}

	row := h.db.QueryRow(c.Context(), `
		INSERT INTO agents (name, description, system_prompt, step_prompt, model_provider, model_id)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,description,system_prompt,step_prompt,model_provider,model_id,is_active,created_at,updated_at`,
		body.Name, body.Description, body.SystemPrompt, body.StepPrompt, body.ModelProvider, body.ModelID,
	)
	var id, name, desc, sp, stp, mp, mi string
	var isActive bool
	var createdAt, updatedAt interface{}
	if err := row.Scan(&id, &name, &desc, &sp, &stp, &mp, &mi, &isActive, &createdAt, &updatedAt); err != nil {
		return fiber.NewError(500, err.Error())
	}
	return c.Status(201).JSON(fiber.Map{
		"id": id, "name": name, "description": desc,
		"systemPrompt": sp, "stepPrompt": stp,
		"modelProvider": mp, "modelId": mi,
		"isActive": isActive, "createdAt": createdAt, "updatedAt": updatedAt,
		"usedInPipelines": 0,
	})
}

func (h *Handler) UpdateAgent(c *fiber.Ctx) error {
	id := c.Params("id")
	var body AgentBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(400, err.Error())
	}
	if body.ModelProvider == "gemini" && body.ModelID == "" {
		return fiber.NewError(422, "modelId required for gemini")
	}
	if body.ModelProvider == "" {
		body.ModelProvider = "claude"
	}

	row := h.db.QueryRow(c.Context(), `
		UPDATE agents SET name=$2,description=$3,system_prompt=$4,step_prompt=$5,
		model_provider=$6,model_id=$7,updated_at=NOW()
		WHERE id=$1::uuid
		RETURNING id,name,description,system_prompt,step_prompt,model_provider,model_id,is_active,created_at,updated_at`,
		id, body.Name, body.Description, body.SystemPrompt, body.StepPrompt, body.ModelProvider, body.ModelID,
	)
	var aid, name, desc, sp, stp, mp, mi string
	var isActive bool
	var createdAt, updatedAt interface{}
	if err := row.Scan(&aid, &name, &desc, &sp, &stp, &mp, &mi, &isActive, &createdAt, &updatedAt); err != nil {
		return fiber.NewError(500, err.Error())
	}
	return c.JSON(fiber.Map{
		"id": aid, "name": name, "description": desc,
		"systemPrompt": sp, "stepPrompt": stp,
		"modelProvider": mp, "modelId": mi,
		"isActive": isActive, "createdAt": createdAt, "updatedAt": updatedAt,
		"usedInPipelines": 0,
	})
}

func (h *Handler) ToggleAgent(c *fiber.Ctx) error {
	id := c.Params("id")
	row := h.db.QueryRow(c.Context(),
		`UPDATE agents SET is_active=NOT is_active, updated_at=NOW() WHERE id=$1::uuid
		 RETURNING id,name,description,model_provider,model_id,is_active,created_at,updated_at`, id)
	var aid, name, desc, mp, mi string
	var isActive bool
	var createdAt, updatedAt interface{}
	if err := row.Scan(&aid, &name, &desc, &mp, &mi, &isActive, &createdAt, &updatedAt); err != nil {
		return fiber.NewError(500, err.Error())
	}
	return c.JSON(fiber.Map{
		"id": aid, "name": name, "description": desc,
		"modelProvider": mp, "modelId": mi,
		"isActive": isActive, "createdAt": createdAt, "updatedAt": updatedAt,
	})
}

func (h *Handler) DeleteAgent(c *fiber.Ctx) error {
	id := c.Params("id")
	var count int64
	h.db.QueryRow(c.Context(), "SELECT COUNT(*) FROM pipeline_steps WHERE agent_id=$1::uuid", id).Scan(&count)
	if count > 0 {
		return fiber.NewError(409, "agent is used in pipelines")
	}
	_, err := h.db.Exec(c.Context(), "DELETE FROM agents WHERE id=$1::uuid", id)
	if err != nil {
		return fiber.NewError(500, err.Error())
	}
	return c.SendStatus(204)
}
