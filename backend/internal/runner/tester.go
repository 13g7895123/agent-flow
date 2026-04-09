package runner

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type Tester struct{}

type TestResult struct {
	Success  bool
	Output   string
	ExitCode int
}

func NewTester() *Tester {
	return &Tester{}
}

func (t *Tester) Run(projectPath, testCommand string) (*TestResult, error) {
	if testCommand == "" {
		return &TestResult{Success: true, Output: "no test command"}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", testCommand)
	cmd.Dir = projectPath

	var out strings.Builder
	cmd.Stdout = &out
	cmd.Stderr = &out

	err := cmd.Run()
	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	output := out.String()
	success := exitCode == 0

	if ctx.Err() == context.DeadlineExceeded {
		return &TestResult{Success: false, Output: fmt.Sprintf("test timeout: %s", output)}, nil
	}

	_ = err
	return &TestResult{Success: success, Output: output, ExitCode: exitCode}, nil
}
