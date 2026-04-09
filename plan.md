# Agent Flow 後端 MVP 實作計畫

> 基於 DESIGN.md v2.2，專注於最小可運行版本。  
> 目標：能建立任務、透過 Claude CLI 執行 Pipeline、SSE 即時串流，完整驗收循環。

---

## MVP 範圍界定

### 包含（Must Have）
- CRUD API：Agents、Pipelines、Projects、Tasks
- Claude Runner（os/exec，僅 Claude，Gemini 列為 Phase 2）
- Pipeline Orchestrator（順序執行步驟 → 驗收循環 → 失敗重試）
- SSE 即時串流（Redis pub/sub → `/api/tasks/:id/stream`）
- Asynq 任務佇列（Worker 取任務執行）
- Seed 資料（預設 Agent + Pipeline，開箱即用）
- 系統重啟恢復（啟動時把 running/fixing/verifying 重新入佇列）

### 不包含（Phase 2）
- Gemini Runner + ShellExecutor
- Docker Compose 部署
- Prompt 變數合法性後端驗證
- 測試覆蓋

---

## 技術棧

| 層 | 技術 |
|----|------|
| 語言 | Go 1.22+ |
| HTTP | Fiber v2 |
| DB | PostgreSQL 17 + pgx/v5 + sqlc |
| Migration | golang-migrate |
| 任務佇列 | Asynq（基於 Redis） |
| Pub/Sub | Redis（go-redis/v9） |
| Claude | os/exec（呼叫 `claude` CLI） |

---

## 目錄結構

```
backend/
├── cmd/server/main.go            # 進入點：初始化 DB/Redis/Fiber/Asynq
├── internal/
│   ├── config/config.go          # 環境變數讀取（PORT, DATABASE_URL, REDIS_URL...）
│   ├── db/
│   │   ├── db.go                 # pgx 連線 pool
│   │   └── query/                # sqlc 產生的 Go 程式碼（勿手動編輯）
│   ├── migrations/               # golang-migrate SQL 檔案
│   ├── sql/                      # sqlc 查詢 SQL 原始檔
│   ├── handler/
│   │   ├── agents.go
│   │   ├── pipelines.go
│   │   ├── projects.go
│   │   ├── tasks.go
│   │   └── stream.go             # SSE endpoint
│   ├── orchestrator/
│   │   └── orchestrator.go       # 核心狀態機
│   ├── runner/
│   │   ├── interface.go          # ModelRunner interface
│   │   ├── claude.go             # ClaudeRunner（os/exec）
│   │   ├── tester.go             # 執行 testCommand 驗收
│   │   └── dispatcher.go         # 依 modelProvider 分派（MVP 只有 claude）
│   ├── promptbuilder/
│   │   └── builder.go            # {變數} 插值
│   ├── worker/
│   │   └── worker.go             # Asynq Worker
│   ├── redis/
│   │   └── client.go
│   └── seed/
│       └── seed.go               # 預設 Agent + Pipeline
├── sqlc.yaml
├── go.mod
└── Dockerfile
.env                              # 根目錄統一管理所有環境變數與對外 PORT
.env.example
docker-compose.yml
web/
```

---

## 實作步驟（Phase 1 MVP）

### Step 1 — 初始化專案骨架

```bash
mkdir -p api/cmd/server
mkdir -p api/internal/{config,db/query,migrations,sql,handler,orchestrator,runner,promptbuilder,worker,redis,seed}
cd api
go mod init github.com/jarvis/agent-flow
go get github.com/gofiber/fiber/v2
go get github.com/jackc/pgx/v5
go get github.com/hibiken/asynq
go get github.com/redis/go-redis/v9
go get github.com/golang-migrate/migrate/v4
go get github.com/sqlc-dev/sqlc
go get github.com/google/uuid
```

**產出：** go.mod、go.sum、目錄結構

---

### Step 2 — 環境變數與設定

**`internal/config/config.go`**

```go
type Config struct {
    Port               string        // 預設 "3001"
    DatabaseURL        string        // 必填
    RedisURL           string        // 必填
    RunSeed            bool          // 首次啟動 seed
    ClaudeTimeout      time.Duration // 預設 10m
    DefaultMaxRetries  int           // 預設 5
    TaskConcurrency    int           // 預設 1
}
```

