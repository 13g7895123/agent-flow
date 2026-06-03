# Agent Flow 前端待辦與 Rust 後端重寫規劃

> 盤點日期：2026-06-03  
> 目前狀態：前端已有專案、任務看板、Agent 管理、Pipeline 編輯器；後端目前是 Go + Fiber MVP。  
> 新方向：後端改用 Rust 開發，保留 PostgreSQL、Redis、Asynq 類任務佇列語意、SSE、Claude CLI 執行流程。

---

## 1. 目前已完成的項目

### 前端已完成

- 專案列表頁：可建立、編輯、刪除專案。
- 專案任務頁：可新增任務、用 Kanban 欄位顯示不同任務狀態。
- 任務卡片：可取消執行中任務、重試失敗任務。
- 任務詳情 Modal：顯示任務提示詞、Pipeline 快照、步驟輸出。
- SSE 即時日誌 Hook：可連線 `/api/tasks/:id/stream` 接收日誌、狀態、完成事件。
- Agent 管理頁：可新增、編輯、停用、刪除 Agent。
- Pipeline 管理頁：可新增、編輯、刪除 Pipeline，可拖曳步驟排序。
- 基礎 UI 元件：Button、Input、Textarea、Select、Modal、ConfirmDialog、Badge、EmptyState、Layout、Sidebar。

### 後端已完成

- Go/Fiber API MVP。
- PostgreSQL migrations。
- Agents、Pipelines、Projects、Tasks CRUD 的主要路由。
- Claude Runner。
- Pipeline Orchestrator。
- Redis Pub/Sub SSE。
- Asynq Worker。
- Seed 資料。
- 重啟時把 running/fixing/verifying 任務重排佇列。

---

## 2. 前端未完成項目總表

### F-001 API 對接缺口

目標：讓前端呼叫的 API 與後端實際路由完全一致。

目前問題：

- 前端有 `agentsApi.get(id)`，但後端 `main.go` 沒註冊 `GET /api/agents/:id`。
- 前端有 `pipelinesApi.get(id)`，但後端 `main.go` 沒註冊 `GET /api/pipelines/:id`。
- 前端有 `tasksApi.runs(id)`，但後端沒有 `GET /api/tasks/:id/runs`。
- 前端 `request()` 讀錯誤時只看 `err.message`，但 Go 後端錯誤格式目前是 `{ "error": "..." }`。

應完成物件：

- `ApiClient`：統一處理 `message`、`error`、HTTP status。
- `AgentDetailEndpoint`：取得單一 Agent。
- `PipelineDetailEndpoint`：取得單一 Pipeline。
- `TaskRunsEndpoint`：取得任務 execution runs。
- `FrontendQueryKeys`：統一 query key 命名，避免 invalidate 範圍太大或太小。

完成標準：

- 所有 `web/src/lib/api.ts` 的方法都能打到存在的後端路由。
- 後端回 4xx/5xx 時，前端顯示看得懂的錯誤文字。
- `bun run build` 通過。

### F-002 任務詳情頁獨立化

目標：把目前 Modal 型任務詳情升級成可分享、可重新整理的頁面。

目前問題：

- 任務詳情只存在 `TaskDetailModal`，重新整理後無法保留。
- `useTask(id)` 已寫好，但頁面沒有使用。
- 任務執行歷史 `ExecutionRun` 型別存在，但 UI 沒完整呈現。

應完成物件：

- `TaskDetailPage`：路由 `/tasks/:id`。
- `TaskHeader`：顯示狀態、重試次數、建立/開始/完成時間。
- `TaskPromptPanel`：顯示原始提示詞。
- `PipelineSnapshotPanel`：顯示任務建立當下的 Pipeline 快照。
- `StepOutputPanel`：顯示每個步驟輸出。
- `ExecutionRunsPanel`：顯示每次 step/fix/verification 執行紀錄。
- `LiveLogPanel`：執行中時自動連 SSE，結束後顯示歷史 logs。

完成標準：

- 點任務卡片可進入 `/tasks/:id`。
- 直接開 `/tasks/:id` 可看到資料。
- 執行中任務有 live log。
- 已完成任務可看歷史 run 與 log。

### F-003 任務看板資料即時刷新

目標：任務狀態變化時，Kanban 欄位自動更新，不需要人工重新整理。

目前問題：

- SSE 在 `done` 時 invalidate `['tasks']`，可刷新但粒度粗。
- `status` 事件只 invalidate `['tasks', 'detail', taskId]`，看板列表不一定即時移欄。
- 一張任務卡片建立一條 SSE，任務多時會開很多連線。

應完成物件：

- `TaskListRealtimeController`：管理專案內 active tasks 的即時更新。
- `TaskStatusPatch`：收到 SSE status 後直接更新 React Query cache。
- `ProjectTaskStreamStrategy`：決定每個 active task 一條 SSE，或改成 project-level stream。

完成標準：

- 任務從 pending 到 running 到 verifying 到 done 時，欄位自動移動。
- 同時多個 active tasks 時，不會造成瀏覽器大量 EventSource 失控。
- 斷線時 UI 顯示「已斷線，正在等待重連」或提供重新連線。

### F-004 表單錯誤與驗證

目標：讓使用者在送出前就知道資料哪裡錯，送出後能看懂後端錯誤。

目前問題：

- Project path 只檢查非空，沒有檢查是否像絕對路徑。
- Test command 沒有危險提示。
- Pipeline steps 可選同一個 Agent 多次，目前沒有提醒。
- 刪除 Project/Pipeline 的錯誤只靠 mutation error，UI 沒統一呈現。

應完成物件：

