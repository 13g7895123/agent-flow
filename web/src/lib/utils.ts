import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { TaskStatus, ModelProvider } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending:   '待執行',
  running:   '執行中',
  verifying: '驗收中',
  fixing:    '修正中',
  done:      '完成',
  failed:    '失敗',
  cancelled: '已取消',
}

export const STATUS_COLOR: Record<TaskStatus, string> = {
  pending:   'var(--color-status-pending)',
  running:   'var(--color-status-running)',
  verifying: 'var(--color-status-verifying)',
  fixing:    'var(--color-status-fixing)',
  done:      'var(--color-status-done)',
  failed:    'var(--color-status-failed)',
  cancelled: 'var(--color-status-cancelled)',
}

export const PROVIDER_LABEL: Record<ModelProvider, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
}

export const PROVIDER_COLOR: Record<ModelProvider, string> = {
  claude: '#F97316',
  gemini: '#3B82F6',
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1)  return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)   return `${hours} 小時前`
  return formatDate(iso)
}

export const PROMPT_VARIABLES = [
  '{projectPath}',
  '{testCommand}',
  '{userPrompt}',
  '{previousOutput}',
  '{allPreviousOutputs}',
  '{acceptanceCriteria}',
  '{lastError}',
  '{errorHistory}',
  '{currentRetry}',
  '{maxRetries}',
]
