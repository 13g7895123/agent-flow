package seed

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Run(ctx context.Context, pool *pgxpool.Pool) error {
	var count int
	err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM agents").Scan(&count)
	if err != nil || count > 0 {
		return err
	}

	log.Println("[seed] inserting default agents and pipeline...")

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Agent 1: 分析者
	var analyzerID string
	err = tx.QueryRow(ctx, `
		INSERT INTO agents (name, description, system_prompt, step_prompt, model_provider, model_id)
		VALUES ($1, $2, $3, $4, 'claude', '')
		RETURNING id::text`,
		"分析者",
		"分析任務需求，輸出驗收標準",
		"你是一位資深技術分析師。你的職責是分析軟體開發任務需求，產出結構化的執行計畫與可測試的驗收標準。你不撰寫程式碼，只做規劃與分析。請始終以 JSON 格式輸出，不要包含任何 JSON 以外的文字。",
		`【工作目錄】
{projectPath}

【測試指令】
{testCommand}

【使用者任務需求】
{userPrompt}

請分析上述需求，並以 JSON 格式輸出：

{
  "summary": "任務摘要",
  "subtasks": ["子任務 1", "子任務 2"],
  "acceptanceCriteria": [
    { "id": "AC-1", "description": "條件描述", "testable": true }
  ],
  "testStrategy": "驗證方式說明",
  "risks": ["風險 1"]
}`,
	).Scan(&analyzerID)
	if err != nil {
		return fmt.Errorf("insert analyzer: %w", err)
	}

	// Agent 2: 執行者
	var executorID string
	err = tx.QueryRow(ctx, `
		INSERT INTO agents (name, description, system_prompt, step_prompt, model_provider, model_id)
		VALUES ($1, $2, $3, $4, 'claude', '')
		RETURNING id::text`,
		"執行者",
		"實作程式碼，完成開發任務",
		"你是一位資深軟體工程師，負責在指定的專案目錄中完成開發任務。你撰寫高品質、可維護的程式碼，並確保符合驗收標準。執行完畢後輸出你所做的修改摘要。",
		`【工作目錄】
{projectPath}

【測試指令（執行後將以此驗收）】
{testCommand}

【任務需求】
{userPrompt}

【前序分析結果】
{previousOutput}

【驗收標準】
{acceptanceCriteria}

請依序完成任務，確保通過測試指令驗收。`,
	).Scan(&executorID)
	if err != nil {
		return fmt.Errorf("insert executor: %w", err)
	}

	// Pipeline: 標準開發流程
	var pipelineID string
	err = tx.QueryRow(ctx, `
		INSERT INTO pipelines (name, description, fixer_agent_id, is_default)
		VALUES ($1, $2, $3::uuid, TRUE)
		RETURNING id::text`,
		"標準開發流程",
		"分析需求後執行，失敗由執行者修正",
		executorID,
	).Scan(&pipelineID)
	if err != nil {
		return fmt.Errorf("insert pipeline: %w", err)
	}

	// Steps
	_, err = tx.Exec(ctx, `
		INSERT INTO pipeline_steps (pipeline_id, agent_id, "order", label)
		VALUES ($1::uuid, $2::uuid, 1, '需求分析'), ($1::uuid, $3::uuid, 2, '程式實作')`,
		pipelineID, analyzerID, executorID,
	)
	if err != nil {
		return fmt.Errorf("insert steps: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	log.Printf("[seed] done: analyzer=%s executor=%s pipeline=%s", analyzerID, executorID, pipelineID)
	return nil
}

// BuildPipelineSnapshot 建構 pipeline snapshot JSONB
func BuildPipelineSnapshot(pipelineID, pipelineName, fixerAgentID, fixerAgentName, fixerModelProvider, fixerModelID, fixerSystemPrompt, fixerStepPrompt string, steps []map[string]interface{}) (json.RawMessage, error) {
	snapshot := map[string]interface{}{
		"id":   pipelineID,
		"name": pipelineName,
		"fixerAgent": map[string]interface{}{
			"id":            fixerAgentID,
			"name":          fixerAgentName,
			"modelProvider": fixerModelProvider,
			"modelId":       fixerModelID,
			"systemPrompt":  fixerSystemPrompt,
			"stepPrompt":    fixerStepPrompt,
		},
		"steps": steps,
	}
	return json.Marshal(snapshot)
}