- `FormErrorSummary`：表單頂部錯誤總覽。
- `ApiErrorAlert`：mutation 失敗時顯示後端錯誤。
- `ProjectPathValidator`：檢查必填、絕對路徑格式，後端再做真實存在檢查。
- `CommandSafetyHint`：測試指令風險提示。
- `PipelineStepValidator`：檢查空步驟、停用 Agent、重複 Agent 是否允許。

完成標準：

- 使用者不用打開 console 也知道錯誤。
- 422、409、500 都有清楚 UI 訊息。
- 前端驗證與後端驗證規則一致。

### F-005 全域設定頁

目標：把系統設定做成可視化頁面。

目前缺少：

- Claude timeout 設定顯示。
- 預設最大重試次數設定。
- 任務併發數顯示。
- Redis / DB / Claude CLI 健康檢查。
- Gemini API key 是否已設定。

應完成物件：

- `SettingsPage`：路由 `/admin/settings`。
- `HealthCheckCard`：顯示 backend/db/redis/claude/gemini 狀態。
- `RuntimeConfigCard`：顯示目前環境設定。
- `ProviderConfigCard`：顯示 Claude/Gemini provider 可用性。

完成標準：

- Sidebar 出現「設定」。
- 使用者可以看出系統是否準備好執行任務。
- 不顯示 secret 原文，只顯示是否設定。

### F-006 Agent Prompt 編輯體驗

目標：讓 Agent Prompt 更安全、更容易編輯。

目前問題：

- 只有簡單 textarea。
- 變數插入只加在字尾，不會插入游標位置。
- 沒有 preview。
- 沒有檢查未知變數。

應完成物件：

- `PromptEditor`：支援游標位置插入變數。
- `PromptVariablePalette`：列出可用變數和中文說明。
- `PromptPreview`：用範例資料渲染 prompt。
- `UnknownVariableWarning`：提示 `{abc}` 這類不存在的變數。

完成標準：

- 點變數會插到游標位置。
- 儲存前可預覽 prompt。
- 未知變數會被標示出來。

### F-007 Pipeline 編輯器強化

目標：讓 Pipeline 不只是表單，而是可理解流程的編輯器。

目前問題：

- 已有拖曳排序，但缺少視覺化流程圖。
- 不能複製 Pipeline。
- 不能停用 Pipeline。
- 刪除 Pipeline 時只跳確認，沒有清楚列出被哪些 Project 使用。

應完成物件：

- `PipelineFlowPreview`：用節點與箭頭預覽流程。
- `DuplicatePipelineAction`：複製現有 Pipeline。
- `PipelineUsageDialog`：刪除前列出使用中的 Projects。
- `PipelineActiveToggle`：停用/啟用 Pipeline。

完成標準：

- 編輯時能看出 Agent 執行順序。
- 已被專案使用的 Pipeline 不能誤刪，且原因清楚。
- 可快速複製一條 Pipeline 再修改。

### F-008 歷史日誌與輸出瀏覽

目標：任務完成後仍能查完整 stdout/stderr 與每次 run。

目前問題：

- `TaskLogViewer` 只顯示 live log state，重新整理就消失。
- `AgentLog` 型別存在，但沒有 API 和 UI 使用。
- 長輸出沒有搜尋、下載、複製。

應完成物件：

- `AgentLogsApi`：`GET /api/runs/:runId/logs`。
- `LogViewer`：支援 stdout/stderr 分色、搜尋、複製、下載。
- `RunTimeline`：每次 step/fix/verification 的時間線。
- `OutputDiffPanel`：Phase 2 可加入，顯示修正前後差異。

完成標準：

- 任務完成後重新整理仍可看 logs。
- 可搜尋錯誤關鍵字。
- 可下載單次 run 的完整 log。

### F-009 可用性與無障礙

目標：讓使用者操作穩定、鍵盤可用、畫面狀態清楚。

目前問題：

- Kanban 橫向捲動在手機上可用，但資訊密度高。
- Modal 表單沒有完整 focus management 驗證。
- DnD 對鍵盤使用者支援不足。
- loading skeleton 不完整。

應完成物件：

- `MobileTaskList`：手機改用分段 tabs，而不是六欄橫向看板。
- `SkeletonCard`：列表 loading 骨架。
- `AccessibleDndInstructions`：Pipeline 拖曳的鍵盤說明。
- `ToastProvider`：成功/失敗提示。

完成標準：

- 手機可以順暢建立與查看任務。
- 鍵盤能操作主要功能。
- 每個 mutation 成功/失敗都有明確回饋。

### F-010 測試

目標：避免重構 Rust 後端時前端壞掉。

目前問題：

- 沒有前端測試。
- 沒有 API contract 測試。
- 沒有 Playwright E2E。

應完成物件：

- `VitestSetup`：單元測試。
- `ComponentTests`：表單、Badge、LogViewer、PromptEditor。
- `MSWHandlers`：mock API。
- `PlaywrightE2E`：建立 Agent、Pipeline、Project、Task 的完整流程。
- `OpenApiContractCheck`：前後端 API schema 對齊。

完成標準：

- PR 必跑 `bun run lint`、`bun run build`、`bun test`。
- E2E 至少覆蓋一條成功路徑和一條錯誤路徑。

---

## 3. Rust 後端物件拆分

### R-001 AppState

用途：所有 handler 共用的狀態。

欄位：

- `db: PgPool`：PostgreSQL pool。
- `redis: RedisClient`：Redis pub/sub 和 queue 使用。
- `queue: TaskQueue`：任務入佇列。
- `orchestrator: Arc<Orchestrator>`：執行任務用。
- `config: Arc<Config>`：環境設定。

檔案：

- `backend-rust/src/app_state.rs`

### R-002 Config

用途：讀取環境變數並提供預設值。

