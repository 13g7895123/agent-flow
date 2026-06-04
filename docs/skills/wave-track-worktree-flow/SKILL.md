---
name: wave-track-worktree-flow
description: Use before any development session in this repo, especially for wave/track tasks such as wave4 trackA, w4tA, or similar requests that require a git worktree-first workflow, exact file comparison before commit, and no automatic merge/main-branch development.
---

# Wave/Track Worktree Flow

每次開發前都先讀這份規則。遇到 wave/track 任務時，先遵守以下流程，不可跳步：

1. 先辨識任務是否屬於 wave/track 類型，例如 `wave4 trackA`、`w4tA`、或其他同義寫法。
2. 若目前在主分支，先建立 git worktree，再開始任何修改。
3. worktree 先建立再開工，建議直接使用 `git worktree add ./worktree/feat/w4tA -b feat/w4tA` 這種形式，建立在專案目錄的 `worktree` 子目錄中，讓 worktree 與分支都維持 `feat/w4tA` 的命名語意；不要直接在主分支開發。
4. 完成實作後，先把成果與任務指定的那份文件做完整比對，確認內容完全相符，才允許 commit。
5. 不要自動 merge、不要自動完成合併、也不要把變更直接提交到主分支。

## 標準做法

- 建立 worktree 時，優先讓 worktree 與分支名稱都對應到 `feat/w4tA`，且所有 worktree 都建立在專案根目錄的 `worktree` 子目錄中。
- 例如：`git worktree add ./worktree/feat/w4tA -b feat/w4tA`。
- 若需要命名 worktree 目錄，使用與任務一致、可辨識的名稱，但核心要求是先進 worktree 再動手。
- 驗證時，以 `diff` 或 `cmp` 做逐字比對；若不一致，繼續修正，不可先 commit。
- commit 只在比對完全一致後執行。

## 禁止事項

- 不可直接在 `main` / `master` / 任何主線分支上開發。
- 不可略過 worktree 直接修改。
- 不可在未完成比對前 commit。
- 不可自動 merge 回主線。

