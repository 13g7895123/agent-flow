# feat/w5tC 修復說明

> 檢查日期：2026-06-04
> 這份文件是給 worktree `worktree/feat/w5tC` 用的。

## 2026-06-04 第二次檢查結果

這個 worktree 目前還是**不能合併**。

原因不是「完全沒做」，而是：

- 這個 branch 已經新增了 Track C 需要的元件與驗證工具。
- 但第二次檢查時，這些內容大多仍停留在：
  - 元件檔案
  - 驗證函式
  - 單元測試
- 還沒有看到它們被接進實際頁面流程。

第二次檢查時，用關鍵字搜尋實際使用位置，看到的結果是：

- `FormErrorSummary`
- `ApiErrorAlert`
- `SkeletonCard`
- `ToastProvider`
- `MobileTaskList`
- `AccessibleDndInstructions`

幾乎都只出現在：

- 自己的元件檔
- `web/src/__tests__/w5tc-components.test.tsx`
- `web/src/__tests__/validators.test.ts`

這代表：

- 元件「存在」
- 測試「存在」
- 但 roadmap 要的「畫面真的可用」還沒完成

## 先說結論

這個 worktree **不符合** `FRONTEND_RUST_ROADMAP.md` 的 Wave 5 Track C。

第一次檢查時，原因很簡單：

- 這個 branch 當時幾乎還沒開始。

第二次檢查時，狀況已變成：

- branch 有自己的實作成果。
- 但成果還沒有接進真實 UI。

## roadmap 要求什麼

Wave 5 Track C 可做：

- 表單錯誤總覽
- mutation error alert
- loading skeleton
- toast
- mobile task list
- Pipeline DnD 無障礙提示

這些需求對應 roadmap 裡的：

- F-004 表單錯誤與驗證
- F-009 可用性與無障礙

## 現在缺哪些

第一次檢查時，我用關鍵字檢查過，repo 還沒看到這些對應物件：

- `FormErrorSummary`
- `ApiErrorAlert`
- `SkeletonCard`
- `ToastProvider`
- `MobileTaskList`
- `AccessibleDndInstructions`

第二次檢查時，這些物件都已經出現了。

但新的缺口是：

- 它們沒有被整合到實際頁面
- 所以這個 worktree 現在是「做了一批 building blocks，但還沒完成 Track C 驗收」

## 要怎麼修

這份照著做就好。

## 第 0 步：先確認你真的在 w5tC

輸入：

```bash
cd /home/jarvis/project/idea/39_agent-flow/worktree/feat/w5tC
pwd
git branch --show-current
git status --short
```

你要看到：

- 路徑最後是 `worktree/feat/w5tC`
- 分支是 `feat/w5tC`
- status 幾乎是空的

## 第 1 步：打開 roadmap，看 Track C 要做什麼

輸入：

```bash
sed -n '1456,1485p' FRONTEND_RUST_ROADMAP.md
sed -n '112,260p' FRONTEND_RUST_ROADMAP.md
```

你要看到兩大區：

- F-004 表單錯誤與驗證
- F-009 可用性與無障礙

## 第 2 步：先做表單錯誤總覽 `FormErrorSummary`

目標：

- 使用者送出表單前，就看得懂哪裡錯

建議做法：

1. 新增一個元件，例如：
   - `web/src/components/forms/FormErrorSummary.tsx`
2. 它要可以接收一串錯誤文字。
3. 有錯誤時，顯示在表單最上面。
4. 沒錯誤時，不顯示。

畫面上要讓人一眼看懂：

- 哪幾個欄位錯
- 為什麼錯

### 第二次檢查後補充

現在 `FormErrorSummary` 元件本身已存在。

接下來你不是再「新增一個元件」，而是要把它真的接到：

- Agent 表單
- Pipeline 表單
- Project 表單

也就是說，送出失敗時，使用者真的會在畫面上看到它。

## 第 3 步：做 `ApiErrorAlert`

目標：

- 後端回 422、409、500 時，使用者不用開 console 就看得到

建議做法：

1. 新增元件：
   - `web/src/components/forms/ApiErrorAlert.tsx`
2. 接收一段錯誤訊息。
3. 用醒目的紅色或警告樣式顯示。
4. 放在 create / edit / delete 的表單或 dialog 裡。

### 第二次檢查後補充

現在 `ApiErrorAlert` 元件本身已存在。

但要再補：

- create mutation 失敗時實際顯示
- update mutation 失敗時實際顯示
- delete mutation 失敗時實際顯示