欄位：

- `port: u16`
- `database_url: String`
- `redis_url: String`
- `run_seed: bool`
- `claude_timeout_secs: u64`
- `default_max_retries: i16`
- `task_concurrency: usize`
- `allow_origins: Vec<String>`
- `gemini_api_key: Option<String>`

檔案：

- `backend-rust/src/config.rs`

### R-003 Domain Models

用途：定義資料物件，讓 API、DB、Orchestrator 共用。

物件：

- `Agent`
- `Pipeline`
- `PipelineStep`
- `Project`
- `Task`
- `ExecutionRun`
- `AgentLog`
- `PipelineSnapshot`
- `AgentSnapshot`
- `StepSnapshot`
- `TaskStatus`
- `ModelProvider`
- `RunPhase`
- `LogType`

檔案：

- `backend-rust/src/domain/agent.rs`
- `backend-rust/src/domain/pipeline.rs`
- `backend-rust/src/domain/project.rs`
- `backend-rust/src/domain/task.rs`
- `backend-rust/src/domain/run.rs`
- `backend-rust/src/domain/log.rs`
- `backend-rust/src/domain/snapshot.rs`
- `backend-rust/src/domain/mod.rs`

### R-004 API DTOs

用途：定義 request/response JSON，不讓 DB row 直接外露。

物件：

- `CreateAgentRequest`
- `UpdateAgentRequest`
- `AgentResponse`
- `CreatePipelineRequest`
- `UpdatePipelineRequest`
- `PipelineResponse`
- `CreateProjectRequest`
- `UpdateProjectRequest`
- `ProjectResponse`
- `CreateTaskRequest`
- `TaskResponse`
- `ExecutionRunResponse`
- `ApiErrorResponse`

檔案：

- `backend-rust/src/api/dto.rs`

### R-005 Repositories

用途：集中所有 SQL 操作。

物件：

- `AgentRepo`
- `PipelineRepo`
- `ProjectRepo`
- `TaskRepo`
- `ExecutionRunRepo`
- `AgentLogRepo`

檔案：

- `backend-rust/src/repo/agents.rs`
- `backend-rust/src/repo/pipelines.rs`
- `backend-rust/src/repo/projects.rs`
- `backend-rust/src/repo/tasks.rs`
- `backend-rust/src/repo/runs.rs`
- `backend-rust/src/repo/logs.rs`
- `backend-rust/src/repo/mod.rs`

建議工具：

- `sqlx`：編譯期檢查 SQL，適合 Rust。
- `uuid`：UUID。
- `chrono`：時間。
- `serde_json`：JSONB。

### R-006 API Handlers

用途：HTTP 路由處理。

Handler：

- `agents::list`
- `agents::get`
- `agents::create`
- `agents::update`
- `agents::toggle`
- `agents::delete`
- `pipelines::list`
- `pipelines::get`
- `pipelines::create`
- `pipelines::update`
- `pipelines::set_default`
- `pipelines::delete`
- `projects::list`
- `projects::get`
- `projects::create`
- `projects::update`
- `projects::delete`
- `tasks::list_by_project`
- `tasks::get`
- `tasks::create`
- `tasks::cancel`
- `tasks::retry`
- `tasks::runs`
- `runs::logs`
- `stream::task_stream`
- `health::health`
- `health::runtime_config`

檔案：

- `backend-rust/src/api/routes.rs`
- `backend-rust/src/api/handlers/agents.rs`
- `backend-rust/src/api/handlers/pipelines.rs`
- `backend-rust/src/api/handlers/projects.rs`
- `backend-rust/src/api/handlers/tasks.rs`
- `backend-rust/src/api/handlers/runs.rs`
- `backend-rust/src/api/handlers/stream.rs`
- `backend-rust/src/api/handlers/health.rs`

### R-007 TaskQueue

用途：取代 Go Asynq 的入佇列與 worker。

可選方案：

- 方案 A：用 `apalis` + Redis，較接近現成任務佇列。
- 方案 B：自己用 Redis list + consumer loop，較可控但要自己處理 retry 與 ack。
- 建議：第一版用方案 B，因為任務模型簡單，且可完全掌握取消與重啟恢復。

物件：

- `TaskQueue`
- `TaskPayload`
- `TaskWorker`
- `WorkerHandle`

檔案：

- `backend-rust/src/queue/task_queue.rs`
- `backend-rust/src/queue/worker.rs`
- `backend-rust/src/queue/mod.rs`

### R-008 Runner

用途：執行 Claude CLI，未來支援 Gemini。

Trait：

```rust
#[async_trait]
pub trait ModelRunner {
    async fn run(&self, options: RunOptions) -> anyhow::Result<RunResult>;
}
```

物件：

- `RunOptions`
- `RunResult`
- `ClaudeRunner`
- `GeminiRunner`
- `RunnerDispatcher`
- `CommandTester`

檔案：

- `backend-rust/src/runner/mod.rs`
- `backend-rust/src/runner/claude.rs`
- `backend-rust/src/runner/gemini.rs`
- `backend-rust/src/runner/dispatcher.rs`
- `backend-rust/src/runner/tester.rs`

### R-009 Orchestrator

用途：核心狀態機。

責任：

- 讀 pipeline snapshot。
- 依序執行 steps。
- 寫入 execution runs。
- 寫入 agent logs。
- 發 SSE 事件。
- 執行 test command。
- 驗收失敗時呼叫 fixer agent。
- 超過 retry 後標記 failed。
- 接到 cancel 時停止子程序並標記 cancelled。

物件：

- `Orchestrator`
- `TaskExecutionContext`
- `CancellationRegistry`
- `StepExecutor`
- `VerificationLoop`
- `SsePublisher`

