---
name: skill-location-policy
description: Use when creating, moving, or updating repository-local skills in this repo. Enforces that all repo-managed skills live under docs/skills and not in other directories.
---

# Skill Location Policy

在這個 repo 內建立或調整 skill 時，統一遵守以下規則：

- 所有 repo-local skill 一律放在 `docs/skills/<skill-name>/`。
- 每個 skill 至少要有 `SKILL.md`，需要 UI metadata 時再加上 `agents/openai.yaml`。
- 不要把新的 skill 放到 `docs/skill`、根目錄、或其他任意資料夾。
- 如果 repo 內已經存在其他位置的舊 skill，除非使用者明確要求，否則不要順手搬移。

## 建立流程

1. 先決定符合用途的 skill 名稱，使用小寫英文與連字號。
2. 在 `docs/skills/<skill-name>/` 建立 skill 目錄。
3. 新增 `SKILL.md`；若需要 skill 清單顯示，再新增 `agents/openai.yaml`。
4. 完成後確認新增檔案都位於 `docs/skills/` 之下。

## 驗證

- 檢查新建 skill 的路徑是否為 `docs/skills/<skill-name>/`。
- 若任務要求「建立 skill」但未指定路徑，預設仍使用 `docs/skills/`。
