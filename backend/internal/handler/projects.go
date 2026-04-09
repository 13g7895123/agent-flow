package handler

import (
	"github.com/gofiber/fiber/v2"
)

type ProjectBody struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	TestCommand string `json:"testCommand"`
	PipelineID  string `json:"pipelineId"`
	Description string `json:"description"`
}

func (h *Handler) ListProjects(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT pr.id, pr.name, pr.path, pr.test_command, pr.pipeline_id, pr.description, pr.created_at, pr.updated_at,
		  p.name AS pipeline_name
		FROM projects pr
		JOIN pipelines p ON p.id = pr.pipeline_id
		ORDER BY pr.created_at DESC`)
	if err != nil {
		return fiber.NewError(500, err.Error())
	}
	defer rows.Close()

	var projects []fiber.Map
	for rows.Next() {
		var id, name, path, testCmd, pipelineID, desc, pipelineName string
		var createdAt, updatedAt interface{}
		if err := rows.Scan(&id, &name, &path, &testCmd, &pipelineID, &desc, &createdAt, &updatedAt, &pipelineName); err != nil {
			return fiber.NewError(500, err.Error())
		}
		projects = append(projects, fiber.Map{
			"id": id, "name": name, "path": path, "testCommand": testCmd,
			"pipelineId": pipelineID, "pipelineName": pipelineName,
			"description": desc, "createdAt": createdAt, "updatedAt": updatedAt,
		})
	}
	if projects == nil {
		projects = []fiber.Map{}
	}
	return c.JSON(projects)
}

func (h *Handler) GetProject(c *fiber.Ctx) error {
	id := c.Params("id")
	row := h.db.QueryRow(c.Context(), `
		SELECT pr.id, pr.name, pr.path, pr.test_command, pr.pipeline_id, pr.description, pr.created_at, pr.updated_at,
		  p.name AS pipeline_name
		FROM projects pr JOIN pipelines p ON p.id = pr.pipeline_id
		WHERE pr.id = $1::uuid`, id)
	var rid, name, path, testCmd, pipelineID, desc, pipelineName string
	var createdAt, updatedAt interface{}
	if err := row.Scan(&rid, &name, &path, &testCmd, &pipelineID, &desc, &createdAt, &updatedAt, &pipelineName); err != nil {
		return fiber.NewError(404, "project not found")
	}
	return c.JSON(fiber.Map{
		"id": rid, "name": name, "path": path, "testCommand": testCmd,
		"pipelineId": pipelineID, "pipelineName": pipelineName,
		"description": desc, "createdAt": createdAt, "updatedAt": updatedAt,
	})
}

func (h *Handler) CreateProject(c *fiber.Ctx) error {
	var body ProjectBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(400, err.Error())
	}
	if body.Name == "" || body.Path == "" || body.PipelineID == "" {
		return fiber.NewError(422, "name, path, pipelineId required")
	}
	row := h.db.QueryRow(c.Context(), `
		INSERT INTO projects (name, path, test_command, pipeline_id, description)
		VALUES ($1,$2,$3,$4::uuid,$5)
		RETURNING id,name,path,test_command,pipeline_id,description,created_at,updated_at`,
		body.Name, body.Path, body.TestCommand, body.PipelineID, body.Description,
	)
	var id, name, path, testCmd, pipelineID, desc string
	var createdAt, updatedAt interface{}
	if err := row.Scan(&id, &name, &path, &testCmd, &pipelineID, &desc, &createdAt, &updatedAt); err != nil {
		return fiber.NewError(500, err.Error())
	}
	return c.Status(201).JSON(fiber.Map{
		"id": id, "name": name, "path": path, "testCommand": testCmd,
		"pipelineId": pipelineID, "description": desc,
		"createdAt": createdAt, "updatedAt": updatedAt,
	})
}

func (h *Handler) UpdateProject(c *fiber.Ctx) error {
	id := c.Params("id")
	var body ProjectBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(400, err.Error())
	}
	row := h.db.QueryRow(c.Context(), `
		UPDATE projects SET name=$2,path=$3,test_command=$4,pipeline_id=$5::uuid,description=$6,updated_at=NOW()
		WHERE id=$1::uuid
		RETURNING id,name,path,test_command,pipeline_id,description,created_at,updated_at`,
		id, body.Name, body.Path, body.TestCommand, body.PipelineID, body.Description,
	)
	var rid, name, path, testCmd, pipelineID, desc string
	var createdAt, updatedAt interface{}
	if err := row.Scan(&rid, &name, &path, &testCmd, &pipelineID, &desc, &createdAt, &updatedAt); err != nil {
		return fiber.NewError(500, err.Error())
	}
	return c.JSON(fiber.Map{
		"id": rid, "name": name, "path": path, "testCommand": testCmd,
		"pipelineId": pipelineID, "description": desc,
		"createdAt": createdAt, "updatedAt": updatedAt,
	})
}

func (h *Handler) DeleteProject(c *fiber.Ctx) error {
	id := c.Params("id")
	h.db.Exec(c.Context(), "DELETE FROM projects WHERE id=$1::uuid", id)
	return c.SendStatus(204)
}