檔案：

- `backend-rust/src/orchestrator/mod.rs`
- `backend-rust/src/orchestrator/state_machine.rs`
- `backend-rust/src/orchestrator/cancellation.rs`
- `backend-rust/src/orchestrator/sse.rs`

### R-010 Prompt Builder

用途：把 Agent prompt template 裡的變數換成實際值。

物件：

- `PromptVars`
- `PromptBuilder`
- `PromptVariable`
- `UnknownVariable`

檔案：

- `backend-rust/src/prompt/builder.rs`
- `backend-rust/src/prompt/variables.rs`
- `backend-rust/src/prompt/mod.rs`

### R-011 Migrations

用途：沿用目前 PostgreSQL schema，讓前端和既有資料最小變動。

檔案：

- `backend-rust/migrations/*.sql`

建議：

- 第一版直接複製 `backend/internal/migrations/*.sql`。
- 後續如果要修 schema，再新增新的 migration，不要改舊 migration。

### R-012 Error Handling

用途：統一錯誤格式，讓前端好處理。

物件：

- `ApiError`
- `ApiResult<T>`
- `ErrorCode`

回傳格式：

```json
{
  "message": "pipeline is used by projects",
  "code": "PIPELINE_IN_USE"
}
```

檔案：

- `backend-rust/src/error.rs`

---

## 4. Phase 規劃與超詳細執行步驟

### Phase 0：保護現況與建立基準

目標：先確定現在能跑，之後 Rust 重寫才知道有沒有退步。

步驟：

1. 在專案根目錄執行：

   ```bash
   git status --short --branch
   ```

2. 確認畫面只顯示目前分支，不要有未提交變更。如果有變更，先決定要 commit 還是 stash。

3. 啟動資料庫與 Redis：

   ```bash
   docker compose up -d postgres redis
   ```

4. 等待健康檢查：

   ```bash
   docker compose ps
   ```

5. 進入前端資料夾：

   ```bash
   cd web
   ```

6. 安裝前端套件：

   ```bash
   bun install
   ```

7. 跑前端 build：

   ```bash
   bun run build
   ```

8. 回到根目錄：

   ```bash
   cd ..
   ```

9. 進入 Go 後端：

   ```bash
   cd backend
   ```

10. 跑 Go 測試：

    ```bash
    go test ./...
    ```

11. 回到根目錄：

    ```bash
    cd ..
    ```

完成標準：

- 前端 build 通過。
- Go test 通過。
- 你知道目前版本的基準狀態。

### Phase 1：補齊前端與現有 Go 後端 API 缺口

目標：在 Rust 重寫前，先把前端 API contract 定清楚。

步驟：

1. 開啟 `web/src/lib/api.ts`。

2. 逐一列出前端會呼叫的 API：

   ```text
   GET    /api/agents
   GET    /api/agents/:id
   POST   /api/agents
   PUT    /api/agents/:id
   PUT    /api/agents/:id/toggle
   DELETE /api/agents/:id
   GET    /api/pipelines
   GET    /api/pipelines/:id
   POST   /api/pipelines
   PUT    /api/pipelines/:id
   PUT    /api/pipelines/:id/default
   DELETE /api/pipelines/:id
   GET    /api/projects
   GET    /api/projects/:id
   POST   /api/projects
   PUT    /api/projects/:id
   DELETE /api/projects/:id
   GET    /api/projects/:projectId/tasks
   POST   /api/projects/:projectId/tasks
   GET    /api/tasks/:id
   PUT    /api/tasks/:id/cancel
   PUT    /api/tasks/:id/retry
   GET    /api/tasks/:id/runs
   GET    /api/tasks/:id/stream
   ```

3. 開啟 `backend/cmd/server/main.go`。

4. 比對上面清單，把缺少的路由補上。

5. 開啟對應 handler 檔案，缺少 handler 就新增。

6. 修改錯誤回傳格式，統一回：

   ```json
   { "message": "錯誤原因", "code": "ERROR_CODE" }
   ```

7. 修改 `web/src/lib/api.ts` 的 `request()`，讓它同時支援 `message` 和 `error`：

   ```ts
   throw new Error(err.message ?? err.error ?? 'Request failed')
   ```

8. 跑：

   ```bash
   cd web
   bun run build
   cd ../backend
   go test ./...
   cd ..
   ```

完成標準：

- 前端所有已存在 API 都有後端路由。
- 錯誤訊息可以正確顯示。

### Phase 2：建立 Rust 後端骨架

目標：建立可啟動、可連 DB、可回 health check 的 Rust backend。

步驟：

1. 在根目錄建立 Rust 專案：

   ```bash
   cargo new backend-rust
   ```

2. 進入 Rust 專案：

   ```bash
   cd backend-rust
   ```

3. 編輯 `Cargo.toml`，加入依賴：

   ```toml
   [dependencies]
   anyhow = "1"
   async-trait = "0.1"
   axum = "0.7"
   chrono = { version = "0.4", features = ["serde"] }
   dotenvy = "0.15"
   futures = "0.3"
   redis = { version = "0.25", features = ["tokio-comp", "connection-manager"] }
   serde = { version = "1", features = ["derive"] }
   serde_json = "1"
   sqlx = { version = "0.8", features = ["runtime-tokio-rustls", "postgres", "uuid", "chrono", "json"] }
   thiserror = "1"
   tokio = { version = "1", features = ["full"] }
   tower-http = { version = "0.5", features = ["cors", "trace"] }
   tracing = "0.1"
   tracing-subscriber = "0.3"
   uuid = { version = "1", features = ["serde", "v4"] }
   ```

