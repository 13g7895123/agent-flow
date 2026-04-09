package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jarvis/agent-flow/internal/orchestrator"
)

const TaskTypeExecute = "task:execute"

type Payload struct {
	TaskID string `json:"taskId"`
}

func NewClient(redisURL string) (*asynq.Client, error) {
	opts, err := asynq.ParseRedisURI(redisURL)
	if err != nil {
		return nil, err
	}
	return asynq.NewClient(opts), nil
}

func Enqueue(client *asynq.Client, taskID uuid.UUID) error {
	payload, _ := json.Marshal(Payload{TaskID: taskID.String()})
	task := asynq.NewTask(TaskTypeExecute, payload)
	_, err := client.Enqueue(task)
	return err
}

type TaskFetcher interface {
	GetTaskForExecution(ctx context.Context, id uuid.UUID) (orchestrator.TaskRow, error)
}

func Start(redisURL string, concurrency int, fetcher TaskFetcher, orch *orchestrator.Orchestrator) error {
	opts, err := asynq.ParseRedisURI(redisURL)
	if err != nil {
		return err
	}
	srv := asynq.NewServer(opts, asynq.Config{
		Concurrency: concurrency,
		ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
			log.Printf("[worker] task failed: %v", err)
		}),
	})

	mux := asynq.NewServeMux()
	mux.HandleFunc(TaskTypeExecute, func(ctx context.Context, t *asynq.Task) error {
		var p Payload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			return fmt.Errorf("parse payload: %w", err)
		}
		taskID, err := uuid.Parse(p.TaskID)
		if err != nil {
			return fmt.Errorf("parse task id: %w", err)
		}
		taskRow, err := fetcher.GetTaskForExecution(ctx, taskID)
		if err != nil {
			return fmt.Errorf("get task: %w", err)
		}
		return orch.ExecuteTask(ctx, taskRow)
	})

	return srv.Run(mux)
}
