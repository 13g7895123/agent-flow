package runner

import (
	"context"

	"github.com/google/uuid"
)

type AgentSnapshot struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ModelProvider string `json:"modelProvider"`
	ModelID       string `json:"modelId"`
	SystemPrompt  string `json:"systemPrompt"`
	StepPrompt    string `json:"stepPrompt"`
}

type RunOptions struct {
	Agent       AgentSnapshot
	Prompt      string
	ProjectPath string
	TaskID      uuid.UUID
	StepID      *uuid.UUID
	Phase       string // "step" | "verification" | "fix"
	RunIndex    int
}

type RunResult struct {
	Output   string
	Success  bool
	ExitCode int
}

type ModelRunner interface {
	Run(ctx context.Context, opts RunOptions) (*RunResult, error)
}
