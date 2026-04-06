import { useState } from 'react'
import { Plus, Bot, Pencil, Trash2, Power } from 'lucide-react'
import {
  useAgents, useCreateAgent, useUpdateAgent,
  useToggleAgent, useDeleteAgent,
} from '@/hooks/useAgents'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ProviderBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn, PROMPT_VARIABLES } from '@/lib/utils'
import type { Agent, AgentFormData, ModelProvider } from '@/types'

const defaultForm: AgentFormData = {
  name: '',
  description: '',
  modelProvider: 'claude',
  modelId: '',
  systemPrompt: '',
  stepPrompt: '',
}

// ── Prompt variable hint ──────────────────────────────────────────────────

function PromptVariableHint({ onClick }: { onClick: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {PROMPT_VARIABLES.map(v => (
        <button
          key={v}
          type="button"
          onClick={() => onClick(v)}
          className="text-xs px-2 py-0.5 rounded-full font-mono bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent)] hover:text-white transition-colors duration-150 cursor-pointer"
        >
          {v}
        </button>
      ))}
    </div>
  )
}

// ── Agent Form ─────────────────────────────────────────────────────────────

function AgentForm({
  initial, onSubmit, loading,
}: {
  initial?: AgentFormData
  onSubmit: (data: AgentFormData) => void
  loading?: boolean
}) {
  const [form, setForm] = useState<AgentFormData>(initial ?? defaultForm)
  const [errors, setErrors] = useState<Partial<Record<keyof AgentFormData, string>>>({})

  const set = <K extends keyof AgentFormData>(k: K, v: AgentFormData[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const insertVar = (field: 'systemPrompt' | 'stepPrompt', v: string) =>
    set(field, form[field] + v)

  const validate = () => {
    const e: typeof errors = {}
    if (!form.name.trim())         e.name = '請輸入名稱'
    if (!form.systemPrompt.trim()) e.systemPrompt = '請輸入系統提示詞'
    if (!form.stepPrompt.trim())   e.stepPrompt = '請輸入步驟提示詞'
    if (form.modelProvider === 'gemini' && !form.modelId.trim())
      e.modelId = 'Gemini 必須填寫 Model ID（例如 gemini-2.0-flash）'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="名稱" required
          value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="分析者"
          error={errors.name}
        />
        <Input
          label="描述"
          value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="分析任務需求，輸出驗收標準"
        />
      </div>

      {/* Model settings */}
      <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 flex flex-col gap-4">
        <p className="text-sm font-medium">Model 設定</p>
        <div className="flex gap-3">
          {(['claude', 'gemini'] as ModelProvider[]).map(p => (
            <label key={p} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value={p}
                checked={form.modelProvider === p}
                onChange={() => set('modelProvider', p)}
                className="accent-[var(--color-accent)]"
              />
              <span className="text-sm capitalize">{p === 'claude' ? 'Claude' : 'Gemini'}</span>
            </label>
          ))}
        </div>
        <Input
          label={form.modelProvider === 'gemini' ? 'Model ID（必填）' : 'Model ID（選填）'}
          required={form.modelProvider === 'gemini'}
          value={form.modelId} onChange={e => set('modelId', e.target.value)}
          placeholder={
            form.modelProvider === 'gemini'
              ? 'gemini-2.0-flash'
              : '留空使用 claude 預設，或填入 claude-sonnet-4-6'
          }
          error={errors.modelId}
        />
        {form.modelProvider === 'gemini' && (
          <p className="text-xs text-[var(--color-status-fixing)] bg-[var(--color-status-fixing)]/10 px-3 py-2 rounded-[var(--radius-sm)]">
            Gemini Agent 的步驟提示詞應要求輸出可執行的 shell script 或 unified diff，由後端 ShellExecutor 代為執行。
          </p>
        )}
      </div>

      {/* System Prompt */}
      <div>
        <Textarea
          label="系統提示詞（角色定位）" required
          value={form.systemPrompt}
          onChange={e => set('systemPrompt', e.target.value)}
          placeholder="你是一位資深軟體工程師，擅長分析需求並精確制定可執行的驗收標準..."
          rows={4}
          error={errors.systemPrompt}
        />
      </div>

      {/* Step Prompt */}
      <div>
        <Textarea
          label="步驟提示詞模板" required
          value={form.stepPrompt}
          onChange={e => set('stepPrompt', e.target.value)}
          placeholder={`【工作目錄】\n{projectPath}\n\n【任務需求】\n{userPrompt}`}
          rows={6}
          error={errors.stepPrompt}
          helper="點擊下方變數可快速插入"
        />
        <PromptVariableHint onClick={v => insertVar('stepPrompt', v)} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={loading}>
          {initial ? '儲存變更' : '建立 Agent'}
        </Button>
      </div>
    </form>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function AdminAgentsPage() {
  const { data: agents = [], isLoading } = useAgents()
  const create = useCreateAgent()
  const update = useUpdateAgent()
  const toggle = useToggleAgent()
  const del    = useDeleteAgent()

  const [createOpen,   setCreateOpen]   = useState(false)
  const [editTarget,   setEditTarget]   = useState<Agent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null)

  const handleCreate = (data: AgentFormData) => {
    create.mutate(data, { onSuccess: () => setCreateOpen(false) })
  }

  const handleUpdate = (data: AgentFormData) => {
    if (!editTarget) return
    update.mutate({ id: editTarget.id, data }, { onSuccess: () => setEditTarget(null) })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    del.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <span className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold">Agent 庫</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">管理可重複使用的 AI Agent</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> 新增 Agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="還沒有 Agent"
          description="建立 Agent，定義 AI 的角色與提示詞"
          action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> 新增 Agent</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {agents.map(agent => (
            <div
              key={agent.id}
              className={cn(
                'bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-5',
                'transition-all duration-150',
                !agent.isActive && 'opacity-50',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold">{agent.name}</h2>
                    <ProviderBadge provider={agent.modelProvider} />
                    {agent.modelId && (
                      <span className="text-xs text-[var(--color-muted)] font-mono">{agent.modelId}</span>
                    )}
                    {!agent.isActive && (
                      <span className="text-xs text-[var(--color-muted)]">（已停用）</span>
                    )}
                  </div>
                  {agent.description && (
                    <p className="text-sm text-[var(--color-muted)] mt-1">{agent.description}</p>
                  )}
                  {agent.usedInPipelines > 0 && (
                    <p className="text-xs text-[var(--color-muted)] mt-2">
                      使用於 {agent.usedInPipelines} 個 Pipeline
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggle.mutate(agent.id)}
                    className={cn(
                      'p-2 rounded-[var(--radius-md)] transition-colors duration-150 cursor-pointer',
                      agent.isActive
                        ? 'text-[var(--color-accent)] hover:bg-[var(--color-surface-2)]'
                        : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]',
                    )}
                    aria-label={agent.isActive ? '停用 Agent' : '啟用 Agent'}
                  >
                    <Power size={15} />
                  </button>
                  <button
                    onClick={() => setEditTarget(agent)}
                    className="p-2 rounded-[var(--radius-md)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] transition-colors cursor-pointer"
                    aria-label="編輯 Agent"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(agent)}
                    disabled={agent.usedInPipelines > 0}
                    className="p-2 rounded-[var(--radius-md)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-destructive)] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="刪除 Agent"
                    title={agent.usedInPipelines > 0 ? '此 Agent 正被 Pipeline 使用，無法刪除' : '刪除 Agent'}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="新增 Agent" size="lg">
        <AgentForm onSubmit={handleCreate} loading={create.isPending} />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="編輯 Agent" size="lg">
        {editTarget && (
          <AgentForm
            initial={{
              name: editTarget.name,
              description: editTarget.description,
              modelProvider: editTarget.modelProvider,
              modelId: editTarget.modelId,
              systemPrompt: editTarget.systemPrompt,
              stepPrompt: editTarget.stepPrompt,
            }}
            onSubmit={handleUpdate}
            loading={update.isPending}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="刪除 Agent"
        message={`確定要刪除「${deleteTarget?.name}」嗎？此操作無法復原。`}
        loading={del.isPending}
      />
    </div>
  )
}