用 `os.Getenv` 讀取，失敗時提供合理預設值。

**產出：** config.go

---

### Step 3 — DB Migration

建立 migration SQL 檔案（`migrations/` 目錄）：

```
001_create_enums.up.sql          # model_provider, task_status, run_phase, log_type
002_create_agents.up.sql
003_create_pipelines.up.sql
004_create_pipeline_steps.up.sql
005_create_projects.up.sql
006_create_tasks.up.sql
007_create_execution_runs.up.sql
008_create_agent_logs.up.sql
```

每個都有對應的 `.down.sql`。

Schema 完全對照 DESIGN.md §5，包含：
- `model_provider` ENUM（claude/gemini）
- `task_status` ENUM（pending/running/verifying/fixing/done/failed/cancelled）
- JSONB 欄位（tasks.pipeline_snapshot、tasks.step_outputs）
- 所有索引（`idx_tasks_project_status`、`idx_execution_runs_task`、`idx_agent_logs_run`）

在 `main.go` 啟動時自動執行 `migrate up`。

**產出：** 8 對 SQL migration 檔案

---

### Step 4 — sqlc 設定與查詢 SQL

**`sqlc.yaml`**：

```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "sql/"
    schema: "migrations/"
    gen:
      go:
        package: "db"
        out: "internal/db/query"
        sql_driver: "pgx/v5"
        emit_json_tags: true
        emit_empty_slices: true
```

**`sql/` 下的查詢檔案：**

| 檔案 | 主要查詢 |
|------|---------|
| `agents.sql` | ListAgents, GetAgent, CreateAgent, UpdateAgent, ToggleAgent, DeleteAgent, CountAgentUsageInPipelines |
| `pipelines.sql` | ListPipelines, GetPipelineWithSteps, CreatePipeline, UpdatePipeline, SetDefaultPipeline, DeletePipeline |
| `pipeline_steps.sql` | ListStepsByPipeline, UpsertSteps, DeleteStepsByPipeline |
| `projects.sql` | ListProjects, GetProject, CreateProject, UpdateProject, DeleteProject |
| `tasks.sql` | ListTasksByProject, GetTask, CreateTask, UpdateTaskStatus, UpdateStepOutputs, IncrementRetry, CancelTask, ListStuckTasks |
| `execution_runs.sql` | CreateRun, CompleteRun, ListRunsByTask |
| `agent_logs.sql` | InsertLog, ListLogsByRun |

`ListStuckTasks`：查詢 `status IN ('running', 'fixing', 'verifying')` 的任務，用於重啟恢復。

執行 `sqlc generate` 產生 `internal/db/query/*.sql.go`。