4. 建立資料夾：

   ```bash
   mkdir -p src/api/handlers src/domain src/repo src/queue src/runner src/orchestrator src/prompt migrations
   ```

5. 複製 migration：

   ```bash
   cp ../backend/internal/migrations/*.sql migrations/
   ```

6. 建立 `src/config.rs`，先只讀 `PORT`、`DATABASE_URL`、`REDIS_URL`。

7. 建立 `src/app_state.rs`，放 `PgPool` 和 `Config`。

8. 建立 `src/main.rs`，啟動 Axum server，先提供：

   ```text
   GET /api/health
   ```

9. 執行格式化：

   ```bash
   cargo fmt
   ```

10. 執行編譯：

    ```bash
    cargo check
    ```

完成標準：

- `cargo check` 通過。
- `GET /api/health` 回 `{ "status": "ok" }`。

### Phase 3：搬移資料模型與 CRUD API

目標：Rust 後端先達到前端 CRUD 可用。

步驟：

1. 先做 domain enums：

   ```text
   ModelProvider = claude | gemini
   TaskStatus = pending | running | verifying | fixing | done | failed | cancelled
   RunPhase = step | verification | fix
   LogType = stdout | stderr
   ```

2. 建立 Agent domain 和 DTO。

3. 實作 `AgentRepo`：

   ```text
   list
   get
   create
   update
   toggle
   delete
   count_usage
   ```

4. 實作 Agent handlers。

5. 用 curl 測：

   ```bash
   curl http://localhost:3001/api/agents
   ```

6. 重複同樣流程做 Pipeline。

7. 重複同樣流程做 Project。

8. 重複同樣流程做 Task，但此階段 `POST /tasks` 可以先只建立 pending，不執行 queue。

9. 每做完一組 API 就跑：

   ```bash
   cargo fmt
   cargo check
   ```

10. 全部 CRUD 完成後，啟動前端，用前端頁面逐一操作新增、編輯、刪除。

完成標準：

- 前端 Projects 頁可用。
- 前端 Agents 頁可用。
- 前端 Pipelines 頁可用。
- 前端 Tasks 頁可看到 pending 任務。

### Phase 4：Rust Queue 與 Worker

目標：建立任務入佇列、worker 取任務、更新狀態的最小流程。

步驟：

1. 建立 `TaskQueue`。

2. 實作 `enqueue(task_id)`：

   ```text
   把 task_id JSON 放進 Redis list：agent_flow:tasks
   ```

3. 實作 `worker_loop()`：

   ```text
   從 Redis list 阻塞讀取一筆 task_id
   讀 DB task
   呼叫 orchestrator.execute_task(task)
   ```

4. 暫時讓 orchestrator 不跑 Claude，只做：

   ```text
   pending -> running -> done
   ```

5. 建立任務後確認狀態會變 done。

6. 加入 concurrency：

   ```text
   TASK_CONCURRENCY=1 代表一次只跑一個
   TASK_CONCURRENCY=3 代表同時跑三個 worker task
   ```

完成標準：

- 前端新增任務後，任務會從 pending 變 running，再變 done。
- 重啟 server 不會讓 worker 崩潰。

### Phase 5：Claude Runner 與即時 SSE

目標：Rust 後端能真的呼叫 Claude CLI，並把 stdout/stderr 推到前端。

步驟：

1. 建立 `ModelRunner` trait。

2. 建立 `ClaudeRunner`。

3. 用 `tokio::process::Command` 執行：

   ```text
   claude -p "<prompt>"
   ```

4. 設定工作目錄：

   ```text
   current_dir = project.path
   ```

5. 同時讀 stdout 和 stderr。

6. 每讀到一行，就做三件事：

   ```text
   寫入 agent_logs
   publish 到 Redis channel task:<task_id>
   累加到 run output
   ```

7. 建立 `SsePublisher`。

8. 建立 `GET /api/tasks/:id/stream`。

9. 前端開任務頁，建立任務，確認 log 會即時出現。

完成標準：

- Claude CLI 真的被呼叫。
- 前端能看到即時 stdout/stderr。
- Claude 執行失敗時，任務變 failed。

### Phase 6：完整 Orchestrator 狀態機

目標：達成目前 Go MVP 的完整行為。

步驟：

1. 讀取 task 的 `pipeline_snapshot`。

2. 依 `steps.order` 排序。

3. 對每個 step：

   ```text
   發 step_start SSE
   建 prompt
   建 execution_run
   跑 runner
   寫 agent_logs
   更新 step_outputs
   發 step_done SSE
   ```

4. 所有 step 跑完後，把狀態改成 `verifying`。

5. 如果 project 沒有 test command：

   ```text
   直接 done
   ```

6. 如果有 test command，用 `CommandTester` 執行。

7. 測試通過：

   ```text
   status = done
   completed_at = now
   發 done SSE
   ```

8. 測試失敗：

   ```text
   status = fixing
   current_retry + 1
   用 fixerAgent 建 prompt
   跑 fixer
   再回到 verifying
   ```

9. 超過 max retries：

   ```text
   status = failed
   completed_at = now
   發 done SSE
   ```

10. 實作取消：

    ```text
    PUT /api/tasks/:id/cancel
    找到 cancellation token
    kill Claude child process
    status = cancelled
    ```

完成標準：

- 成功路徑：step -> verifying -> done。
- 失敗修正路徑：step -> verifying -> fixing -> verifying -> done。
- 超過重試：最後 failed。
- 取消：最後 cancelled。

### Phase 7：前端任務詳情、歷史 Run、歷史 Log

目標：讓使用者能查任務全部歷史。

步驟：

1. 後端補：

   ```text
   GET /api/tasks/:id/runs
   GET /api/runs/:runId/logs
   ```