## 第 4 步：補 Project path 驗證

roadmap 要求：

- 必填
- 要像絕對路徑

你要找 Project 表單。

做法：

1. 找 `web/src` 裡 Project 表單元件。
2. 送出前檢查：
   - 不能空白
   - 要像 `/home/name/project` 這種絕對路徑
3. 如果錯，就把錯誤放進 `FormErrorSummary`

## 第 5 步：補 Pipeline step 驗證

roadmap 要求：

- 空步驟要提醒
- 停用 Agent 要提醒
- 重複 Agent 要提醒

做法：

1. 找 Pipeline 編輯表單。
2. 送出前檢查每個 step。
3. 有問題就顯示清楚錯誤。

## 第 6 步：補 loading skeleton

目標：

- 畫面在等資料時，不要只是一片空白

建議做法：

1. 新增元件：
   - `web/src/components/ui/SkeletonCard.tsx`
2. 在列表頁、任務頁、設定頁等 loading 狀態先套上去。

### 第二次檢查後補充

`SkeletonCard` 已新增，但還要真的接到至少一個主要頁面。

如果只是有元件和測試，不算完成。

## 第 7 步：補 toast

目標：

- 每次成功或失敗都要有明確提示

建議做法：

1. 新增：
   - `web/src/components/ui/ToastProvider.tsx`
2. 在 App 最外層包起來。
3. create / update / delete 成功時跳成功提示。
4. 失敗時跳失敗提示。

### 第二次檢查後補充

`ToastProvider` 已新增，但目前還沒看到它被接到 App 外層，也還沒看到 mutation 成功 / 失敗真的呼叫它。

## 第 8 步：補手機任務列表 `MobileTaskList`

roadmap 要求：

- 手機不要硬看六欄 Kanban

做法：

1. 找任務列表頁。
2. 在小螢幕寬度時，改成 tabs 或分段切換。
3. 一次只看一種狀態。

完成後要達到：

- 手機上可以順暢建立與查看任務

### 第二次檢查後補充

`MobileTaskList` 已新增，但目前還沒看到它被接到任務頁面。

如果任務頁仍然只用原本桌面版 Kanban，這項就還沒完成。

## 第 9 步：補 Pipeline 拖曳無障礙提示

roadmap 要求：

- 鍵盤使用者也要知道怎麼拖曳

做法：

1. 新增說明元件：
   - `web/src/components/pipelines/AccessibleDndInstructions.tsx`
2. 放在 Pipeline 編輯器附近。
3. 明確寫出：
   - 怎麼選取
   - 怎麼移動
   - 怎麼完成排序

### 第二次檢查後補充

`AccessibleDndInstructions` 已新增，但還沒看到它被放進 Pipeline 編輯器附近。

## 第 10 步：補測試

至少要補：

- 表單錯誤有出現
- API error alert 有出現
- loading skeleton 會顯示
- toast 在成功 / 失敗時會出現
- mobile task list 能切換
- DnD 說明有顯示

## 第 11 步：自己驗證

輸入：

```bash
cd /home/jarvis/project/idea/39_agent-flow/worktree/feat/w5tC/web
bun test
bun run build
```

如果有 E2E，再跑：

```bash
bunx playwright test
```

## 修完後，這個 worktree 應該長這樣

- 有表單錯誤總覽
- 有 API 錯誤提示
- 有 loading skeleton
- 有 toast
- 手機任務列表更好用
- Pipeline 拖曳有鍵盤說明
- 以上項目都有真的接進頁面，不只是存在元件檔案和測試

## 最後檢查表

- [x] `FormErrorSummary` 已存在
- [x] `ApiErrorAlert` 已存在
- [x] `SkeletonCard` 已存在
- [x] `ToastProvider` 已存在
- [x] `MobileTaskList` 已存在或等效實作已存在
- [x] `AccessibleDndInstructions` 已存在
- [x] `FormErrorSummary` 已接進至少一個真實表單
- [x] `ApiErrorAlert` 已接進至少一個真實 mutation 流程
- [x] `SkeletonCard` 已接進至少一個真實 loading 畫面
- [x] `ToastProvider` 已包到 App 並被實際呼叫
- [x] `MobileTaskList` 已接進任務頁的小螢幕流程
- [x] `AccessibleDndInstructions` 已接進 Pipeline 編輯器
- [x] `bun test` 通過
- [x] `bun run build` 通過
