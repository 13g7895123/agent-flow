---
name: zh-tw-conventional-commits
description: Use when writing git commit messages for this repo. Enforces Conventional Commits while requiring the subject and optional body/footer prose to be written in Traditional Chinese used in Taiwan.
---

# zh-TW Conventional Commits

在這個 repo 撰寫 git commit message 時，統一遵守以下規則：

- 使用 `Conventional Commits` 格式：`type(scope): subject`
- `type` 與 `scope` 使用小寫英文。
- `subject` 與內文使用 `zh-TW`，採繁體中文。
- 主旨要簡短明確，描述這次變更，不加句號。

## 常用類型

- `feat`：新功能
- `fix`：修正錯誤
- `refactor`：重構
- `docs`：文件調整
- `test`：測試調整
- `chore`：例行維護
- `perf`：效能改善
- `build`：建置流程或依賴調整
- `ci`：CI/CD 調整

## 撰寫規則

- 沒有明確 scope 時可省略，格式改為 `type: subject`。
- 若有破壞性變更，使用 `type(scope)!: subject`，並在 footer 補上 `BREAKING CHANGE:` 說明。
- 英文專有名詞可保留原文，但句子主體仍以 `zh-TW` 表達。
- 同一次 commit 不要混用多種格式。

## 範例

- `feat(auth): 新增使用者登入重試機制`
- `fix(api): 修正任務列表回傳空值時的顯示錯誤`
- `docs: 更新 worktree 操作說明`
- `refactor(runner): 拆分派發流程以降低耦合`

## 提交前檢查

- 格式是否符合 Conventional Commits
- 主旨是否為繁體中文
- `type` 是否正確反映變更性質
- 需要時是否補上 scope 或 breaking change 說明
