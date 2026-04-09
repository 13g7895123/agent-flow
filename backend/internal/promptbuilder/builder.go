package promptbuilder

import (
	"encoding/json"
	"strings"
)

type AgentSnapshot struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ModelProvider string `json:"modelProvider"`
	ModelID       string `json:"modelId"`
	SystemPrompt  string `json:"systemPrompt"`
	StepPrompt    string `json:"stepPrompt"`
}

type PromptVars struct {
	ProjectPath        string
	TestCommand        string
	UserPrompt         string
	PreviousOutput     string
	AllPreviousOutputs string
	AcceptanceCriteria string
	LastError          string
	ErrorHistory       string
	CurrentRetry       string
	MaxRetries         string
}

func Build(agent AgentSnapshot, vars PromptVars) string {
	replacer := strings.NewReplacer(
		"{projectPath}", vars.ProjectPath,
		"{testCommand}", vars.TestCommand,
		"{userPrompt}", vars.UserPrompt,
		"{previousOutput}", vars.PreviousOutput,
		"{allPreviousOutputs}", vars.AllPreviousOutputs,
		"{acceptanceCriteria}", vars.AcceptanceCriteria,
		"{lastError}", vars.LastError,
		"{errorHistory}", vars.ErrorHistory,
		"{currentRetry}", vars.CurrentRetry,
		"{maxRetries}", vars.MaxRetries,
	)

	stepPrompt := replacer.Replace(agent.StepPrompt)

	var parts []string
	if agent.SystemPrompt != "" {
		parts = append(parts, agent.SystemPrompt)
	}
	parts = append(parts, stepPrompt)
	return strings.Join(parts, "\n\n")
}

func ExtractAcceptanceCriteria(stepOutputs map[string]string) string {
	// 嘗試從所有步驟輸出中找第一個含 acceptanceCriteria 的 JSON
	for _, output := range stepOutputs {
		var m map[string]interface{}
		if err := json.Unmarshal([]byte(output), &m); err == nil {
			if ac, ok := m["acceptanceCriteria"]; ok {
				b, _ := json.Marshal(ac)
				return string(b)
			}
		}
	}
	return ""
}

func MustJSON(v interface{}) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}