2. 前端新增：

   ```text
   TaskDetailPage
   ExecutionRunsPanel
   LogViewer
   ```

3. App route 加：

   ```tsx
   <Route path="tasks/:id" element={<TaskDetailPage />} />
   ```

4. TaskCard 點擊改成：

   ```text
   navigate(`/tasks/${task.id}`)
   ```

5. 已完成任務顯示歷史 logs。

6. 執行中任務同時顯示 live logs。

完成標準：

- 重新整理任務詳情頁後資料仍在。
- 使用者可看每次 run 的 output 和 logs。

### Phase 8：Settings、Health Check、Provider 狀態

目標：使用者不用看 terminal 也知道系統狀態。

步驟：

1. Rust 後端新增：

   ```text
   GET /api/health
   GET /api/config/runtime
   ```

2. Health check 檢查：

   ```text
   DB ping
   Redis ping
   claude CLI 是否存在
   GEMINI_API_KEY 是否設定
   ```

3. 前端新增 `SettingsPage`。

4. Sidebar 新增設定入口。

5. 畫面顯示：

   ```text
   Backend: OK/Fail
   PostgreSQL: OK/Fail
   Redis: OK/Fail
   Claude CLI: OK/Fail
   Gemini API Key: Configured/Missing
   ```

完成標準：

- 使用者打開設定頁可以知道缺哪個環境依賴。

### Phase 9：測試與 CI

目標：讓重構可以安全持續。

步驟：

1. Rust 後端加單元測試：

   ```text
   prompt builder
   status transition
   config parser
   ```

2. Rust 後端加 integration tests：

   ```text
   agents CRUD
   projects CRUD
   tasks create
   ```

3. 前端加 Vitest。

4. 前端加 MSW mock API。

5. 前端加 Playwright E2E。

6. 建立 GitHub Actions：

   ```text
   web lint
   web build
   rust fmt
   rust clippy
   rust test
   docker compose build
   ```

完成標準：

- 每次 push 都會跑 CI。
- API 改壞時，前端或後端測試會失敗。

### Phase 10：切換 Rust 後端成正式後端

目標：停止使用 Go 後端，正式切到 Rust。

步驟：

1. 修改 `docker-compose.yml`，新增 `backend-rust` service。

2. 先讓 Go 和 Rust 用不同 port：

   ```text
   Go: 3001
   Rust: 3002
   ```

3. 前端 `.env` 改：

   ```text
   VITE_API_URL=http://localhost:3002/api
   ```

4. 完整手動測試：

   ```text
   建 Agent
   建 Pipeline
   建 Project
   建 Task
   看 SSE log
   取消 Task
   重試 failed Task
   看 task runs
   看 run logs
   ```

5. 沒問題後，把 Rust port 改回 3001。

6. 移除 Go backend service 或標成 legacy。

7. 更新 `README.md`、`DESIGN.md`、`plan.md`。

完成標準：

- `docker compose up` 預設啟動 Rust 後端。
- 前端全部功能使用 Rust API。
- Go 後端不再是主要執行路徑。

---

## 5. 平行執行版本

原則：

- Phase 0 必須最先完成，因為它是前端 build、Go test、資料庫與 Redis 的基準。
- Phase 1 和 Phase 2 可以同步開始：Phase 1 固定 API contract，Phase 2 建 Rust 骨架。
- Phase 3 之後不要整個 phase 硬切給同一個人，應該拆成「API/資料」、「執行引擎」、「前端體驗」、「測試」四條線。
- Phase 10 只能最後做。不要一開始就刪 Go 後端；先讓 Rust 後端在不同 port 跑，等 API、SSE、runs、logs、cancel、retry 都對齊後再切換。

### 指派方式

之後可以直接用工作包 ID 指派，例如：

```text
請執行 W1-TA
請執行 Wave 2 的 Track C
請先做 W3-TB，完成後不要碰 W3-TA
請檢查 W4-TC 是否完成
```

工作包 ID 規則：

- `W0` 代表 Wave 0。
- `W1-TA` 代表 Wave 1 Track A。
- `W2-TE` 代表 Wave 2 Track E。
- `W6` 代表 Wave 6，因為正式切換不拆平行 Track。

每個工作包都應該遵守：

- 只做指定工作包範圍內的檔案與功能。
- 開始前先確認該工作包的前置條件。
- 完成後回報修改檔案、驗證指令、未完成風險。
- 不要順手做下一個 Track，除非被明確指定。

### 工作包索引

