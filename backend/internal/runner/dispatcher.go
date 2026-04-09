package runner

import (
	"context"
	"fmt"
)

type Dispatcher struct {
	claude *ClaudeRunner
}

func NewDispatcher(claude *ClaudeRunner) *Dispatcher {
	return &Dispatcher{claude: claude}
}

func (d *Dispatcher) Run(ctx context.Context, opts RunOptions) (*RunResult, error) {
	switch opts.Agent.ModelProvider {
	case "claude", "":
		return d.claude.Run(ctx, opts)
	case "gemini":
		return nil, fmt.Errorf("gemini runner not implemented in MVP")
	default:
		return nil, fmt.Errorf("unknown model provider: %s", opts.Agent.ModelProvider)
	}
}
