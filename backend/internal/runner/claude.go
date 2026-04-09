package runner

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"sync"
	"time"

	redisclient "github.com/jarvis/agent-flow/internal/redis"
)

type ClaudeRunner struct {
	timeout time.Duration
	redis   *redisclient.Client
	logFunc func(ctx context.Context, runID, taskID, content, logType string, seq int)
}

func NewClaudeRunner(timeout time.Duration, redis *redisclient.Client, logFunc func(ctx context.Context, runID, taskID, content, logType string, seq int)) *ClaudeRunner {
	return &ClaudeRunner{timeout: timeout, redis: redis, logFunc: logFunc}
}

func (r *ClaudeRunner) Run(ctx context.Context, opts RunOptions) (*RunResult, error) {
	runCtx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	args := []string{"-p", opts.Prompt, "--output-format", "text"}
	if opts.Agent.ModelID != "" {
		args = append(args, "--model", opts.Agent.ModelID)
	}

	cmd := exec.CommandContext(runCtx, "claude", args...)
	cmd.Dir = opts.ProjectPath

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start claude: %w", err)
	}

	var buf strings.Builder
	var mu sync.Mutex
	seq := 0
	runID := opts.TaskID.String() + "-" + fmt.Sprintf("%d", opts.RunIndex)
	taskIDStr := opts.TaskID.String()

	// 心跳偵測：60 秒無輸出則取消
	lastOutput := time.Now()
	heartbeat := time.AfterFunc(60*time.Second, func() {
		if time.Since(lastOutput) >= 60*time.Second {
			cancel()
		}
	})
	defer heartbeat.Stop()

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			mu.Lock()
			buf.WriteString(line + "\n")
			seq++
			currentSeq := seq
			lastOutput = time.Now()
			heartbeat.Reset(60 * time.Second)
			mu.Unlock()

			if r.logFunc != nil {
				r.logFunc(ctx, runID, taskIDStr, line, "stdout", currentSeq)
			}
			sseMsg := fmt.Sprintf("event: log\ndata: {\"type\":\"stdout\",\"content\":%q,\"sequence\":%d}\n\n", line, currentSeq)
			_ = r.redis.Publish(ctx, "task:"+taskIDStr, sseMsg)
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			mu.Lock()
			seq++
			currentSeq := seq
			mu.Unlock()
			if r.logFunc != nil {
				r.logFunc(ctx, runID, taskIDStr, line, "stderr", currentSeq)
			}
			sseMsg := fmt.Sprintf("event: log\ndata: {\"type\":\"stderr\",\"content\":%q,\"sequence\":%d}\n\n", line, currentSeq)
			_ = r.redis.Publish(ctx, "task:"+taskIDStr, sseMsg)
		}
	}()

	wg.Wait()
	err = cmd.Wait()
	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	output := buf.String()
	success := exitCode == 0 && err == nil
	if runCtx.Err() == context.DeadlineExceeded {
		success = false
		err = fmt.Errorf("claude timeout after %s", r.timeout)
	}

	return &RunResult{Output: output, ExitCode: exitCode, Success: success}, err
}
