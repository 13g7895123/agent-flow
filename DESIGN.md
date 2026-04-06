# Agent Flow 系統設計文件

> 一個以 Claude CLI 為核心的 AI 任務自動執行管理系統，支援多專案、可配置 Agent 流程、各 Agent 獨立提示詞管理、自動驗收與失敗重試循環。

---

## 目錄

1. [系統概述](#1-系統概述)
2. [技術選型](#2-技術選型)
3. [系統架構](#3-系統架構)
4. [核心概念：Pipeline 與 Agent](#4-核心概念pipeline-與-agent)
5. [資料模型設計](#5-資料模型設計)
6. [任務狀態機](#6-任務狀態機)
7. [Agent 提示詞設計](#7-agent-提示詞設計)
8. [驗收循環機制](#8-驗收循環機制)
9. [後台管理介面](#9-後台管理介面)
10. [目錄結構](#10-目錄結構)
11. [API 設計](#11-api-設計)
12. [實作步驟](#12-實作步驟)
13. [風險與對策](#13-風險與對策)

---

## 1. 系統概述

### 核心功能

- **專案管理**：建立並管理多個專案，每個專案綁定本地路徑、測試指令、以及所使用的執行流程（Pipeline）
- **任務建立**：輸入自然語言提示詞，系統自動建立任務卡片並排入執行佇列
- **可配置 Pipeline 流程**：後台可自由定義執行流程，每條 Pipeline 由多個 Agent 節點組成，順序可調整
- **獨立 Agent 管理**：每個 Agent 有自己的名稱、角色描述、提示詞模板，可在後台新增、編輯、停用
- **自動驗收循環**：執行測試指令，失敗時將錯誤回饋給指定的修正 Agent 並重試，直到通過或達到上限
- **即時日誌串流**：透過 SSE 即時顯示每個 Agent 的輸出

### 完整工作流程

```
使用者輸入提示詞
        │
        ▼
  建立任務卡片（pending）
        │
        ▼
  讀取專案綁定的 Pipeline
  取得 Agent 節點有序列表
        │
        ▼
  依序執行每個 Agent 節點
  （各 Agent 使用自己的提示詞模板）
        │
  ┌─────▼──────────────────────────────┐
  │  節點 1：分析 Agent                  │
  │  → 輸出驗收標準                      │
  └─────┬──────────────────────────────┘
        │
  ┌─────▼──────────────────────────────┐
  │  節點 2：執行 Agent                  │
  │  → 實作程式碼                        │
  └─────┬──────────────────────────────┘
        │
        ▼
  執行測試指令驗收
        │
   ┌────┴────┐
   │通過      │失敗
   ▼          ▼
  done    將錯誤回饋給 Pipeline 中
          指定的修正 Agent
              │
              ▼
          Agent 修正 → 再次驗收
          （循環至通過或超過重試上限）
```

---

## 2. 技術選型

### 後端框架選項比較

此專案的真正瓶頸不在 API 效能，而是 **claude CLI 的執行時間**（每次數秒至數分鐘）。選型的重點是：並發子程序管理能力、開發效率、部署簡易度。

| 選項 | 效能 | 並發模型 | 適合度 | 備注 |
|------|------|----------|--------|------|
| **Go + Fiber** ⭐ | 極高 | goroutine，原生並發 | ★★★★★ | 推薦首選 |
| Bun + Elysia | 高 | Event Loop（JS） | ★★★★☆ | 想留在 JS 生態的最佳選擇 |
| Node.js + Fastify | 中高 | Event Loop（JS） | ★★★☆☆ | 原設計，可行但非最優 |
| Python + FastAPI | 中 | asyncio | ★★★☆☆ | 開發快，但 GIL 限制並發 |
| Rust + Axum | 最高 | async/await | ★★☆☆☆ | 效能過剩，開發成本高 |

**選定：Go + Fiber**

理由：
- **goroutine** 天然適合「同時管理多個 claude 子程序」的場景，每個任務一個 goroutine，無阻塞
- `os/exec` + channel 處理子程序輸出比 Node `child_process` 更穩定，超時與取消控制更精確
- 部署為單一 binary，無需 runtime，記憶體佔用約為 Node 的 1/5
- 靜態型別，配合 sqlc 或 pgx 直接操作 PostgreSQL，效能最佳
- 前後端型別定義分離，透過 OpenAPI schema 或共用 JSON 結構對齊

---

### 前端

| 技術 | 用途 |
|------|------|
| React 18 + TypeScript | UI 框架 |
| Vite | 開發伺服器與打包工具 |
| shadcn/ui + Tailwind CSS | UI 元件庫與樣式 |
| TanStack Query | 非同步資料獲取與快取 |
| Zustand | 輕量全局狀態管理 |
| React Router v6 | 前端路由 |
| `@dnd-kit/core` | Pipeline 節點拖曳排序 |
| EventSource API | SSE 即時串流接收 |

### 後端

| 技術 | 用途 |
|------|------|
| Go 1.22+ | 後端語言 |
| Fiber v2 | HTTP 框架（語法接近 Express，效能比 Gin 高） |
| pgx v5 | PostgreSQL 驅動（原生，效能最佳） |
| sqlc | 從 SQL 自動產生型別安全的 Go 程式碼 |
| golang-migrate | 資料庫 migration 管理 |
| **PostgreSQL 17** | 主資料庫 |
| Asynq | 任務佇列（Go 原生，基於 Redis，類似 BullMQ） |
| Redis | Asynq 後端 + pub/sub |
| `os/exec` | 呼叫 Claude CLI |
| `google.golang.org/genai` | 呼叫 Gemini API（Google Gen AI SDK for Go） |

> **為何用 sqlc 而非 ORM（如 GORM）？**
> sqlc 直接寫 SQL，產生型別安全的 Go code，沒有 ORM 的 N+1 問題與 runtime 反射開銷。
> PostgreSQL 複雜查詢（JSONB、CTE）用 sqlc 比 ORM 更直接。

### 前端建置工具

| 技術 | 用途 |
|------|------|
| pnpm | 套件管理 |
| Vite | 建置工具 |

---

## 3. 系統架構

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              瀏覽器 (React)                               │
│                                                                            │
│  ┌──────────────────┐  ┌──────────────────────────────────────────────┐   │
│  │   導覽列          │  │              主要內容區域                     │   │
│  │                  │  │                                               │   │
│  │  ▶ 專案管理       │  │  【任務看板】  Kanban：pending / running /    │   │
│  │  ▶ 任務看板       │  │              done / failed                   │   │
│  │  ────────────    │  │                                               │   │
│  │  ⚙ 後台管理      │  │  【後台管理】  Agent 庫 / Pipeline 編輯器 /  │   │
│  │    Agent 庫       │  │              全域設定                        │   │
│  │    Pipeline 庫    │  │                                               │   │
│  └──────────────────┘  └──────────────────────────────────────────────┘   │
└────────────────────────────────┬─────────────────────────────────────────┘
                                  │  HTTP REST / SSE
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          Fastify API Server                                │
│                                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Projects API │  │  Tasks API   │  │  Agents API  │  │ Pipelines API│  │
│  └──────────────┘  └──────┬───────┘  └──────────────┘  └──────────────┘  │
│                             │ enqueue                                      │
│                             ▼                                              │
│  ┌───────────────────────────────────────────────────────────────────┐     │
│  │                       BullMQ Job Queue                              │     │
│  │                                                                     │     │
│  │  task-queue ──► Worker ──► Orchestrator                            │     │
│  │                                │                                   │     │
│  │              ┌─────────────────▼────────────────────────────────┐  │     │
│  │              │             Task Orchestrator                      │  │     │
│  │              │                                                    │  │     │
│  │              │  1. 讀取 Pipeline → 取得 Agent 節點列表            │  │     │
│  │              │                                                    │  │     │
│  │              │  2. 依序執行每個 Agent 節點                        │  │     │
│  │              │     ├─ 組裝：系統提示詞 + 節點提示詞 + 上下文     │  │     │
│  │              │     └─ spawn claude -p "[完整 prompt]"            │  │     │
│  │              │                                                    │  │     │
│  │              │  3. 執行測試指令驗收                               │  │     │
│  │              │                                                    │  │     │
│  │              │  4. 失敗 → 找到 Pipeline 的 fixerAgentId          │  │     │
│  │              │         → 重新執行修正 Agent → 回到步驟 3         │  │     │
│  │              └────────────────────────────────────────────────────┘  │     │
│  └───────────────────────────────────────────────────────────────────┘     │
│                                                                            │
│  ┌────────────────────────┐    ┌──────────────────────────────────────┐   │
│  │  PostgreSQL 17         │    │   Redis                              │   │
│  │  - projects            │    │   - Asynq 佇列                       │   │
│  │  - agents              │    │   - pub/sub（SSE 事件推送）          │   │
│  │  - pipelines           │    └──────────────────────────────────────┘   │
│  │  - pipeline_steps      │                                                │
│  │  - tasks               │                                                │
│  │  - execution_runs      │                                                │
│  │  - agent_logs          │                                                │
│  └────────────────────────┘                                                │
└──────────────────────────────────────┬───────────────────────────────────┘
                                        │  child_process.spawn
                                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            Claude CLI                                      │
│                                                                            │
│                     ModelRunner Interface                                  │
│                                                                            │
│  ┌─────────────────────────────┐  ┌────────────────────────────────────┐  │
│  │  ClaudeRunner               │  │  GeminiRunner                      │  │
│  │                             │  │                                    │  │
│  │  claude -p "[prompt]"       │  │  genai.Client.GenerateContentStream│  │
│  │  cwd = 專案路徑             │  │  HTTP streaming（含 projectPath）  │  │
│  │  os/exec → stdout goroutine │  │  → chunk goroutine → Redis pub/sub │  │
│  └─────────────────────────────┘  └────────────────────────────────────┘  │
│                                                                            │
│  → 依 Agent.modelProvider 決定使用哪個 Runner                             │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 核心概念：Pipeline 與 Agent

### 概念定義

```
Agent（代理人）
  └─ 系統中可複用的 AI 執行單元
  └─ 有名稱、角色說明、提示詞模板
  └─ 提示詞模板中可使用變數（{projectPath}、{userPrompt} 等）
  └─ 每個 Agent 可獨立設定使用的 Model Provider（Claude / Gemini）
  └─ 可被多條 Pipeline 共用

Pipeline（流程）
  └─ 一組有序的執行步驟
  └─ 每個步驟（PipelineStep）對應一個 Agent
  └─ 設定哪個 Agent 負責修正（fixerAgentId）
  └─ 可被多個專案使用

Project（專案）
  └─ 綁定一條 Pipeline
  └─ 任務執行時依照 Pipeline 定義的步驟進行
```

### 預設 Pipeline 範例（分析 → 執行）

```
Pipeline: "標準開發流程"
  ├─ Step 1：[分析 Agent]   role=analyzer  order=1
  └─ Step 2：[執行 Agent]   role=executor  order=2
  fixerAgentId = [執行 Agent]  ← 驗收失敗時由此 Agent 修正
```

### 自訂 Pipeline 範例（三階段流程）

```
Pipeline: "嚴謹開發流程"
  ├─ Step 1：[架構審查 Agent]  role=architect   order=1
  ├─ Step 2：[實作 Agent]      role=executor    order=2
  └─ Step 3：[程式碼審查 Agent] role=reviewer   order=3
  fixerAgentId = [實作 Agent]
```

### Prompt 組裝規則

每次呼叫 claude 時，完整 prompt 由三層疊加組成：

```
完整 prompt = [Agent 的 systemPrompt]
            + \n\n
            + [Agent 的 stepPrompt 模板（填入變數）]
            + \n\n
            + [執行上下文（前序 Agent 的輸出、錯誤歷史等）]
```

### 可用的 Prompt 變數

| 變數 | 說明 |
|------|------|
| `{projectPath}` | 專案絕對路徑 |
| `{testCommand}` | 測試指令 |
| `{userPrompt}` | 使用者原始提示詞 |
| `{previousOutput}` | 前一個 Agent 節點的輸出 |
| `{allPreviousOutputs}` | 所有已執行節點的輸出（JSON） |
| `{acceptanceCriteria}` | 從分析節點解析出的驗收標準 |
| `{lastError}` | 最近一次測試失敗的錯誤訊息 |
| `{errorHistory}` | 所有歷史失敗記錄（JSON） |
| `{currentRetry}` | 目前第幾次修正嘗試 |
| `{maxRetries}` | 最大重試次數 |

---

## 5. 資料模型設計

資料庫使用 **PostgreSQL 17**，以下同時提供 SQL DDL 與 Go struct 對照。
`pipeline_snapshot` 與 `step_outputs` 使用 PostgreSQL 原生 **JSONB** 型別，支援索引查詢。

### agents 表

```sql
CREATE TYPE model_provider AS ENUM ('claude', 'gemini');

CREATE TABLE agents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  system_prompt  TEXT NOT NULL,
  step_prompt    TEXT NOT NULL,
  -- Model 設定
  model_provider model_provider NOT NULL DEFAULT 'claude',
  model_id       TEXT NOT NULL DEFAULT '',
  -- model_provider = 'claude'：model_id 可留空（使用 CLI 預設），
  --   或指定如 'claude-opus-4-5'（透過 claude --model 參數傳入）
  -- model_provider = 'gemini'：model_id 必填，例如 'gemini-2.0-flash'
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

```go
type ModelProvider string

const (
  ModelProviderClaude ModelProvider = "claude"
  ModelProviderGemini ModelProvider = "gemini"
)

type Agent struct {
  ID            uuid.UUID     `db:"id"`
  Name          string        `db:"name"`
  Description   string        `db:"description"`
  SystemPrompt  string        `db:"system_prompt"`
  StepPrompt    string        `db:"step_prompt"`
  ModelProvider ModelProvider `db:"model_provider"`  // 'claude' | 'gemini'
  ModelID       string        `db:"model_id"`        // 模型版本，空字串 = 使用預設
  IsActive      bool          `db:"is_active"`
  CreatedAt     time.Time     `db:"created_at"`
  UpdatedAt     time.Time     `db:"updated_at"`
}
```

> **ModelID 規則：**
> - `claude` + 空字串：使用 `claude -p`，不帶 `--model` 參數，沿用 CLI 的預設模型
> - `claude` + `"claude-opus-4-5"`：使用 `claude -p --model claude-opus-4-5`
> - `gemini` + `"gemini-2.0-flash"`：透過 Gemini Go SDK 呼叫，必須填寫
> - `gemini` + 空字串：後端驗證拒絕，儲存時回傳錯誤

### pipelines 表

```sql
CREATE TABLE pipelines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  description    TEXT,
  fixer_agent_id UUID NOT NULL REFERENCES agents(id),
  is_default     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### pipeline_steps 表

```sql
CREATE TABLE pipeline_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  agent_id    UUID NOT NULL REFERENCES agents(id),
  "order"     SMALLINT NOT NULL,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pipeline_id, "order")
);
```

### projects 表

```sql
CREATE TABLE projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  path         TEXT NOT NULL,
  test_command TEXT NOT NULL,
  pipeline_id  UUID NOT NULL REFERENCES pipelines(id),
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### tasks 表

```sql
CREATE TYPE task_status AS ENUM (
  'pending', 'running', 'verifying', 'fixing', 'done', 'failed', 'cancelled'
);

CREATE TABLE tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES projects(id),
  pipeline_id         UUID NOT NULL REFERENCES pipelines(id),
  title               TEXT NOT NULL,
  prompt              TEXT NOT NULL,
  status              task_status NOT NULL DEFAULT 'pending',
  priority            SMALLINT NOT NULL DEFAULT 0,
  max_retries         SMALLINT NOT NULL DEFAULT 5,
  current_retry       SMALLINT NOT NULL DEFAULT 0,
  pipeline_snapshot   JSONB NOT NULL,   -- 建立時的 Pipeline + Steps + Agents 完整快照
  step_outputs        JSONB NOT NULL DEFAULT '{}',  -- { "<step_id>": "<output>" }
  acceptance_criteria JSONB,            -- 從分析節點解析出的驗收標準
  completed_summary   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_status         ON tasks(status);
```

> **JSONB 的優勢**：`pipeline_snapshot` 與 `step_outputs` 使用 JSONB 可直接在 PostgreSQL 中用 `->>`、`@>` 進行條件查詢，未來若需要根據快照內容篩選任務，不需要額外欄位。

```go
type TaskStatus string

const (
  TaskStatusPending   TaskStatus = "pending"
  TaskStatusRunning   TaskStatus = "running"
  TaskStatusVerifying TaskStatus = "verifying"
  TaskStatusFixing    TaskStatus = "fixing"
  TaskStatusDone      TaskStatus = "done"
  TaskStatusFailed    TaskStatus = "failed"
  TaskStatusCancelled TaskStatus = "cancelled"
)
```

> **備註**：原本的 `analyzing` / `executing` 狀態合併為 `running`，Pipeline 步驟動態決定，前端顯示「Step N / 共 N 步」進度。

### execution_runs 表

```sql
CREATE TYPE run_phase AS ENUM ('step', 'verification', 'fix');

CREATE TABLE execution_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  run_index     SMALLINT NOT NULL,    -- 第幾輪（含修正循環）
  step_id       UUID,                 -- 快照中的 pipeline_steps.id（verification 時為 NULL）
  agent_id      UUID,                 -- 快照中的 agents.id
  agent_name    TEXT NOT NULL,        -- 快照：防止 Agent 被改名後失真
  phase         run_phase NOT NULL,
  prompt_sent   TEXT NOT NULL,        -- 實際送出的完整 prompt
  output        TEXT,
  exit_code     SMALLINT,
  success       BOOLEAN,
  error_message TEXT,
  duration_ms   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX idx_execution_runs_task ON execution_runs(task_id);
```

### agent_logs 表

```sql
CREATE TYPE log_type AS ENUM ('stdout', 'stderr', 'system');

CREATE TABLE agent_logs (
  id               BIGSERIAL PRIMARY KEY,
  execution_run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
  sequence         INTEGER NOT NULL,
  type             log_type NOT NULL,
  content          TEXT NOT NULL,
  timestamp        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_logs_run ON agent_logs(execution_run_id, sequence);
```

> **效能說明**：`agent_logs` 是寫入最頻繁的表（每行 claude 輸出一筆）。`BIGSERIAL` 主鍵 + `(execution_run_id, sequence)` 複合索引，確保依序讀取效率。若日誌量極大，可考慮按月 partition 或設定 TTL 定期清除。

### 實體關係圖

```
Agent (N) ◄──── (N) PipelineStep (N) ────► (1) Pipeline (1) ◄──── (N) Project
                                                                          │
                                                                          │
                                                                    (N) Task
                                                                          │
                                                                  (N) ExecutionRun
                                                                          │
                                                                   (N) AgentLog
```

---

## 6. 任務狀態機

### 狀態轉換圖

```
               ┌──────────────────────────────────────────────────────┐
               │                                                        │
               ▼                                                        │
        ┌─────────────┐                                                 │
建立任務│   pending   │                                                 │
──────► │             │                                                 │
        └──────┬──────┘                                                 │
               │ Worker 取得任務，讀取 Pipeline 快照                    │
               ▼                                                        │
        ┌─────────────┐                                                 │
        │   running   │ ← 依序執行 Pipeline 中每個 Agent 節點           │
        └──────┬──────┘                                                 │
               │ 所有節點執行完畢                                        │
               ▼                                                        │
        ┌─────────────┐                                                 │
        │  verifying  │ ← 執行測試指令                                  │
        └──────┬──────┘                                                 │
               │                                                        │
     ┌─────────┴──────────┐                                             │
     │ 測試通過             │ 測試失敗                                    │
     ▼                     ▼                                             │
┌──────────┐      ┌─────────────┐                                       │
│   done   │      │   fixing    │ ← retry < maxRetries                  │
└──────────┘      └──────┬──────┘                                       │
                         │ 執行 fixerAgent，傳入錯誤上下文               │
                         └───────────────────────────────────────────────┘
                                    ↓ retry >= maxRetries
                             ┌─────────────┐
                             │   failed    │
                             └─────────────┘

  任意狀態  ──[使用者取消]──►  cancelled
```

### 狀態轉換規則

| 當前狀態 | 觸發事件 | 下一狀態 |
|----------|----------|----------|
| `pending` | Worker 取得任務 | `running` |
| `running` | Pipeline 所有步驟完成 | `verifying` |
| `running` | 任一步驟逾時或崩潰 | `failed` |
| `verifying` | 測試通過 | `done` |
| `verifying` | 測試失敗 且 retry < maxRetries | `fixing` |
| `verifying` | 測試失敗 且 retry >= maxRetries | `failed` |
| `fixing` | fixerAgent 執行完成 | `verifying` |
| 任意 | 使用者取消 | `cancelled` |

---

## 7. Agent 提示詞設計

每個 Agent 的提示詞分為兩個欄位，在後台管理介面中均可編輯：

### systemPrompt（系統提示詞）

定義 Agent 的**角色與行為準則**，通常不含任務細節，可在多條 Pipeline 中複用。

**範例（分析 Agent）：**
```
你是一位資深技術分析師。你的職責是分析軟體開發任務需求，
產出結構化的執行計畫與可測試的驗收標準。
你不撰寫程式碼，只做規劃與分析。
請始終以 JSON 格式輸出，不要包含任何 JSON 以外的文字。
```

**範例（執行 Agent）：**
```
你是一位資深軟體工程師，負責在指定的專案目錄中完成開發任務。
你撰寫高品質、可維護的程式碼，並確保符合驗收標準。
執行完畢後輸出你所做的修改摘要。
```

---

### stepPrompt（步驟提示詞模板）

定義**此步驟具體要做什麼**，使用 `{變數}` 注入執行時的動態內容。

**範例（分析 Agent）：**
```
【工作目錄】
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
}
```

**範例（執行 Agent）：**
```
【工作目錄】
{projectPath}

【測試指令（執行後將以此驗收）】
{testCommand}

【任務需求】
{userPrompt}

【前序分析結果】
{previousOutput}

【驗收標準】
{acceptanceCriteria}

請依序完成任務，確保通過測試指令驗收。
```

**範例（修正 Agent，用於 fixerAgentId）：**
```
【工作目錄】
{projectPath}

【測試指令】
{testCommand}

【原始任務需求】
{userPrompt}

【驗收標準】
{acceptanceCriteria}

━━━━━━━━━━━━━━━━━━━━━━
【這是第 {currentRetry} 次修正嘗試，上限 {maxRetries} 次】

測試失敗，錯誤輸出如下：
{lastError}

前次修改摘要：
{previousOutput}
━━━━━━━━━━━━━━━━━━━━━━

{errorHistory}

請根據錯誤訊息找出根因並修正，勿重新實作整個任務。
```

---

### 提示詞設計原則

1. **systemPrompt 定義角色，stepPrompt 定義任務**：職責分離，systemPrompt 穩定可複用，stepPrompt 視需求調整
2. **變數插值在後端組裝**：`promptBuilder.go` 負責替換所有 `{變數}`，Agent 設定中只存模板原文
3. **分析型 Agent 輸出嚴格 JSON**：後端解析後存入 `stepOutputs`，供後續節點透過 `{previousOutput}` 引用
4. **修正 Agent 接收完整錯誤上下文**：`{lastError}` + `{errorHistory}` 讓 Agent 避免重複同樣的錯誤
5. **每次 prompt 均包含 `{projectPath}`**：即使 claude 已在正確 cwd 執行，也要明確告知

---

## 8. 驗收循環機制

### 核心 Orchestrator 邏輯

```go
// apps/api/internal/orchestrator/orchestrator.go

func (o *Orchestrator) ExecuteTask(ctx context.Context, task *db.Task) error {
    var snapshot PipelineSnapshot
    if err := json.Unmarshal(task.PipelineSnapshot, &snapshot); err != nil {
        return o.failTask(ctx, task.ID, err)
    }

    // 依 order 排序步驟
    sort.Slice(snapshot.Steps, func(i, j int) bool {
        return snapshot.Steps[i].Order < snapshot.Steps[j].Order
    })

    // ── Phase 1: 依序執行 Pipeline 所有步驟 ──
    if err := o.db.UpdateTaskStatus(ctx, task.ID, db.TaskStatusRunning); err != nil {
        return err
    }

    stepOutputs := make(map[string]string)
    var prevOutput string

    for i, step := range snapshot.Steps {
        prompt := o.promptBuilder.Build(step.Agent, PromptVars{
            ProjectPath:        task.ProjectPath,
            TestCommand:        task.TestCommand,
            UserPrompt:         task.Prompt,
            PreviousOutput:     prevOutput,
            AllPreviousOutputs: mustJSON(stepOutputs),
            AcceptanceCriteria: extractAcceptanceCriteria(stepOutputs),
        })

        result, err := o.runner.Run(ctx, RunOptions{
            Agent:       step.Agent,
            Prompt:      prompt,
            ProjectPath: task.ProjectPath,
            TaskID:      task.ID,
            StepID:      &step.ID,
            Phase:       db.RunPhaseStep,
            RunIndex:    i + 1,
        })
        if err != nil || !result.Success {
            return o.failTask(ctx, task.ID, err)
        }

        stepOutputs[step.ID.String()] = result.Output
        prevOutput = result.Output
    }

    if err := o.db.SaveStepOutputs(ctx, task.ID, stepOutputs); err != nil {
        return err
    }

    // ── Phase 2: 驗收循環 ──
    var lastError string
    type errorEntry struct{ Error, Output string }
    var errorHistory []errorEntry

    for retry := 0; retry <= int(task.MaxRetries); retry++ {
        if err := o.db.UpdateTaskStatus(ctx, task.ID, db.TaskStatusVerifying); err != nil {
            return err
        }

        testResult, err := o.tester.Run(ctx, task.ProjectPath, task.TestCommand)
        if err != nil {
            return o.failTask(ctx, task.ID, err)
        }

        if testResult.Success {
            return o.db.UpdateTaskStatus(ctx, task.ID, db.TaskStatusDone)
        }

        lastError = testResult.Output
        errorHistory = append(errorHistory, errorEntry{
            Error:  lastError,
            Output: prevOutput,
        })

        if retry >= int(task.MaxRetries) {
            return o.db.UpdateTaskStatus(ctx, task.ID, db.TaskStatusFailed)
        }

        // 執行修正 Agent
        if err := o.db.UpdateTaskStatus(ctx, task.ID, db.TaskStatusFixing); err != nil {
            return err
        }
        if err := o.db.IncrementTaskRetry(ctx, task.ID); err != nil {
            return err
        }

        fixPrompt := o.promptBuilder.Build(snapshot.FixerAgent, PromptVars{
            ProjectPath:        task.ProjectPath,
            TestCommand:        task.TestCommand,
            UserPrompt:         task.Prompt,
            AcceptanceCriteria: extractAcceptanceCriteria(stepOutputs),
            LastError:          lastError,
            ErrorHistory:       formatErrorHistory(errorHistory),
            PreviousOutput:     prevOutput,
            CurrentRetry:       strconv.Itoa(retry + 1),
            MaxRetries:         strconv.Itoa(int(task.MaxRetries)),
        })

        fixResult, err := o.runner.Run(ctx, RunOptions{
            Agent:       snapshot.FixerAgent,
            Prompt:      fixPrompt,
            ProjectPath: task.ProjectPath,
            TaskID:      task.ID,
            Phase:       db.RunPhaseFix,
            RunIndex:    len(snapshot.Steps) + retry + 1,
        })
        if err != nil || !fixResult.Success {
            return o.failTask(ctx, task.ID, err)
        }

        prevOutput = fixResult.Output

        // 指數退避（最長 30 秒）
        backoff := time.Duration(math.Min(float64(2<<retry)*float64(time.Second), float64(30*time.Second)))
        time.Sleep(backoff)
    }
    return nil
}
```

### ModelRunner Interface 與兩種實作

Orchestrator 不直接呼叫 claude 或 Gemini API，而是透過統一的 `ModelRunner` interface，由 Agent 的 `model_provider` 決定使用哪個實作。

```go
// api/internal/runner/interface.go

type RunOptions struct {
    Agent       AgentSnapshot
    Prompt      string
    ProjectPath string           // Gemini 時注入 prompt，Claude 時設定 cwd
    TaskID      uuid.UUID
    StepID      *uuid.UUID
    Phase       db.RunPhase
    RunIndex    int
}

type RunResult struct {
    Output   string
    Success  bool
    ExitCode int   // Gemini 固定為 0（無 exit code 概念）
}

// ModelRunner 是所有 model 後端的統一介面
type ModelRunner interface {
    Run(ctx context.Context, opts RunOptions) (*RunResult, error)
}
```

```go
// api/internal/runner/dispatcher.go

// Dispatcher 依 Agent 的 ModelProvider 分派給對應的 Runner
type Dispatcher struct {
    claude *ClaudeRunner
    gemini *GeminiRunner
    db     *db.Queries
    redis  *redis.Client
}

func (d *Dispatcher) Run(ctx context.Context, opts RunOptions) (*RunResult, error) {
    switch opts.Agent.ModelProvider {
    case db.ModelProviderClaude:
        return d.claude.Run(ctx, opts)
    case db.ModelProviderGemini:
        return d.gemini.Run(ctx, opts)
    default:
        return nil, fmt.Errorf("unknown model provider: %s", opts.Agent.ModelProvider)
    }
}
```

#### ClaudeRunner（os/exec）

```go
// api/internal/runner/claude.go

func (r *ClaudeRunner) Run(ctx context.Context, opts RunOptions) (*RunResult, error) {
    runCtx, cancel := context.WithTimeout(ctx, r.timeout)
    defer cancel()

    args := []string{"-p", opts.Prompt}
    if opts.Agent.ModelID != "" {
        args = append(args, "--model", opts.Agent.ModelID)
    }

    cmd := exec.CommandContext(runCtx, "claude", args...)
    cmd.Dir = opts.ProjectPath  // ← Claude 直接操作本地檔案系統

    stdout, _ := cmd.StdoutPipe()
    run, _ := r.db.CreateExecutionRun(ctx, opts)
    if err := cmd.Start(); err != nil {
        return nil, err
    }

    var buf strings.Builder
    seq := 0
    go func() {
        scanner := bufio.NewScanner(stdout)
        for scanner.Scan() {
            line := scanner.Text()
            buf.WriteString(line + "\n")
            seq++
            r.db.InsertAgentLog(ctx, run.ID, seq, db.LogTypeStdout, line)
            r.redis.Publish(ctx, "task:"+opts.TaskID.String(), sseLogEvent(line, seq))
        }
    }()

    err := cmd.Wait()
    exitCode := cmd.ProcessState.ExitCode()
    r.db.CompleteExecutionRun(ctx, run.ID, buf.String(), exitCode)

    return &RunResult{Output: buf.String(), ExitCode: exitCode, Success: exitCode == 0}, err
}
```

#### GeminiRunner（HTTP Streaming）

```go
// api/internal/runner/gemini.go

func (r *GeminiRunner) Run(ctx context.Context, opts RunOptions) (*RunResult, error) {
    runCtx, cancel := context.WithTimeout(ctx, r.timeout)
    defer cancel()

    model := r.client.GenerativeModel(opts.Agent.ModelID)
    model.SystemInstruction = genai.NewUserContent(genai.Text(opts.Agent.SystemPrompt))

    run, _ := r.db.CreateExecutionRun(ctx, opts)

    iter := model.GenerateContentStream(runCtx, genai.Text(opts.Prompt))

    var buf strings.Builder
    seq := 0
    var lastErr error

    for {
        resp, err := iter.Next()
        if err == iterator.Done {
            break
        }
        if err != nil {
            lastErr = err
            break
        }
        for _, part := range resp.Candidates[0].Content.Parts {
            if txt, ok := part.(genai.Text); ok {
                line := string(txt)
                buf.WriteString(line)
                seq++
                r.db.InsertAgentLog(ctx, run.ID, seq, db.LogTypeStdout, line)
                r.redis.Publish(ctx, "task:"+opts.TaskID.String(), sseLogEvent(line, seq))
            }
        }
    }

    success := lastErr == nil
    r.db.CompleteExecutionRun(ctx, run.ID, buf.String(), boolToExitCode(success))

    return &RunResult{Output: buf.String(), Success: success, ExitCode: boolToExitCode(success)}, lastErr
}
```

> **注意：Gemini 沒有 cwd 概念。**
> 當 Agent 使用 Gemini 時，prompt 中必須明確包含 `{projectPath}`（已由 `promptBuilder` 插值），
> 並在 `stepPrompt` 中指引 Gemini 輸出「可執行的 shell 指令或程式碼」，
> 由後端另一個 `ShellExecutor` 在 projectPath 執行 Gemini 產出的指令。
> 詳見下方「Gemini Agent 執行模型」。

#### Gemini Agent 的執行模型差異

Claude CLI 可直接操作本地檔案（它本身是一個帶有 file tool 的 agent）。
Gemini API 只回傳文字，需要後端額外執行 Gemini 產出的程式碼或指令。

```
Claude Agent 流程：
  prompt → claude CLI → [claude 直接讀寫專案檔案] → stdout 輸出摘要

Gemini Agent 流程（兩段式）：
  prompt → Gemini API → 輸出「應執行的指令 / patch / 程式碼」
         → ShellExecutor 在 projectPath 執行輸出的指令
         → 整合 stdout 作為最終輸出
```

因此 Gemini Agent 的 `stepPrompt` 設計原則不同：

| | Claude | Gemini |
|---|---|---|
| 輸出格式 | 自然語言摘要即可，claude 已完成操作 | 必須輸出可執行的 shell script 或 unified diff |
| 工作目錄 | 由 cwd 設定 | 在 prompt 中明確說明路徑 |
| 適合的節點角色 | 需要直接修改檔案的步驟（執行者、修正者） | 適合分析、審查、產出 diff 的步驟 |

```go
// api/internal/runner/shell_executor.go
// 執行 Gemini 輸出中的 shell 指令或套用 diff

func (e *ShellExecutor) Execute(ctx context.Context, output, projectPath string) (*ExecResult, error) {
    // 1. 從 output 提取 ```bash ... ``` 或 ```diff ... ``` 區塊
    // 2. 若為 shell script：exec.CommandContext + cwd = projectPath
    // 3. 若為 unified diff：套用 patch
    // 4. 回傳執行結果
}
```

### 關鍵設計決策

| 決策點 | 選擇 | 理由 |
|--------|------|------|
| ModelRunner interface | 統一抽象，Dispatcher 分派 | Orchestrator 不感知底層 model，未來可擴充更多 provider |
| Gemini 兩段式執行 | API 回傳 → ShellExecutor 執行 | Gemini 無 cwd/file tool，需後端橋接 |
| Claude model_id 可空 | 空字串 = CLI 預設，非空 = `--model` 參數 | 向下相容，不強迫指定版本 |
| Gemini model_id 必填 | 後端驗證拒絕空值 | Gemini SDK 無預設 model，必須明確指定 |
| Pipeline 快照含 ModelProvider | 快照記錄建立時的 provider + model_id | 避免 Agent 改 model 後影響執行中任務 |
| 步驟輸出傳遞 | 透過 `{previousOutput}` 變數注入 | 各節點解耦，後端統一管理資料流 |
| 錯誤上下文累積 | `errorHistory` 傳入每次修正 | 避免 Agent 重複同樣的錯誤 |
| 退避機制 | 指數退避（2s→4s→8s，上限 30s） | 降低 API 限速風險 |
| 超時保護 | 每次 Agent 呼叫上限 10 分鐘 | 防止 Agent 或 API 卡死 |

---

## 9. 後台管理介面

後台管理分為三個主要區域，透過導覽列進入。

### 9.1 Agent 庫（Agent Library）

**功能清單：**
- 檢視所有 Agent 列表（名稱、描述、Model、使用中 Pipeline 數量、啟用狀態）
- 新增 Agent：填寫名稱、描述、選擇 Model Provider + Model ID、systemPrompt、stepPrompt
- 編輯 Agent：可隨時修改提示詞與 Model 設定
- 停用 Agent：停用後無法被 Pipeline 選用，但不影響已建立的任務
- 刪除 Agent：僅允許刪除未被任何 Pipeline 使用的 Agent

**UI 設計：**

```
Agent 庫
─────────────────────────────────────────────────────
[+ 新增 Agent]

┌─────────────────────────────────────────────────────┐
│  分析者 (Analyzer)   [Claude / 預設]  ● 啟用  [編輯] │
│  分析任務需求，輸出驗收標準                           │
│  使用於：標準開發流程、嚴謹開發流程                   │
├─────────────────────────────────────────────────────┤
│  執行者 (Executor)   [Claude / opus]  ● 啟用  [編輯] │
│  實作程式碼，完成開發任務                             │
│  使用於：標準開發流程                                 │
├─────────────────────────────────────────────────────┤
│  分析者-Gemini       [Gemini / 2.0-flash] ● 啟用 [編輯]│
│  使用 Gemini 進行需求分析，產出 diff                  │
│  使用於：Gemini 混合流程                              │
└─────────────────────────────────────────────────────┘

【編輯 Agent 介面】
┌─────────────────────────────────────────────────────┐
│  名稱：[執行者              ]                        │
│  描述：[實作程式碼，完成開發任務]                     │
│                                                     │
│  ── Model 設定 ──────────────────────────────────── │
│  Provider：  ● Claude   ○ Gemini                   │
│                                                     │
│  Model（選填，留空使用預設）：                        │
│  ┌──────────────────────────┐                       │
│  │ claude-opus-4-5          │  ← Claude 時為選填    │
│  └──────────────────────────┘                       │
│  常用：claude-opus-4-5 / claude-sonnet-4-6 / （空）  │
│                                                     │
│  ── 提示詞設定 ──────────────────────────────────── │
│  系統提示詞（角色定位）：                            │
│  ┌───────────────────────────────────────────────┐  │
│  │ 你是一位資深軟體工程師...                       │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  步驟提示詞模板：                                    │
│  ┌───────────────────────────────────────────────┐  │
│  │ 【工作目錄】                                    │  │
│  │ {projectPath}                                  │  │
│  │ ...                                            │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ⚠ 使用 Gemini 時，stepPrompt 應要求輸出             │
│    可執行的 shell script 或 unified diff             │
│                                                     │
│  可用變數：{projectPath} {testCommand} {userPrompt} │
│           {previousOutput} {acceptanceCriteria}     │
│           {lastError} {errorHistory} {currentRetry} │
│                                                     │
│  [儲存]  [取消]                                     │
└─────────────────────────────────────────────────────┘
```

**Model 選擇邏輯：**
- 選擇 `Claude`：Model ID 為選填，留空使用 claude CLI 預設模型；填入則帶 `--model` 參數
- 選擇 `Gemini`：Model ID 為必填，儲存時若為空則顯示錯誤；需在全域設定中配置 Gemini API Key

---

### 9.2 Pipeline 編輯器（Pipeline Editor）

**功能清單：**
- 檢視所有 Pipeline 列表
- 新增 Pipeline：設定名稱、選擇 fixerAgent、拖曳加入步驟
- 編輯 Pipeline：拖曳調整步驟順序、新增/刪除步驟、更換步驟的 Agent
- 設定預設 Pipeline：新專案自動套用
- 停用 Pipeline：停用後無法被新專案選用

**UI 設計（Pipeline 編輯器）：**

```
Pipeline 編輯器
─────────────────────────────────────────────────────
Pipeline 名稱：[標準開發流程              ]
描述：        [分析需求後執行，失敗由執行者修正]

執行步驟（拖曳排序）：
┌─────────────────────────────────────────────────────┐
│  ⠿  步驟 1  [分析者 ▼]  標籤：[需求分析（選填）]  [✕] │
│  ⠿  步驟 2  [執行者 ▼]  標籤：[程式實作（選填）]  [✕] │
└─────────────────────────────────────────────────────┘
[+ 新增步驟]

驗收失敗時的修正 Agent：
  [執行者 ▼]  ← 測試失敗時，由此 Agent 進行修正

[儲存]  [取消]
```

**步驟設定說明：**
- 每個步驟選擇一個 Agent，並可選填「步驟顯示標籤」（覆蓋 Agent 名稱，用於 UI 顯示）
- 步驟 Agent 與 fixerAgent 可以是同一個，也可以是不同的
- Pipeline 至少需要一個步驟

---

### 9.3 專案設定中的 Pipeline 選擇

建立或編輯專案時，可選擇要套用哪條 Pipeline：

```
新增專案
─────────────────────────────────────────────────────
專案名稱：  [my-web-app              ]
專案路徑：  [/home/user/projects/my-web-app]
測試指令：  [npm test                ]
描述：      [（選填）                 ]

執行流程：  [標準開發流程 ▼          ]
           ↳ 步驟預覽：需求分析 → 程式實作
           ↳ 修正 Agent：執行者

[建立專案]
```

---

## 10. 目錄結構

```
agent-flow/
├── api/                                  # Go 後端（獨立專案）
│   ├── cmd/
│   │   └── server/
│   │       └── main.go                   # 程式進入點
│   ├── internal/
│   │   ├── handler/                      # HTTP handlers（Fiber 路由）
│   │   │   ├── agents.go
│   │   │   ├── pipelines.go
│   │   │   ├── projects.go
│   │   │   ├── tasks.go
│   │   │   └── stream.go                 # SSE endpoint
│   │   ├── orchestrator/
│   │   │   └── orchestrator.go           # ★ 核心：Pipeline 狀態機
│   │   ├── runner/
│   │   │   ├── runner.go                 # ★ os/exec 呼叫 claude CLI
│   │   │   └── tester.go                 # 執行測試指令
│   │   ├── promptbuilder/
│   │   │   └── builder.go                # ★ 變數插值邏輯
│   │   ├── worker/
│   │   │   └── worker.go                 # Asynq Worker，取任務 → 呼叫 Orchestrator
│   │   ├── db/
│   │   │   ├── db.go                     # pgx 連線初始化
│   │   │   └── query/                    # sqlc 自動產生的 Go 程式碼
│   │   │       ├── agents.sql.go
│   │   │       ├── pipelines.sql.go
│   │   │       ├── tasks.sql.go
│   │   │       ├── execution_runs.sql.go
│   │   │       └── agent_logs.sql.go
│   │   ├── redis/
│   │   │   └── client.go
│   │   └── seed/
│   │       └── seed.go                   # 首次啟動建立預設 Agent + Pipeline
│   ├── migrations/                       # golang-migrate SQL 檔案
│   │   ├── 001_create_agents.up.sql
│   │   ├── 001_create_agents.down.sql
│   │   ├── 002_create_pipelines.up.sql
│   │   └── ...
│   ├── sql/                              # sqlc 查詢原始 SQL
│   │   ├── agents.sql
│   │   ├── pipelines.sql
│   │   ├── tasks.sql
│   │   └── ...
│   ├── sqlc.yaml                         # sqlc 設定（PostgreSQL + pgx）
│   ├── go.mod
│   └── go.sum
│
├── web/                                  # React 前端（獨立專案）
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Layout.tsx
│   │   │   ├── project/
│   │   │   │   ├── ProjectList.tsx
│   │   │   │   └── ProjectForm.tsx       # 含 Pipeline 選擇器
│   │   │   ├── task/
│   │   │   │   ├── TaskBoard.tsx
│   │   │   │   ├── TaskCard.tsx
│   │   │   │   ├── TaskDetail.tsx
│   │   │   │   ├── TaskForm.tsx
│   │   │   │   ├── AgentLogViewer.tsx
│   │   │   │   └── ExecutionTimeline.tsx
│   │   │   └── admin/
│   │   │       ├── AgentList.tsx
│   │   │       ├── AgentForm.tsx
│   │   │       ├── PipelineList.tsx
│   │   │       ├── PipelineEditor.tsx    # 拖曳排序（@dnd-kit）
│   │   │       └── PromptVariableHint.tsx
│   │   ├── hooks/
│   │   │   ├── useProjects.ts
│   │   │   ├── useTasks.ts
│   │   │   ├── useTaskStream.ts
│   │   │   ├── useAgents.ts
│   │   │   └── usePipelines.ts
│   │   ├── stores/
│   │   │   └── taskStore.ts
│   │   ├── lib/
│   │   │   └── api.ts
│   │   └── pages/
│   │       ├── ProjectsPage.tsx
│   │       ├── TasksPage.tsx
│   │       ├── AdminAgentsPage.tsx
│   │       └── AdminPipelinesPage.tsx
│   ├── index.html
│   └── package.json
│
├── docker-compose.yml
└── .env.example
```

---

## 11. API 設計

### Agents

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/agents` | 取得所有 Agent（含停用） |
| `POST` | `/api/agents` | 建立 Agent |
| `GET` | `/api/agents/:id` | 取得單一 Agent |
| `PUT` | `/api/agents/:id` | 更新 Agent（名稱、提示詞等） |
| `PUT` | `/api/agents/:id/toggle` | 啟用 / 停用 |
| `DELETE` | `/api/agents/:id` | 刪除（僅限未被 Pipeline 使用） |

**建立 / 更新 Agent 請求體：**
```json
{
  "name": "分析者",
  "description": "分析任務需求，輸出驗收標準",
  "modelProvider": "claude",
  "modelId": "",
  "systemPrompt": "你是一位資深技術分析師...",
  "stepPrompt": "【工作目錄】\n{projectPath}\n\n【任務需求】\n{userPrompt}\n..."
}
```

> **欄位說明：**
> - `modelProvider`：`"claude"` 或 `"gemini"`，預設 `"claude"`
> - `modelId`：Claude 時選填（空字串 = CLI 預設）；Gemini 時必填，例如 `"gemini-2.0-flash"`，若為空後端回傳 `422`

**Agent 回應格式（含 model 資訊）：**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "分析者-Gemini",
  "description": "使用 Gemini 進行需求分析",
  "modelProvider": "gemini",
  "modelId": "gemini-2.0-flash",
  "isActive": true,
  "usedInPipelines": 2,
  "createdAt": "2026-04-04T10:00:00Z"
}
```

---

### Pipelines

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/pipelines` | 取得所有 Pipeline |
| `POST` | `/api/pipelines` | 建立 Pipeline（含步驟） |
| `GET` | `/api/pipelines/:id` | 取得 Pipeline 詳情（含步驟與 Agent） |
| `PUT` | `/api/pipelines/:id` | 更新 Pipeline（名稱、fixerAgent、步驟順序） |
| `PUT` | `/api/pipelines/:id/default` | 設為預設 Pipeline |
| `DELETE` | `/api/pipelines/:id` | 刪除（僅限未被專案使用） |

**建立 Pipeline 請求體：**
```json
{
  "name": "標準開發流程",
  "description": "分析需求後執行，失敗由執行者修正",
  "fixerAgentId": "agent-uuid-executor",
  "steps": [
    { "agentId": "agent-uuid-analyzer", "order": 1, "label": "需求分析" },
    { "agentId": "agent-uuid-executor", "order": 2, "label": "程式實作" }
  ]
}
```

---

### Projects

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/projects` | 取得所有專案 |
| `POST` | `/api/projects` | 建立專案（含 pipelineId） |
| `GET` | `/api/projects/:id` | 取得專案詳情 |
| `PUT` | `/api/projects/:id` | 更新（可更換 Pipeline） |
| `DELETE` | `/api/projects/:id` | 刪除 |

---

### Tasks

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/projects/:projectId/tasks` | 取得專案任務列表 |
| `POST` | `/api/projects/:projectId/tasks` | 建立任務並入佇列 |
| `GET` | `/api/tasks/:id` | 取得任務詳情（含執行紀錄） |
| `PUT` | `/api/tasks/:id/cancel` | 取消任務 |
| `PUT` | `/api/tasks/:id/retry` | 重置失敗任務，重新入佇列 |
| `GET` | `/api/tasks/:id/runs` | 取得所有執行紀錄 |
| `GET` | `/api/tasks/:id/stream` | SSE 即時串流 |

**建立任務請求體：**
```json
{
  "prompt": "新增一個使用者登入功能，支援 email + 密碼驗證",
  "maxRetries": 5
}
```

**SSE 事件格式：**
```
event: step_start
data: {"stepOrder":1,"agentName":"分析者","label":"需求分析"}

event: log
data: {"type":"stdout","content":"分析任務中...","sequence":1}

event: step_done
data: {"stepOrder":1,"agentName":"分析者","success":true}

event: status
data: {"taskId":"xxx","status":"verifying","currentRetry":2}

event: done
data: {"taskId":"xxx","status":"done"}
```

---

## 12. 實作步驟

### 第一階段：基礎建設（Day 1-2）

**Step 1：Go 後端骨架**
```bash
mkdir -p agent-flow/api agent-flow/web
cd agent-flow/api
go mod init github.com/yourname/agent-flow
go get github.com/gofiber/fiber/v2
go get github.com/jackc/pgx/v5
go get github.com/hibiken/asynq
go get github.com/redis/go-redis/v9
go get github.com/golang-migrate/migrate/v4
```

**Step 2：PostgreSQL Migration**
```bash
# 安裝 golang-migrate CLI
# 撰寫 migrations/001_create_agents.up.sql 等 SQL 檔案
# 執行 migrate up
migrate -path ./migrations -database $DATABASE_URL up
```

**Step 3：sqlc 設定與產生**
```bash
# 撰寫 sql/ 目錄下的查詢 SQL
# sqlc.yaml 設定 engine: postgresql, driver: pgx/v5
sqlc generate
# 自動產生 internal/db/query/*.sql.go
```

**Step 4：Seed 資料**
```go
// internal/seed/seed.go
// 首次啟動時，若 agents 表為空，插入預設「分析者」+ 「執行者」Agent
// 以及「標準開發流程」Pipeline
```

**Step 5：CRUD API（Fiber handlers）**
```go
// 實作 /api/agents、/api/pipelines、/api/projects、/api/tasks
// Fiber 路由繫結 handler，handler 呼叫 sqlc 產生的 db query
```

---

### 第二階段：Agent 執行核心（Day 3-5）

**Step 6：promptbuilder.go**
```go
// strings.NewReplacer 批次替換所有 {變數}
// Build(agent Agent, vars PromptVars) string
```

**Step 7：ModelRunner 實作（claude + gemini）**
```bash
# 安裝 Gemini SDK
go get google.golang.org/genai

# 設定環境變數
GEMINI_API_KEY=your-api-key
```
```go
// internal/runner/claude.go
//   ClaudeRunner：os/exec 呼叫 claude CLI
//   - exec.CommandContext 設定 cwd + timeout
//   - 若 modelId != "" → 帶 --model 參數
//   - goroutine 讀取 stdout pipe，逐行寫入 DB + Redis pub/sub
//   - 超時後 SIGTERM

// internal/runner/gemini.go
//   GeminiRunner：google.golang.org/genai SDK
//   - genai.NewClient(ctx, option.WithAPIKey(os.Getenv("GEMINI_API_KEY")))
//   - 呼叫 GenerativeModel(opts.Agent.ModelID)
//   - 設定 SystemInstruction = agent.SystemPrompt
//   - GenerateContentStream 逐 chunk 寫入 DB + Redis pub/sub
//   - 呼叫後由 ShellExecutor 執行輸出中的 shell script / diff

// internal/runner/shell_executor.go
//   ShellExecutor：解析並執行 Gemini 輸出中的程式碼
//   - 正規表達式提取 ```bash...``` 或 ```diff...``` 區塊
//   - bash 區塊：exec.CommandContext + cwd = projectPath
//   - diff 區塊：exec patch 或純 Go 套用 unified diff
//   - 回傳合併後的 stdout 作為最終 RunResult.Output

// internal/runner/dispatcher.go
//   Dispatcher.Run()：依 opts.Agent.ModelProvider 分派
//   - claude → ClaudeRunner.Run()
//   - gemini → GeminiRunner.Run() → ShellExecutor.Execute()
```

**Step 8：Agent 建立驗證**
```go
// handler/agents.go — 建立 / 更新時後端驗證
// 若 modelProvider == "gemini" && modelId == "" → 回傳 422
// 若 modelProvider == "claude" → modelId 可為空字串

// 驗證可用變數（避免無效 {變數} 殘留）：
// 允許清單：{projectPath} {testCommand} {userPrompt}
//           {previousOutput} {allPreviousOutputs} {acceptanceCriteria}
//           {lastError} {errorHistory} {currentRetry} {maxRetries}
```

**Step 9：Asynq Worker + Orchestrator**
```go
// worker.go：asynq.NewServer + ServeMux，task type = "task:execute"
// orchestrator.go：讀取 pipelineSnapshot → 依序執行步驟 → 驗收循環
//   Orchestrator 持有 Dispatcher（實作 ModelRunner interface）
//   步驟中依 step.Agent.ModelProvider 自動選擇正確 runner
```

**Step 10：SSE endpoint（Fiber）**
```go
// GET /api/tasks/:id/stream
// c.Set("Content-Type", "text/event-stream")
// subscribe Redis pub/sub channel "task:<id>"
// goroutine 轉發訊息到 response，監聽 client disconnect
```

---

### 第三階段：前端介面（Day 7-10）

**Step 11：React 初始化 + 路由**
```bash
cd ../web
pnpm create vite . --template react-ts
pnpm add @tanstack/react-query zustand react-router-dom @dnd-kit/core
# 安裝 shadcn/ui
```
路由：
```
/                     → 專案列表
/projects/:id/tasks   → 任務看板
/admin/agents         → Agent 庫
/admin/pipelines      → Pipeline 編輯器
```

**Step 12：後台管理介面**
- `AdminAgentsPage`：Agent 列表 + CRUD，含 Model Provider 選擇器
  - 選 Claude 時 modelId 顯示「選填」placeholder
  - 選 Gemini 時 modelId 顯示「必填」並紅框提示，前端送出前本地驗證
- `PipelineEditor`：拖曳排序步驟（`@dnd-kit/core`）、選擇 fixerAgent
  - 步驟 Agent 選擇器顯示 Provider badge（Claude / Gemini）

**Step 13：任務看板與詳情**
- `TaskBoard`：Kanban，依狀態分欄
- `TaskDetail`：步驟進度條（Step N / N）+ 每步驟 SSE 即時輸出
- `AgentLogViewer`：終端機風格，多步驟 tab 切換，顯示每步驟使用的 Provider

---

### 第四階段：完善（Day 11-12）

**Step 14：Prompt 調優**
- 從後台直接修改 Agent 提示詞，觀察 JSON 解析成功率
- Gemini Agent 的 stepPrompt 測試 ShellExecutor 解析正確性（bash / diff 區塊）

**Step 15：邊界案例**
- 提示詞含非法變數：後端驗證 + 前端即時提示
- Pipeline 修改：快照機制確保不影響執行中任務
- 系統重啟：啟動時掃描 `status IN ('running','fixing','verifying')`，重新入佇列
- Gemini API Key 未設定：啟動時若有 Gemini Agent 被 Pipeline 使用，於 log 印出警告
- Gemini 輸出無可執行區塊：ShellExecutor 回傳錯誤，step 視為失敗，進入修正循環

**Step 16：一鍵啟動**
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:17-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: agent_flow
      POSTGRES_USER: agent_flow
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  api:
    build: ./api
    ports: ["3001:3001"]
    environment:
      - DATABASE_URL=postgres://agent_flow:secret@postgres:5432/agent_flow
      - REDIS_URL=redis://redis:6379
      - RUN_SEED=true
      - CLAUDE_TIMEOUT=10m
      - GEMINI_API_KEY=${GEMINI_API_KEY}   # 選填，僅使用 Gemini Agent 時需設定
    volumes:
      - /home:/home   # 掛載宿主機目錄，讓 claude 存取專案

  web:
    build: ./web
    ports: ["3000:3000"]
    environment:
      - VITE_API_URL=http://localhost:3001

volumes:
  pgdata:
```

---

## 13. 風險與對策

### 通用風險

| 風險 | 嚴重度 | 對策 |
|------|--------|------|
| Agent 提示詞語法錯誤（無效變數）| 高 | 後台儲存時驗證所有 `{變數}` 是否在允許清單內，並標記無效變數 |
| 分析節點輸出非 JSON | 高 | 正規表達式提取 → 寬鬆解析 → 失敗 3 次後標記 failed；後台可觀察到錯誤 |
| Pipeline 修改影響執行中任務 | 高 | 建立任務時儲存 `pipelineSnapshot`，執行時完全以快照為準 |
| Claude CLI 假死（無輸出） | 高 | 60 秒無輸出心跳偵測 → SIGTERM |
| fixerAgent 設定錯誤導致無法修正 | 中 | 後台驗證 fixerAgent 必須設定；提供「測試執行」功能 |
| 多任務並發消耗 API 配額 | 中 | Asynq `Concurrency: 1`（可調），加入速率限制 |
| SSE 長連線中斷 | 低 | 前端 `EventSource` 自動重連 + Last-Event-ID |
| 刪除被引用的 Agent | 低 | 刪除前檢查是否有 Pipeline 使用，若有則拒絕並列出引用清單 |

### Gemini 特有風險

| 風險 | 嚴重度 | 對策 |
|------|--------|------|
| `GEMINI_API_KEY` 未設定 | 高 | 啟動時檢查是否有 Gemini Agent 被啟用 Pipeline 使用，若有則在 log 印出警告，呼叫時立即回傳錯誤而非等到 API timeout |
| Gemini 輸出無 bash / diff 區塊 | 高 | ShellExecutor 找不到 code block 時回傳明確錯誤訊息，step 視為失敗進入修正循環；修正 Agent 的 stepPrompt 應明確要求重新輸出格式 |
| Gemini 輸出的 shell script 語法錯誤 | 高 | ShellExecutor 捕捉 exec 錯誤，將 stderr 附加至 step 輸出，提供修正 Agent 足夠上下文 |
| Gemini API 速率限制（RPM / TPM） | 中 | 同一 Gemini Agent 的並發請求受 `TASK_CONCURRENCY` 控制；可在 Dispatcher 加入 per-provider 限速器 |
| Gemini model_id 填寫已廢棄版本 | 中 | 後台儲存時不強制驗證 model 是否存在（model 清單頻繁更新）；首次呼叫若 404 則立即標記 step 失敗並顯示 Gemini 錯誤訊息 |
| Gemini Streaming 網路中斷 | 中 | `context.WithTimeout` 限制單次呼叫上限；斷線後 iter.Next() 回傳 error，視同 step 失敗 |
| Gemini 產出 shell script 執行危險指令（rm -rf 等）| 低 | 文件說明：Gemini Agent 的 prompt 設計必須明確限制可執行的指令範圍；ShellExecutor 可加入黑名單過濾（可選） |

---

## 附錄：環境變數

```bash
# api/.env.example

PORT=3001
DATABASE_URL=postgres://agent_flow:secret@localhost:5432/agent_flow
REDIS_URL=redis://localhost:6379
RUN_SEED=true                  # 首次啟動建立預設 Agent + Pipeline

CLAUDE_TIMEOUT=10m             # 單次 Agent 呼叫逾時（Go time.Duration 格式）
CLAUDE_DEFAULT_MAX_RETRIES=5   # 全域預設最大修正重試次數
TASK_CONCURRENCY=1             # Asynq Worker 並發數（預設 1，避免 API 限速）

# Gemini 相關（選填，僅使用 Gemini Agent 時需設定）
GEMINI_API_KEY=                # Google AI Studio 或 Vertex AI API Key
GEMINI_TIMEOUT=5m              # Gemini API 呼叫逾時（預設與 CLAUDE_TIMEOUT 相同）
```

```bash
# web/.env.example

VITE_API_URL=http://localhost:3001
```

---

*文件版本：2.2*
*更新日期：2026-04-04*
*主要變更：後端改為 Go + Fiber，資料庫改為 PostgreSQL 17（JSONB）+ sqlc，任務佇列改為 Asynq，新增多 Model Provider 支援（Claude CLI + Gemini API），ModelRunner interface 抽象層，ShellExecutor 兩段式執行，Gemini 風險矩陣*