| ID | 名稱 | 前置條件 | 主要交付物 | 驗證 |
| --- | --- | --- | --- | --- |
| W0 | 建立基準 | 無 | 現況 build/test 基準 | `web` build、Go test |
| W1-TA | API Contract / Go 補缺口 | W0 | Go route/handler 補齊、錯誤格式統一、前端 request error parsing | `bun run build`、`go test ./...` |
| W1-TB | Rust Skeleton | W0 | `backend-rust`、config、app state、Axum server、health endpoint | `cargo fmt`、`cargo check`、`GET /api/health` |
| W1-TC | 測試基礎架構 | W0 | Vitest setup、MSW setup、Rust test skeleton | 測試指令可執行 |
| W2-TA | Agent CRUD | W1-TA、W1-TB | Agent domain/DTO/repo/handler | `cargo check`、Agent API curl |
| W2-TB | Pipeline CRUD | W1-TA、W1-TB | Pipeline domain/DTO/repo/handler | `cargo check`、Pipeline API curl |
| W2-TC | Project CRUD | W1-TA、W1-TB | Project domain/DTO/repo/handler | `cargo check`、Project API curl |
| W2-TD | Task CRUD 最小版 | W2-TA、W2-TB、W2-TC | Task domain/DTO/repo/handler，`POST /tasks` 只建立 pending | `cargo check`、Tasks 頁看到 pending |
| W2-TE | 前端 Mock / Component Tests | W1-TA、W1-TC | MSW handlers、API client tests、表單/Badge/loading/error tests | `bun test`、`bun run build` |
| W3-TA | Queue / Worker | W2-TD | Redis queue、enqueue、worker loop、最小 `pending -> running -> done` | `cargo check`、新增 task 後狀態完成 |
| W3-TB | Claude Runner | W2-TD | `ModelRunner`、`ClaudeRunner`、stdout/stderr reader、timeout | Rust unit tests、手動 runner 測試 |
| W3-TC | SSE Publisher / Stream | W2-TD | Redis pub/sub、SSE publisher、`GET /api/tasks/:id/stream` | SSE curl/manual test |
| W3-TD | Rust Unit Tests | W1-TB | config、queue payload、status transition、runner option tests | `cargo test` |
| W4-TA | 完整 Orchestrator | W3-TA、W3-TB、W3-TC | step/fix/verification、test command、retry、cancel | 成功/修正/失敗/取消路徑手測 |
| W4-TB | Runs / Logs API | W3-TB、W3-TC | `GET /api/tasks/:id/runs`、`GET /api/runs/:runId/logs` | API curl、重新整理後 logs 仍存在 |
| W4-TC | Task Detail UI | W4-TB | `/tasks/:id`、run timeline、log viewer、live/historical logs | `bun run build`、頁面手測 |
| W4-TD | Playwright 草稿 | W2-TE | 建 Agent/Pipeline/Project/Task、任務詳情 skeleton | Playwright 可啟動 |
| W5-TA | Settings Backend | W1-TB | health/runtime config、DB/Redis/Claude/Gemini 狀態 | API curl |
| W5-TB | Settings Frontend | W5-TA | `/admin/settings`、health/config/provider cards、sidebar entry | `bun run build`、頁面手測 |
| W5-TC | 前端可用性 | W2-TE | form error summary、ApiErrorAlert、toast、skeleton、mobile task list、DnD a11y | `bun run build`、component tests |
| W5-TD | CI / E2E 完整化 | W3-TD、W4-TD | GitHub Actions、lint/build/test/clippy/docker compose build、E2E 成功/錯誤路徑 | CI dry run 或本機對應指令 |
| W6 | 正式切換 Rust 後端 | W0-W5 全部交會點完成 | docker compose 切 Rust、前端指向 Rust、Go legacy、文件更新 | 完整手動驗收 |

### Wave 0：建立基準

必做：

- Phase 0：保護現況與建立基準。

不可平行：

- 這一階段不要同時大改功能。先確定目前版本能 build、能 test，後面才知道 Rust 重寫有沒有退步。

交付標準：

- `web` build 通過。
- Go backend test 通過。
- 已確認目前工作樹狀態。

### Wave 1：Contract 與 Rust 骨架同步

可以平行：

- Track A：Phase 1，補齊前端與現有 Go 後端 API 缺口。
- Track B：Phase 2，建立 Rust 後端骨架。
- Track C：Phase 9 的前置測試工作，先建立 Vitest / MSW / Rust test 基本架構，但不要急著寫完整 E2E。

Track A 工作：

- 統一 `web/src/lib/api.ts` 會呼叫的 API 清單。
- 補 Go route / handler 缺口。
- 統一錯誤格式，至少讓前端同時支援 `message` 和 `error`。

Track B 工作：

- 建立 `backend-rust`。
- 建立 `Config`、`AppState`、Axum server。
- 提供最小 `GET /api/health`。

Track C 工作：

- 建立測試指令和基本 setup。
- 建 MSW handler 的空架構，先依 Phase 1 的 API contract 命名。

交會點：

- Phase 1 的 API contract 要成為 Rust Phase 3 的實作依據。
- Rust health endpoint 可啟動。
- 前端 request error handling 已對齊。

### Wave 2：Rust CRUD 與前端 Mock 測試

可以平行：

- Track A：Phase 3 的 Agent CRUD。
- Track B：Phase 3 的 Pipeline CRUD。
- Track C：Phase 3 的 Project CRUD。
- Track D：Phase 3 的 Task CRUD 最小版。
- Track E：Phase 9 的 MSW / component tests。

建議拆法：

- 先共同完成 domain enums、共用 DTO、error handling、repo module layout。
- Agent、Pipeline、Project 可以平行做。
- Task 建議稍晚開始，因為 Task 會連到 queue、runs、logs、status transition。

Track E 可以先測：

- API client error parsing。
- Agent / Pipeline / Project 表單。
- Badge 狀態顯示。
- 空列表、loading、mutation error UI。

暫時不要做：

- 不要在這個 wave 實作真正 Claude 執行。
- 不要在這個 wave 要求 Task 完整跑完 pipeline；`POST /tasks` 先能建立 pending 即可。

交會點：

- 前端 Projects / Agents / Pipelines 頁面可接 Rust CRUD。
- 前端 Tasks 頁可看到 pending task。
- Rust `cargo check` 通過。
- MSW mock API 與真實 API route 命名一致。

### Wave 3：Queue、Runner、SSE 分工

可以平行：

- Track A：Phase 4，Rust Queue 與 Worker。
- Track B：Phase 5 的 `ClaudeRunner`。
- Track C：Phase 5 的 `SsePublisher` 與 stream handler。
- Track D：Phase 9 的 Rust 單元測試。

Track A 工作：

- `TaskQueue`。
- Redis list enqueue。
- worker loop。
- 最小 orchestrator：`pending -> running -> done`。
- concurrency 設定。

Track B 工作：

