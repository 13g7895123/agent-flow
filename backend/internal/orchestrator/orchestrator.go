package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jarvis/agent-flow/internal/promptbuilder"
	redisclient "github.com/jarvis/agent-flow/internal/redis"
	"github.com/jarvis/agent-flow/internal/runner"
)

type PipelineSnapshot struct {
	ID         string                      `json:"id"`
	Name       string                      `json:"name"`
	FixerAgent promptbuilder.AgentSnapshot `json:"fixerAgent"`
	Steps      []StepSnapshot              `json:"steps"`
}

type StepSnapshot struct {
	ID    string                      `json:"id"`
	Order int                         `json:"order"`
	Label string                      `json:"label"`
	Agent promptbuilder.AgentSnapshot `json:"agent"`
}

type TaskRow struct {
	ID               uuid.UUID
	ProjectID        uuid.UUID
	PipelineID       uuid.UUID
	Prompt           string
	Status           string
	MaxRetries       int16
	CurrentRetry     int16
	PipelineSnapshot json.RawMessage
	ProjectPath      string
	TestCommand      string
}

type DB interface {
	UpdateTaskStatus(ctx context.Context, id uuid.UUID, status string) error
	UpdateTaskStarted(ctx context.Context, id uuid.UUID) error
	UpdateTaskCompleted(ctx context.Context, id uuid.UUID, status string) error
	UpdateStepOutputs(ctx context.Context, id uuid.UUID, outputs map[string]string) error
	IncrementRetry(ctx context.Context, id uuid.UUID) error
}

type Orchestrator struct {
	db         DB
	dispatcher *runner.Dispatcher
	tester     *runner.Tester
	redis      *redisclient.Client
	cancelMap  map[uuid.UUID]context.CancelFunc
	mu         sync.Mutex
}

func New(db DB, dispatcher *runner.Dispatcher, tester *runner.Tester, redis *redisclient.Client) *Orchestrator {
	return &Orchestrator{
		db:         db,
		dispatcher: dispatcher,
		tester:     tester,
		redis:      redis,
		cancelMap:  make(map[uuid.UUID]context.CancelFunc),
	}
}

func (o *Orchestrator) Cancel(taskID uuid.UUID) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if cancel, ok := o.cancelMap[taskID]; ok {
		cancel()
		delete(o.cancelMap, taskID)
	}
}

