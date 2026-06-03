package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jarvis/agent-flow/internal/config"
	"github.com/jarvis/agent-flow/internal/db"
	"github.com/jarvis/agent-flow/internal/handler"
	"github.com/jarvis/agent-flow/internal/orchestrator"
	redisclient "github.com/jarvis/agent-flow/internal/redis"
	"github.com/jarvis/agent-flow/internal/runner"
	"github.com/jarvis/agent-flow/internal/seed"
	"github.com/jarvis/agent-flow/internal/worker"
)

func main() {
	ctx := context.Background()

	cfg := config.Load()

	// DB
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	// Migration
	m, err := migrate.New("file://internal/migrations", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("migrate new: %v", err)
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		log.Fatalf("migrate up: %v", err)
	}
	log.Println("[migrate] up done")

	// Redis
	rdb, err := redisclient.New(cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis connect: %v", err)
	}

	// Seed
	if cfg.RunSeed {
		if err := seed.Run(ctx, pool); err != nil {
			log.Printf("[seed] error: %v", err)
		}
	}

	// Runner
	claudeRunner := runner.NewClaudeRunner(cfg.ClaudeTimeout, rdb, nil)
	dispatcher := runner.NewDispatcher(claudeRunner)
	tester := runner.NewTester()

	// Orchestrator DB adapter
	orchDB := newOrchDBAdapter(pool)
	orch := orchestrator.New(orchDB, dispatcher, tester, rdb)

	// Asynq client
	asynqOpts, _ := asynq.ParseRedisURI(cfg.RedisURL)
	asynqClient := asynq.NewClient(asynqOpts)
	defer asynqClient.Close()

	enqueueFunc := func(taskID uuid.UUID) error {
		return worker.Enqueue(asynqClient, taskID)
	}

	// Worker（goroutine）
	taskFetcher := newTaskFetcherAdapter(pool)
	go func() {
		if err := worker.Start(cfg.RedisURL, cfg.TaskConcurrency, taskFetcher, orch); err != nil {
			log.Printf("[worker] error: %v", err)
			os.Exit(1)
		}
	}()

	// 重啟恢復：把 stuck 任務重新入佇列
	rows, err := pool.Query(ctx, `SELECT id FROM tasks WHERE status IN ('running','fixing','verifying')`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err == nil {
				pool.Exec(ctx, "UPDATE tasks SET status='pending', updated_at=NOW() WHERE id=$1", id)
				_ = worker.Enqueue(asynqClient, id)
				log.Printf("[recover] re-enqueued stuck task %s", id)
			}
		}
	}

	// Fiber
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{AllowOrigins: cfg.AllowOrigins}))

	h := handler.New(pool, rdb, enqueueFunc, orch)

	// Routes
	api := app.Group("/api")

	api.Get("/agents", h.ListAgents)
	api.Get("/agents/:id", h.GetAgent)
	api.Post("/agents", h.CreateAgent)
	api.Put("/agents/:id", h.UpdateAgent)
	api.Put("/agents/:id/toggle", h.ToggleAgent)
	api.Delete("/agents/:id", h.DeleteAgent)

	api.Get("/pipelines", h.ListPipelines)
	api.Get("/pipelines/:id", h.GetPipeline)
	api.Post("/pipelines", h.CreatePipeline)
	api.Put("/pipelines/:id", h.UpdatePipeline)
	api.Put("/pipelines/:id/default", h.SetDefaultPipeline)
	api.Delete("/pipelines/:id", h.DeletePipeline)

	api.Get("/projects", h.ListProjects)
	api.Post("/projects", h.CreateProject)
	api.Get("/projects/:id", h.GetProject)
	api.Put("/projects/:id", h.UpdateProject)
	api.Delete("/projects/:id", h.DeleteProject)

	api.Get("/projects/:projectId/tasks", h.ListTasks)
	api.Post("/projects/:projectId/tasks", h.CreateTask)
	api.Get("/tasks/:id", h.GetTask)
	api.Get("/tasks/:id/runs", h.GetTaskRuns)
	api.Put("/tasks/:id/cancel", h.CancelTask)
	api.Put("/tasks/:id/retry", h.RetryTask)
	api.Get("/tasks/:id/stream", h.StreamTask)

	log.Printf("[server] listening on :%s", cfg.Port)
	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}

// ── orchDBAdapter ────────────────────────────────────────────────────────────

type orchDBAdapter struct {
	pool *pgxpool.Pool
}

func newOrchDBAdapter(pool *pgxpool.Pool) *orchDBAdapter {
	return &orchDBAdapter{pool: pool}
}

func (a *orchDBAdapter) UpdateTaskStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := a.pool.Exec(ctx,
		"UPDATE tasks SET status=$2, updated_at=NOW() WHERE id=$1",
		id, status,
	)
	return err
}

func (a *orchDBAdapter) UpdateTaskStarted(ctx context.Context, id uuid.UUID) error {
	_, err := a.pool.Exec(ctx,
		"UPDATE tasks SET status='running', started_at=NOW(), updated_at=NOW() WHERE id=$1",
		id,
	)
	return err
}

func (a *orchDBAdapter) UpdateTaskCompleted(ctx context.Context, id uuid.UUID, status string) error {
	_, err := a.pool.Exec(ctx,
		"UPDATE tasks SET status=$2, completed_at=NOW(), updated_at=NOW() WHERE id=$1",
		id, status,
	)
	return err
}

func (a *orchDBAdapter) UpdateStepOutputs(ctx context.Context, id uuid.UUID, outputs map[string]string) error {
	b, err := json.Marshal(outputs)
	if err != nil {
		return fmt.Errorf("marshal step outputs: %w", err)
	}
	_, err = a.pool.Exec(ctx,
		"UPDATE tasks SET step_outputs=$2, updated_at=NOW() WHERE id=$1",
		id, b,
	)
	return err
}

func (a *orchDBAdapter) IncrementRetry(ctx context.Context, id uuid.UUID) error {
	_, err := a.pool.Exec(ctx,
		"UPDATE tasks SET current_retry=current_retry+1, updated_at=NOW() WHERE id=$1",
		id,
	)
	return err
}

// ── taskFetcherAdapter ───────────────────────────────────────────────────────

type taskFetcherAdapter struct {
	pool *pgxpool.Pool
}

func newTaskFetcherAdapter(pool *pgxpool.Pool) *taskFetcherAdapter {
	return &taskFetcherAdapter{pool: pool}
}

func (f *taskFetcherAdapter) GetTaskForExecution(ctx context.Context, id uuid.UUID) (orchestrator.TaskRow, error) {
	row := f.pool.QueryRow(ctx, `
		SELECT t.id, t.project_id, t.pipeline_id, t.prompt, t.status,
		       t.max_retries, t.current_retry, t.pipeline_snapshot,
		       p.path, p.test_command
		FROM tasks t
		JOIN projects p ON p.id = t.project_id
		WHERE t.id = $1`, id)

	var task orchestrator.TaskRow
	var snapRaw json.RawMessage
	err := row.Scan(
		&task.ID, &task.ProjectID, &task.PipelineID,
		&task.Prompt, &task.Status,
		&task.MaxRetries, &task.CurrentRetry,
		&snapRaw,
		&task.ProjectPath, &task.TestCommand,
	)
	if err != nil {
		return orchestrator.TaskRow{}, fmt.Errorf("get task for execution: %w", err)
	}
	task.PipelineSnapshot = snapRaw
	return task, nil
}
