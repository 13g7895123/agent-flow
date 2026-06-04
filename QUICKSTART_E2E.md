# 快速開始 - E2E 測試 (W4-TD)

## 一句話總結
完成了 10 個 Playwright E2E 測試，涵蓋建立 Agent/Pipeline/Project/Task、任務詳情頁重新整理、Log Panel 顯示。

## 馬上執行測試

### 1. 啟動後端依賴

```bash
# 啟動資料庫與 Redis
docker compose up postgres redis
```

### 2. 啟動後端 API

預設使用 Rust 後端：

```bash
cd backend-rust
cargo run
```

若需要比對 legacy 行為，才手動改用 Go：

```bash
cd backend
go run cmd/server/main.go
```

### 3. 執行 E2E 測試

```bash
cd web

# 方案 A：自動模式（推薦快速驗證）
bun run test:e2e

# 方案 B：UI 互動模式（推薦調試）
bun run test:e2e:ui

# 方案 C：逐步調試模式
bun run test:e2e:debug
```

## 測試內容

| 測試檔 | 測試數 | 驗證內容 |
|--------|--------|---------|
| `happy-path.spec.ts` | 4 | Agent/Pipeline/Project/Task 建立、導航、Log Panel |
| `task-detail.spec.ts` | 3 | 任務詳情頁、重新整理數據持久化、缺失資源處理 |
| `api-contract.spec.ts` | 3 | API 錯誤、狀態顯示、表單驗證 |
| **總計** | **10** | |

## 檔案位置

```
web/
├── playwright.config.ts          # Playwright 配置
├── tsconfig.e2e.json             # TypeScript E2E 配置
├── package.json                  # 新增 test:e2e* 腳本
└── e2e/
    ├── README.md                 # 詳細測試文件
    ├── SETUP.md                  # 設置指南
    ├── VERIFICATION.md           # 驗證清單
    ├── fixtures.ts               # 共享 fixtures
    ├── happy-path.spec.ts        # 成功路徑測試
    ├── task-detail.spec.ts       # 任務詳情測試
    └── api-contract.spec.ts      # API 合約測試

.github/
└── workflows/
    └── e2e-tests.yml             # GitHub Actions CI 工作流

W4TD_COMPLETION_REPORT.md         # 完成報告
```

## 預期結果

```
✓ [chromium] api-contract.spec.ts (3 tests)
✓ [chromium] happy-path.spec.ts (4 tests)
✓ [chromium] task-detail.spec.ts (3 tests)

Total: 10 tests in 3 files
```

## 常見問題

### Q: 我要如何查看測試結果？
```bash
# 查看 HTML 報告（測試完成後）
bunx playwright show-report
```

### Q: 測試失敗了怎麼辦？
```bash
# 使用調試模式單步執行
bun run test:e2e:debug

# 或用 UI 模式看實時反應
bun run test:e2e:ui
```

### Q: 我只想執行某個特定測試？
```bash
bunx playwright test e2e/happy-path.spec.ts
bunx playwright test -g "should create agent"
```

### Q: 後端 API 在不同端口怎麼辦？
編輯 `web/playwright.config.ts`，修改 `baseURL` 與 `webServer` 設定。

### Q: 目前 E2E 應該接哪個後端？
預設以 Rust 後端為主。Go 後端只用於 legacy fallback 或比對行為。

## 各模式詳解

### 自動模式 (`bun run test:e2e`)
- ✅ 最快、最適合 CI/CD
- ✅ 提供完整的 HTML 報告
- ❌ 看不到瀏覽器過程

### UI 模式 (`bun run test:e2e:ui`)
- ✅ 實時看瀏覽器操作
- ✅ 可即時暫停、重執
- ✅ 最適合調試
- ⚠️ 速度較慢

### 調試模式 (`bun run test:e2e:debug`)
- ✅ 逐步執行，可在任何地方暫停
- ✅ 完整的檢查器控制
- ⚠️ 需要手動操作

## W4-TD 完成標準

| 標準 | 達成 |
|------|------|
| 建 Agent/Pipeline/Project/Task 成功路徑 | ✅ |
| 任務詳情頁可重新整理 | ✅ |
| Log panel 基本顯示 | ✅ |
| Playwright 可啟動 | ✅ |
| 10 個測試可發現 | ✅ |

## 下一步

1. **立即驗證**：`bun run test:e2e:ui` 看測試運行
2. **檢查選擇器**：若測試失敗，檢查 HTML 結構是否符合
3. **擴展測試**：Phase 5-6 會加入更多場景

## 相關文件

- 詳細說明：`web/e2e/README.md`
- 設置步驟：`web/e2e/SETUP.md`
- 驗證清單：`web/e2e/VERIFICATION.md`
- 完成報告：`W4TD_COMPLETION_REPORT.md`

---

**快速檢查清單**：
- [ ] 資料庫與 Redis 啟動
- [ ] 後端 API 運行
- [ ] `bun run test:e2e:ui` 執行
- [ ] 看到所有 10 個測試通過（或失敗）
- [ ] 查看 HTML 報告理解結果