func (o *Orchestrator) ExecuteTask(parentCtx context.Context, task TaskRow) error {
	ctx, cancel := context.WithCancel(parentCtx)
	o.mu.Lock()
	o.cancelMap[task.ID] = cancel
	o.mu.Unlock()
	defer func() {
		cancel()
		o.mu.Lock()
		delete(o.cancelMap, task.ID)
		o.mu.Unlock()
	}()

	var snapshot PipelineSnapshot
	if err := json.Unmarshal(task.PipelineSnapshot, &snapshot); err != nil {
		return o.failTask(ctx, task.ID, fmt.Errorf("parse snapshot: %w", err))
	}

	sort.Slice(snapshot.Steps, func(i, j int) bool {
		return snapshot.Steps[i].Order < snapshot.Steps[j].Order
	})

	// Phase 1: 執行 Pipeline 步驟
	if err := o.db.UpdateTaskStarted(ctx, task.ID); err != nil {
		return err
	}

	stepOutputs := make(map[string]string)
	var prevOutput string

	for i, step := range snapshot.Steps {
		// SSE: step_start
		o.publishSSE(ctx, task.ID, "step_start", fmt.Sprintf(
			`{"stepOrder":%d,"agentName":%q,"label":%q}`, step.Order, step.Agent.Name, step.Label,
		))

		vars := promptbuilder.PromptVars{
			ProjectPath:        task.ProjectPath,
			TestCommand:        task.TestCommand,
			UserPrompt:         task.Prompt,
			PreviousOutput:     prevOutput,
			AllPreviousOutputs: promptbuilder.MustJSON(stepOutputs),
			AcceptanceCriteria: promptbuilder.ExtractAcceptanceCriteria(stepOutputs),
		}
		prompt := promptbuilder.Build(step.Agent, vars)

		stepID := uuid.MustParse(step.ID)
		result, err := o.dispatcher.Run(ctx, runner.RunOptions{
			Agent:       runner.AgentSnapshot(step.Agent),
			Prompt:      prompt,
			ProjectPath: task.ProjectPath,
			TaskID:      task.ID,
			StepID:      &stepID,
			Phase:       "step",
			RunIndex:    i + 1,
		})
		if err != nil || (result != nil && !result.Success) {
			errMsg := ""
			if err != nil {
				errMsg = err.Error()
			}
			o.publishSSE(ctx, task.ID, "step_done", fmt.Sprintf(
				`{"stepOrder":%d,"agentName":%q,"success":false,"error":%q}`, step.Order, step.Agent.Name, errMsg,
			))
			return o.failTask(ctx, task.ID, err)
		}

		stepOutputs[step.ID] = result.Output
		prevOutput = result.Output

		// SSE: step_done
		o.publishSSE(ctx, task.ID, "step_done", fmt.Sprintf(
			`{"stepOrder":%d,"agentName":%q,"success":true}`, step.Order, step.Agent.Name,
		))
	}

	if err := o.db.UpdateStepOutputs(ctx, task.ID, stepOutputs); err != nil {
		return err
	}

	// Phase 2: 驗收循環
	type errorEntry struct {
		Error  string `json:"error"`
		Output string `json:"output"`
	}
	var errorHistory []errorEntry
	var lastError string

	for retry := 0; retry <= int(task.MaxRetries); retry++ {
		if err := o.db.UpdateTaskStatus(ctx, task.ID, "verifying"); err != nil {
			return err
		}
		o.publishSSE(ctx, task.ID, "status", fmt.Sprintf(
			`{"taskId":%q,"status":"verifying","currentRetry":%d}`, task.ID, retry,
		))

		testResult, err := o.tester.Run(task.ProjectPath, task.TestCommand)
		if err != nil {
			return o.failTask(ctx, task.ID, err)
		}

		if testResult.Success {
			if err := o.db.UpdateTaskCompleted(ctx, task.ID, "done"); err != nil {
				return err
			}
			o.publishSSE(ctx, task.ID, "done", fmt.Sprintf(`{"taskId":%q,"status":"done"}`, task.ID))
			return nil
		}

		lastError = testResult.Output
		errorHistory = append(errorHistory, errorEntry{Error: lastError, Output: prevOutput})

		if retry >= int(task.MaxRetries) {
			return o.failTask(ctx, task.ID, fmt.Errorf("max retries reached"))
		}

		if err := o.db.UpdateTaskStatus(ctx, task.ID, "fixing"); err != nil {
			return err
		}
		if err := o.db.IncrementRetry(ctx, task.ID); err != nil {
			return err
		}
		o.publishSSE(ctx, task.ID, "status", fmt.Sprintf(
			`{"taskId":%q,"status":"fixing","currentRetry":%d}`, task.ID, retry+1,
		))

		fixVars := promptbuilder.PromptVars{
			ProjectPath:        task.ProjectPath,
			TestCommand:        task.TestCommand,
			UserPrompt:         task.Prompt,
			AcceptanceCriteria: promptbuilder.ExtractAcceptanceCriteria(stepOutputs),
			LastError:          lastError,
			ErrorHistory:       promptbuilder.MustJSON(errorHistory),
			PreviousOutput:     prevOutput,
			CurrentRetry:       strconv.Itoa(retry + 1),
			MaxRetries:         strconv.Itoa(int(task.MaxRetries)),
		}
		fixPrompt := promptbuilder.Build(snapshot.FixerAgent, fixVars)

		fixResult, err := o.dispatcher.Run(ctx, runner.RunOptions{
			Agent:       runner.AgentSnapshot(snapshot.FixerAgent),
			Prompt:      fixPrompt,
			ProjectPath: task.ProjectPath,
			TaskID:      task.ID,
			Phase:       "fix",
			RunIndex:    len(snapshot.Steps) + retry + 1,
		})
		if err != nil || (fixResult != nil && !fixResult.Success) {
			return o.failTask(ctx, task.ID, err)
		}
		prevOutput = fixResult.Output

		// 指數退避（上限 30s）
		backoff := time.Duration(math.Min(
			float64(time.Duration(2<<uint(retry))*time.Second),
			float64(30*time.Second),
		))
		select {
		case <-time.After(backoff):
		case <-ctx.Done():
			return o.failTask(ctx, task.ID, ctx.Err())
		}
	}
	return nil
}

func (o *Orchestrator) failTask(ctx context.Context, id uuid.UUID, err error) error {
	_ = o.db.UpdateTaskCompleted(ctx, id, "failed")
	o.publishSSE(ctx, id, "done", fmt.Sprintf(`{"taskId":%q,"status":"failed"}`, id))
	return err
}

func (o *Orchestrator) publishSSE(ctx context.Context, taskID uuid.UUID, event, data string) {
	msg := fmt.Sprintf("event: %s\ndata: %s\n\n", event, data)
	_ = o.redis.Publish(ctx, "task:"+taskID.String(), msg)
}