- `ModelRunner` trait。
- `ClaudeRunner`。
- stdout / stderr async reader。
- process timeout 基礎處理。

Track C 工作：

- Redis pub/sub publisher。
- `GET /api/tasks/:id/stream`。
- SSE event 格式。

Track D 可以先測：

- config parser。
- queue payload encode/decode。
- status transition helper。
- runner command option builder。

依賴提醒：

- Track B 和 C 可以先用 fake task/run 測。
- 真正串起「建立 task -> worker -> runner -> SSE」時，需要 Track A、B、C 合併。

交會點：

- 新增任務後狀態會從 pending 到 running 到 done。
- Claude CLI 可以被呼叫。
- 前端可看到 live stdout/stderr。
- Claude 執行失敗時 task 會 failed。

### Wave 4：完整 Orchestrator 與任務詳情

可以平行：

- Track A：Phase 6，完整 Orchestrator 狀態機。
- Track B：Phase 7 的後端 runs/logs API。
- Track C：Phase 7 的前端 TaskDetailPage / ExecutionRunsPanel / LogViewer。
- Track D：Phase 9 的 Playwright 測試草稿。

Track A 工作：

- pipeline snapshot 讀取。
- step/fix/verification 狀態流程。
- test command。
- max retries。
- cancel token 與 child process kill。

Track B 工作：

- `GET /api/tasks/:id/runs`。
- `GET /api/runs/:runId/logs`。
- run/log response DTO。

Track C 工作：

- `/tasks/:id` route。
- 任務 header、prompt、pipeline snapshot、step output。
- 歷史 run timeline。
- stdout/stderr log viewer。
- 執行中任務 live log，完成任務 historical log。

Track D 可以先寫：

- 建立 Agent / Pipeline / Project / Task 成功路徑。
- 任務詳情頁可重新整理。
- log panel 基本顯示。

依賴提醒：

- Track C 可以先用 MSW 開發，但最終驗收必須接 Track B 的真 API。
- Playwright 可以先寫 skeleton，等 Orchestrator 穩定後再補 assert。

交會點：

- 成功路徑：step -> verifying -> done。
- 失敗修正路徑：step -> verifying -> fixing -> verifying -> done。
- 超過重試後 failed。
- 取消後 cancelled。
- 重新整理任務詳情頁後仍可看到 runs 和 logs。

### Wave 5：Settings、可用性、CI 收斂

可以平行：

- Track A：Phase 8，Rust health / runtime config API。
- Track B：Phase 8，前端 SettingsPage。
- Track C：F-004 / F-009 類前端可用性項目。
- Track D：Phase 9，CI 和 E2E 完整化。

Track A 工作：

- DB ping。
- Redis ping。
- Claude CLI 檢查。
- Gemini API key 是否設定。
- runtime config response，不回傳 secret 原文。

Track B 工作：

- `/admin/settings`。
- HealthCheckCard。
- RuntimeConfigCard。
- ProviderConfigCard。
- Sidebar 設定入口。

Track C 可做：

- 表單錯誤總覽。
- mutation error alert。
- loading skeleton。
- toast。
- mobile task list。
- Pipeline DnD 無障礙提示。

Track D 工作：

- `web lint`。
- `web build`。
- `rust fmt`。
- `rust clippy`。
- `rust test`。
- `docker compose build`。
- Playwright 成功路徑和錯誤路徑。

交會點：

- 使用者能從設定頁看出 backend/db/redis/claude/gemini 狀態。
- CI 能在 API contract 或主要流程壞掉時失敗。
- 前端主要 mutation 都有清楚成功/失敗回饋。

### Wave 6：正式切換 Rust 後端

必須最後做：

- Phase 10：切換 Rust 後端成正式後端。

步驟：

1. `docker-compose.yml` 新增 `backend-rust` service。
2. Go 和 Rust 先用不同 port。
3. 前端 `.env` 先指向 Rust port。
4. 完整手動測試：

   ```text
   建 Agent
   建 Pipeline
   建 Project
   建 Task
   看 SSE log
   取消 Task
   重試 failed Task
   看 task runs
   看 run logs
   看 settings health
   ```

5. 沒問題後，把 Rust port 改回主要後端 port。
6. Go backend service 移除或標成 legacy。
7. 更新 `README.md`、`DESIGN.md`、`plan.md`。

完成標準：

- `docker compose up` 預設啟動 Rust 後端。
- 前端全部功能使用 Rust API。
- Go 後端不再是主要執行路徑。

### 總覽表

| Wave | 可平行 Track | 主要 Phase | 阻塞條件 | 交付物 |
| --- | --- | --- | --- | --- |
| Wave 0 | 無 | Phase 0 | 無 | 現況基準 |
| Wave 1 | Contract / Rust skeleton / test setup | Phase 1, 2, 9 前置 | Phase 0 | API contract、Rust health |
| Wave 2 | Agent / Pipeline / Project / Task CRUD / MSW | Phase 3, 9 部分 | Phase 2 skeleton、Phase 1 contract | Rust CRUD、前端 mock tests |
| Wave 3 | Queue / Runner / SSE / Rust unit tests | Phase 4, 5, 9 部分 | Task CRUD 最小版 | task 可執行、live log |
| Wave 4 | Orchestrator / runs API / task detail UI / E2E 草稿 | Phase 6, 7, 9 部分 | Queue + Runner + SSE 合併 | 完整任務狀態機、歷史 logs |
| Wave 5 | Settings API / Settings UI / UX / CI | Phase 8, 9 | Rust API 基本穩定 | settings、CI、E2E |
| Wave 6 | 無 | Phase 10 | Wave 0-5 驗收完成 | Rust 正式切換 |
