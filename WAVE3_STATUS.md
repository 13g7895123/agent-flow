# Wave 3 進度與交接

> 更新日期：2026-06-03
> 對應文件：`FRONTEND_RUST_ROADMAP.md` → Wave 3（Queue / Runner / SSE / Rust unit tests）

## 目前狀態總覽

| Track | 名稱 | 狀態 | 位置 |
| --- | --- | --- | --- |
| W3-TA | Queue / Worker | ✅ 已完成並合入 main（已修復 6 處編譯錯誤） | `main` |
| W3-TB | Claude Runner | ✅ 已完成並合入 main | `main`（隨 W3-TA commit 一併進入） |
| W3-TD | Rust Unit Tests | ✅ 已補完並合入 main（config / queue payload / status transition） | `main` |
| W3-TC | SSE Publisher / Stream | 🔶 **已在 worktree 完成，但尚未檢查、尚未合入** | worktree `w3tc`（branch `worktree-w3-tc`） |

驗證基準（main 目前）：`cargo build` 通過、`cargo test` 22 passed、`cargo fmt --check` 通過。

## W3-TC 現況

W3-TC 的程式碼**已經寫好**，放在 worktree：

- 路徑：`.claude/worktrees/w3tc`
- 分支：`worktree-w3-tc`（HEAD 仍停在 `e6e511f`，即 W2 完成點）
- 狀態：變更尚未 commit（在工作區）

已變更／新增的檔案（W3-TC 本身的成果）：

- `backend-rust/src/events.rs`（新增）— `TaskEvent` 事件型別
- `backend-rust/src/api/mod.rs` — `task_stream` 改用 `axum ... Sse` + `tokio_stream::BroadcastStream`
- `backend-rust/src/app_state.rs` — 事件發佈機制
- `backend-rust/src/domain/mod.rs`
- `backend-rust/src/lib.rs`
- `backend-rust/Cargo.toml` — 新增 `tokio-stream` 依賴

## 下一步：檢查 W3-TC

**下一步要做的事 = 檢查 W3-TC 這份 worktree 成果，確認與文件相符後再合入 main。**

檢查時要注意的重點：

1. **分支落後 main**：`worktree-w3-tc` 的 HEAD（`e6e511f`）還沒有 W3-TA/TB/TD 的成果。
   直接 diff main 會看到大量「deletions」，那是因為該分支根本還沒有那些檔案，
   **不是** W3-TC 刪掉它們。合入時需先 rebase 到最新 main，會與既有的
   `api/mod.rs`、`app_state.rs`、`lib.rs`、`Cargo.toml` 產生衝突，需逐一解。

2. **對照文件 W3-TC 交付物**（`FRONTEND_RUST_ROADMAP.md`）：
   - Redis pub/sub publisher
   - `GET /api/tasks/:id/stream`
   - SSE event 格式
   - 完成標準：前端可看到 live stdout/stderr；斷線可重連。

3. **目前 main 的 `task_stream` 只是佔位**（僅回 SSE header `: connected`），
   W3-TC 要把它換成真正的 broadcast/Redis pub-sub 串流。

4. 合入後需重跑：`cargo build`、`cargo test`、`cargo fmt --check`，
   並確認 `redis`/`tokio-stream` 依賴版本與 main 一致。

## 環境備註

本機原有的系統 Rust 是 1.75.0（過舊，無法編譯依賴樹）。已用 rustup 安裝較新 stable
（rustc 1.96.0）於使用者目錄，後續編譯/測試請使用 `~/.cargo/bin` 下的工具鏈：

```bash
export PATH="$HOME/.cargo/bin:$PATH"
```