**產出：** sqlc.yaml、sql/*.sql、產生的 db/query/*.sql.go

---

### Step 5 — Redis Client

**`internal/redis/client.go`**

```go
func New(url string) *redis.Client
```

用 `go-redis/v9` 建立連線，提供 `Publish` / `Subscribe` 方法的薄封裝。

**產出：** redis/client.go

---

### Step 6 — CRUD API Handlers（Fiber）

**`main.go` 路由結構：**

```
GET  /api/agents
POST /api/agents
GET  /api/agents/:id
PUT  /api/agents/:id
PUT  /api/agents/:id/toggle
DEL  /api/agents/:id

GET  /api/pipelines
POST /api/pipelines
GET  /api/pipelines/:id
PUT  /api/pipelines/:id
PUT  /api/pipelines/:id/default
DEL  /api/pipelines/:id

GET  /api/projects
POST /api/projects
GET  /api/projects/:id
PUT  /api/projects/:id
DEL  /api/projects/:id

GET  /api/projects/:projectId/tasks
POST /api/projects/:projectId/tasks    ← 建立任務並入 Asynq 佇列
GET  /api/tasks/:id
PUT  /api/tasks/:id/cancel
PUT  /api/tasks/:id/retry
GET  /api/tasks/:id/stream             ← SSE
```

**各 Handler 的主要邏輯：**

- **Agent 刪除**：刪除前檢查 `CountAgentUsageInPipelines` > 0 則回傳 409
- **Pipeline 刪除**：刪除前檢查是否有 Project 引用，有則回傳 409
- **建立任務**：
  1. 查詢 Project（取得 pipelineId、path、testCommand）
  2. 查詢 Pipeline + Steps + Agents，序列化為 `pipelineSnapshot` JSONB
  3. INSERT task（status=pending）
  4. `asynq.Client.Enqueue("task:execute", taskId)`
- **取消任務**：UPDATE status=cancelled；若任務在執行，透過 context cancel 中斷 Claude 程序
- **重試任務**：只允許 status=failed，UPDATE status=pending + current_retry=0，重新入佇列

**Pipeline snapshot 格式（JSONB）：**

```json
{
  "id": "...",
  "name": "標準開發流程",
  "fixerAgent": { "id": "...", "name": "執行者", "modelProvider": "claude", "modelId": "", "systemPrompt": "...", "stepPrompt": "..." },
  "steps": [
    { "id": "...", "order": 1, "label": "需求分析", "agent": { ... } },
    { "id": "...", "order": 2, "label": "程式實作", "agent": { ... } }
  ]
}
```

**API 回應格式對齊前端 types/index.ts：**

| 前端欄位 | 後端來源 |
|---------|---------|
| `usedInPipelines` | `CountAgentUsageInPipelines` |
| `pipelineSnapshot` | tasks.pipeline_snapshot JSONB |
| `stepOutputs` | tasks.step_outputs JSONB |
| `currentRetry` | tasks.current_retry |
| `maxRetries` | tasks.max_retries |

**產出：** handler/{agents,pipelines,projects,tasks}.go

---

### Step 7 — Prompt Builder

**`internal/promptbuilder/builder.go`**

```go
type PromptVars struct {
    ProjectPath        string
    TestCommand        string
    UserPrompt         string
    PreviousOutput     string
    AllPreviousOutputs string // JSON
    AcceptanceCriteria string
    LastError          string
    ErrorHistory       string // JSON
    CurrentRetry       string
    MaxRetries         string
}

func Build(agent AgentSnapshot, vars PromptVars) string
// = agent.SystemPrompt + "\n\n" + strings.NewReplacer({變數}).Replace(agent.StepPrompt) + "\n\n" + context
```

所有 `{變數}` 替換使用 `strings.NewReplacer`，一次性批次替換效率最高。

**產出：** promptbuilder/builder.go

---

### Step 8 — Claude Runner

**`internal/runner/claude.go`**

核心邏輯：

```
1. context.WithTimeout(cfg.ClaudeTimeout)
2. 組裝 args：["claude", "-p", prompt]，若 modelId != "" 加上 ["--model", modelId]
3. exec.CommandContext(ctx, "claude", args...)，cmd.Dir = projectPath
4. cmd.StdoutPipe() + cmd.StderrPipe()
5. cmd.Start()
6. goroutine 讀取 stdout：
   - 每行呼叫 db.InsertLog(runId, seq, "stdout", line)
   - r.redis.Publish("task:"+taskId, sseLogEvent(line))
7. goroutine 讀取 stderr（同樣記錄，type="stderr"）
8. cmd.Wait() 等待完成
9. db.CompleteRun(runId, fullOutput, exitCode)
10. 回傳 RunResult{Output, ExitCode, Success: exitCode==0}
```

心跳偵測：若 60 秒無輸出，發送 SIGTERM。

**`internal/runner/tester.go`**

```
exec.CommandContext(ctx, "sh", "-c", testCommand)，cwd = projectPath
超時 5 分鐘
回傳 {Success: exitCode==0, Output: stdout+stderr}
```

**`internal/runner/dispatcher.go`**

MVP 階段 dispatcher 只有 Claude，Gemini case 回傳 `ErrNotImplemented`。

**產出：** runner/{interface,claude,tester,dispatcher}.go

---

### Step 9 — Orchestrator

**`internal/orchestrator/orchestrator.go`**

完整實作 DESIGN.md §8 的驗收循環邏輯：

```
ExecuteTask(ctx, task):

Phase 1 — 執行 Pipeline 步驟
  UPDATE task.status = running
  for step in snapshot.steps（依 order 排序）:
    publish SSE: step_start
    build prompt（PromptVars）
    db.CreateExecutionRun(taskId, stepId, phase=step)
    runner.Run(ctx, opts)
    若失敗 → db.UpdateTaskStatus(failed)，publish SSE: done{failed}，return
    stepOutputs[step.id] = result.Output
    prevOutput = result.Output
    publish SSE: step_done
  db.UpdateStepOutputs(taskId, stepOutputs)

Phase 2 — 驗收循環
  for retry = 0; retry <= maxRetries; retry++:
    UPDATE task.status = verifying
    publish SSE: status{verifying}
    tester.Run(projectPath, testCommand)
    若 success:
      UPDATE task.status = done
      publish SSE: done{done}
      return

    若 retry >= maxRetries:
      UPDATE task.status = failed
      publish SSE: done{failed}
      return

    UPDATE task.status = fixing
    db.IncrementRetry(taskId)
    publish SSE: status{fixing}
    build fixPrompt（含 lastError, errorHistory）
    db.CreateExecutionRun(taskId, phase=fix)
    runner.Run(ctx, fixOpts)
    若失敗 → fail + return
    prevOutput = fixResult.Output
    指數退避（2^retry 秒，上限 30s）
```

Orchestrator 透過注入的 `cancelMap`（`map[uuid.UUID]context.CancelFunc`）支援任務取消，取消時終止子程序。

**產出：** orchestrator/orchestrator.go

---

### Step 10 — Asynq Worker

**`internal/worker/worker.go`**

```go
// task type = "task:execute"
// payload = { "taskId": "uuid" }

func Start(cfg Config, db *db.Queries, orchestrator *Orchestrator):
    srv := asynq.NewServer(RedisOpt, asynq.Config{Concurrency: cfg.TaskConcurrency})
    mux := asynq.NewServeMux()
    mux.HandleFunc("task:execute", func(ctx, task):
        taskId := parsePayload(task)
        taskRow := db.GetTask(taskId)
        orchestrator.ExecuteTask(ctx, taskRow)
    )
    srv.Run(mux)
```

**產出：** worker/worker.go

---

### Step 11 — SSE Stream Handler

**`internal/handler/stream.go`**

```go
// GET /api/tasks/:id/stream
func (h *Handler) StreamTask(c *fiber.Ctx):
    taskId := c.Params("id")
    c.Set("Content-Type", "text/event-stream")
    c.Set("Cache-Control", "no-cache")
    c.Set("Connection", "keep-alive")

    pubsub := h.redis.Subscribe(ctx, "task:"+taskId)
    defer pubsub.Close()

    // 先送任務當前狀態（for 斷線重連）
    task := db.GetTask(taskId)
    c.Write(sseStatus(task))

    c.Context().SetBodyStreamWriter(func(w *bufio.Writer):
        ch := pubsub.Channel()
        for:
            select:
                case msg := <-ch:
                    w.WriteString(msg.Payload)
                    w.Flush()
                case <-clientDisconnect:
                    return
    )
```

**SSE 事件格式**對齊前端 `useTaskStream.ts`：

```
event: log
data: {"type":"stdout","content":"...","sequence":1}

event: step_start
data: {"stepOrder":1,"agentName":"分析者","label":"需求分析"}

event: step_done
data: {"stepOrder":1,"agentName":"分析者","success":true}

event: status
data: {"taskId":"...","status":"verifying","currentRetry":0}

event: done
data: {"taskId":"...","status":"done"}
```

**產出：** handler/stream.go

---

### Step 12 — Seed 資料

**`internal/seed/seed.go`**

啟動時若 `agents` 表為空，自動插入：

**Agent 1：分析者**
- modelProvider: claude, modelId: ""
- systemPrompt: 資深技術分析師角色，輸出嚴格 JSON
- stepPrompt: 含 {projectPath}, {testCommand}, {userPrompt}，要求輸出 acceptanceCriteria JSON

**Agent 2：執行者**
- modelProvider: claude, modelId: ""
- systemPrompt: 資深軟體工程師角色
- stepPrompt: 含 {projectPath}, {userPrompt}, {previousOutput}, {acceptanceCriteria}

**Pipeline：標準開發流程**
- steps: [分析者(order=1), 執行者(order=2)]
- fixerAgentId: 執行者
- isDefault: true

**產出：** seed/seed.go

---

### Step 13 — main.go 整合

**`cmd/server/main.go`**

```
1. config.Load()
2. db.Connect(cfg.DatabaseURL)
3. 執行 migrate up（自動 migration）
4. seed.Run(db)（if cfg.RunSeed && agents table empty）
5. redis.New(cfg.RedisURL)
6. runner := runner.NewDispatcher(cfg, db, redisClient)
7. orchestrator := orchestrator.New(db, runner, redisClient)
8. worker.Start(cfg, db, orchestrator)（goroutine）
9. 重啟恢復：db.ListStuckTasks() → 重新入 Asynq 佇列
10. app := fiber.New()
11. 設定 CORS（允許前端 localhost:3000）
12. 掛載所有 handler 路由
13. app.Listen(":"+cfg.Port)
```

**產出：** cmd/server/main.go

---

### Step 14 — 環境變數與 Docker Compose 部署 ✅

根目錄 `.env`（所有對外 PORT 由此統一控管）：

```bash
# 對外 PORT
BACKEND_PORT=9102
WEB_PORT=9202
POSTGRES_PORT=9302
REDIS_PORT=9402

# 後端設定
PORT=9102
DATABASE_URL=postgres://agent_flow:secret@localhost:9302/agent_flow?sslmode=disable
REDIS_URL=redis://localhost:9402
RUN_SEED=true
CLAUDE_TIMEOUT=10m
CLAUDE_DEFAULT_MAX_RETRIES=5
TASK_CONCURRENCY=1
ALLOW_ORIGINS=http://localhost:9202,http://localhost:5173

# 前端設定
VITE_API_URL=http://localhost:9102

# PostgreSQL
POSTGRES_DB=agent_flow
POSTGRES_USER=agent_flow
POSTGRES_PASSWORD=secret
```

啟動方式：
```bash
docker compose up --build -d
```

`docker compose` 會在 container 內執行 `go mod download && go mod tidy`，不需要本機有 Go 環境。

本地開發前置條件：
1. `claude` CLI 已安裝並登入（掛載 `~/.claude` 進 container）
2. Docker + Docker Compose

---

## 實作順序建議

```
Step 1  ──► Step 2  ──► Step 3（migration）──► Step 4（sqlc generate）
                                                        │
                                                        ▼
Step 12 ◄── Step 13 ◄── Step 10 ◄── Step 9 ◄── Step 5（redis）
  │                       │            │
  ▼                       ▼            ▼
seed                   worker     orchestrator
                                       ▲
                              Step 7 ──┘ Step 8
                              (runner)   (claude)
                                         │
Step 11 ──► Step 6（handler）────────────┘
(SSE)
```

每個 Step 完成後應能獨立編譯（`go build ./...`），確保不阻塞後續步驟。

---

## 關鍵邊界設計

| 情境 | 處理方式 |
|------|---------|
| 取消執行中任務 | context.CancelFunc 存在 cancelMap，取消後 Claude 子程序收到 SIGTERM |
| 系統重啟後任務恢復 | 啟動時掃描 stuck tasks（running/fixing/verifying）→ 重新入佇列 |
| Claude CLI 假死 | 60 秒無輸出 → 心跳 goroutine 觸發 cancel context |
| Pipeline 快照隔離 | 任務建立時序列化完整 Pipeline + Agent 資料，執行時只讀快照 |
| 步驟執行失敗 | 立即進入 failed，不進入驗收循環 |
| CORS | Fiber CORS middleware 允許 `localhost:3000`，生產環境透過環境變數設定 |

---

## Phase 2（MVP 後）

1. **Gemini Runner + ShellExecutor**：實作 `runner/gemini.go`，解析 bash/diff 區塊，由 ShellExecutor 執行
2. **Prompt 變數驗證**：Handler 層驗證 stepPrompt 中的 `{變數}` 是否在允許清單
3. **單元測試**：promptbuilder、orchestrator 狀態機、runner mock 測試
4. **速率限制**：Asynq concurrency 設定 + per-provider 限速器

---

*Plan 版本：1.1*  
*對應 DESIGN.md v2.2*  
*更新：Docker Compose 部署完成、PORT 統一由根目錄 `.env` 控管、目錄結構修正為 `backend/`*
