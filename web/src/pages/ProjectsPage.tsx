import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderOpen, Pencil, Trash2, ChevronRight } from 'lucide-react'
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject } from '@/hooks/useProjects'
import { usePipelines } from '@/hooks/usePipelines'
import { useToast } from '@/components/ui/ToastProvider'
import { FormErrorSummary } from '@/components/forms/FormErrorSummary'
import { ApiErrorAlert } from '@/components/forms/ApiErrorAlert'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatRelative } from '@/lib/utils'
import type { Project, ProjectFormData } from '@/types'

const defaultForm: ProjectFormData = { name: '', path: '', testCommand: '', pipelineId: '' }

export function ProjectForm({
  initial, onSubmit, loading,
}: {
  initial?: ProjectFormData
  onSubmit: (data: ProjectFormData) => void
  loading?: boolean
}) {
  const [form, setForm] = useState<ProjectFormData>(initial ?? defaultForm)
  const [errors, setErrors] = useState<Partial<ProjectFormData>>({})
  const [apiError, setApiError] = useState<string>('')
  const { data: pipelines = [] } = usePipelines()
  const toast = useToast()

  const set = (k: keyof ProjectFormData, v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Partial<ProjectFormData> = {}
    if (!form.name.trim())       e.name       = '請輸入專案名稱'
    if (!form.path.trim())       e.path       = '請輸入專案路徑'
    if (!form.path.trim().startsWith('/')) e.path = '專案路徑必須是絕對路徑，如 /home/user/project'
    if (!form.pipelineId)        e.pipelineId = '請選擇 Pipeline'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setApiError('')
    if (validate()) {
      try {
        onSubmit(form)
        toast.addToast(
          initial ? '專案已更新' : '專案已建立',
          'success'
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : '發生錯誤'
        setApiError(message)
        toast.addToast(message, 'error')
      }
    }
  }

  const errorMessages = Object.values(errors).filter(Boolean) as string[]

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {apiError && <ApiErrorAlert error={apiError} onDismiss={() => setApiError('')} />}
      {errorMessages.length > 0 && <FormErrorSummary errors={errorMessages} />}
      <Input
        label="專案名稱" required
        value={form.name} onChange={e => set('name', e.target.value)}
        placeholder="My Awesome Project"
        error={errors.name}
      />
      <Input
        label="專案路徑" required
        value={form.path} onChange={e => set('path', e.target.value)}
        placeholder="/home/user/projects/my-project"
        helper="本地絕對路徑，Agent 執行時的工作目錄"
        error={errors.path}
      />
      <Input
        label="測試指令"
        value={form.testCommand} onChange={e => set('testCommand', e.target.value)}
        placeholder="pnpm test"
        helper="驗收時執行的指令，留空則跳過驗收"
      />
      <Select
        label="執行 Pipeline" required
        value={form.pipelineId} onChange={e => set('pipelineId', e.target.value)}
        error={errors.pipelineId}
      >
        <option value="">請選擇...</option>
        {pipelines.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}{p.isDefault ? ' (預設)' : ''}
          </option>
        ))}
      </Select>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={loading}>
          {initial ? '儲存變更' : '建立專案'}
        </Button>
      </div>
    </form>
  )
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: projects = [], isLoading } = useProjects()
  const create = useCreateProject()
  const update = useUpdateProject()
  const del    = useDeleteProject()

  const [createOpen,  setCreateOpen]  = useState(false)
  const [editTarget,  setEditTarget]  = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  const handleCreate = (data: ProjectFormData) => {
    create.mutate(data, {
      onSuccess: () => {
        setCreateOpen(false)
        toast.addToast('專案已建立', 'success')
      },
      onError: (error: any) => {
        const message = error?.message || '無法建立專案'
        toast.addToast(message, 'error')
      }
    })
  }

  const handleUpdate = (data: ProjectFormData) => {
    if (!editTarget) return
    update.mutate({ id: editTarget.id, data }, {
      onSuccess: () => {
        setEditTarget(null)
        toast.addToast('專案已更新', 'success')
      },
      onError: (error: any) => {
        const message = error?.message || '無法更新專案'
        toast.addToast(message, 'error')
      }
    })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    del.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        toast.addToast('專案已刪除', 'success')
      },
      onError: (error: any) => {
        const message = error?.message || '無法刪除專案'
        toast.addToast(message, 'error')
      }
    })
  }

  if (isLoading) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold">專案</h1>
            <p className="text-sm text-[var(--color-muted)] mt-1">管理你的 AI 任務執行專案</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <SkeletonCard count={6} className="bg-[var(--color-surface)]" />
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold">專案</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">管理你的 AI 任務執行專案</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} />
          新增專案
        </Button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="還沒有專案"
          description="建立第一個專案，開始使用 AI 自動執行任務"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} /> 新增專案
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(project => (
            <div
              key={project.id}
              className="group bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-5 hover:border-[var(--color-accent)] hover:shadow-[var(--shadow-md)] transition-all duration-200 cursor-pointer"
              onClick={() => navigate(`/projects/${project.id}/tasks`)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(`/projects/${project.id}/tasks`)}
              aria-label={`開啟專案 ${project.name}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FolderOpen size={18} className="text-[var(--color-accent)] shrink-0" />
                  <h2 className="text-sm font-semibold truncate max-w-[140px]">{project.name}</h2>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <button
                    onClick={e => { e.stopPropagation(); setEditTarget(project) }}
                    className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] transition-colors cursor-pointer"
                    aria-label="編輯專案"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTarget(project) }}
                    className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-destructive)] transition-colors cursor-pointer"
                    aria-label="刪除專案"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <p className="text-xs text-[var(--color-muted)] font-mono truncate mb-3">{project.path}</p>

              <div className="flex items-center justify-between">
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]">
                  {project.pipeline.name}
                </span>
                <div className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
                  <span>{formatRelative(project.updatedAt)}</span>
                  <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="新增專案">
        <ProjectForm onSubmit={handleCreate} loading={create.isPending} />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="編輯專案">
        {editTarget && (
          <ProjectForm
            initial={{ name: editTarget.name, path: editTarget.path, testCommand: editTarget.testCommand, pipelineId: editTarget.pipelineId }}
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
        title="刪除專案"
        message={`確定要刪除「${deleteTarget?.name}」嗎？此操作無法復原。`}
        loading={del.isPending}
      />
    </div>
  )
}
