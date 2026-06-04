import { AlertCircle, Bot, CheckCircle2, Cpu, RefreshCw, Server, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { ElementType, ReactNode } from 'react'
import { useHealth, useRuntimeConfig } from '@/hooks/useSettings'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import type { HealthCheckItem, HealthResponse, RuntimeConfig, ServiceStatus } from '@/types'

const STATUS_META: Record<ServiceStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ok: { label: '正常', className: 'text-[var(--color-status-done)]', icon: CheckCircle2 },
  warn: { label: '警告', className: 'text-[var(--color-status-pending)]', icon: TriangleAlert },
  error: { label: '異常', className: 'text-[var(--color-destructive)]', icon: AlertCircle },
  unknown: { label: '未知', className: 'text-[var(--color-muted)]', icon: ShieldCheck },
}

function statusOf(checks: HealthCheckItem[], key: string): HealthCheckItem | undefined {
  return checks.find(check => check.key === key)
}

function StatusDot({ status }: { status: ServiceStatus }) {
  return (
    <span
      className={cn(
        'inline-flex h-2.5 w-2.5 rounded-full',
        status === 'ok' && 'bg-[var(--color-status-done)]',
        status === 'warn' && 'bg-[var(--color-status-pending)]',
        status === 'error' && 'bg-[var(--color-status-failed)]',
        status === 'unknown' && 'bg-[var(--color-muted)]',
      )}
    />
  )
}

function CardShell({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string
  description: string
  icon: ElementType
  children: ReactNode
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-2)]">
          <Icon size={18} className="text-[var(--color-accent)]" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function HealthCheckCard({ health }: { health?: HealthResponse }) {
  const checks = health?.checks ?? []

  return (
    <CardShell
      title="Health 檢查"
      description="檢視 backend 與依賴服務是否可用"
      icon={Server}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2">
          <span className="text-sm text-[var(--color-muted)]">整體狀態</span>
          <Badge className="bg-[var(--color-surface-2)] text-[var(--color-foreground)]">
            <StatusDot status={health?.status ?? 'unknown'} />
            {STATUS_META[health?.status ?? 'unknown'].label}
          </Badge>
        </div>

        <div className="space-y-2">
          {checks.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="尚未提供詳細檢查"
              description="後端目前只回傳摘要或尚未啟用 runtime health details"
            />
          ) : (
            checks.map(check => {
              const meta = STATUS_META[check.status]
              const Icon = meta.icon
              return (
                <div
                  key={check.key}
                  className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon size={15} className={meta.className} />
                      <span className="text-sm font-medium">{check.label}</span>
                    </div>
                    {check.detail ? (
                      <p className="mt-1 text-xs text-[var(--color-muted)]">{check.detail}</p>
                    ) : null}
                  </div>
                  <Badge className="bg-[var(--color-surface-2)] text-[var(--color-foreground)]">
                    <StatusDot status={check.status} />
                    {meta.label}
                  </Badge>
                </div>
              )
            })
          )}
        </div>
      </div>
    </CardShell>
  )
}

function RuntimeConfigCard({ config }: { config?: RuntimeConfig }) {
  const rows = [
    ['Port', config?.port ?? 0],
    ['Claude timeout', `${config?.claudeTimeoutSecs ?? 0}s`],
    ['Default retries', config?.defaultMaxRetries ?? 0],
    ['Task concurrency', config?.taskConcurrency ?? 0],
  ]

  return (
    <CardShell
      title="Runtime Config"
      description="顯示目前執行時設定，不包含 secret 原文"
      icon={Cpu}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-3">
            <div className="text-xs text-[var(--color-muted)]">{label}</div>
            <div className="mt-1 text-sm font-medium">{String(value)}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
        <div className="text-xs text-[var(--color-muted)]">Allowed origins</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(config?.allowOrigins ?? []).length === 0 ? (
            <span className="text-sm text-[var(--color-muted)]">未提供</span>
          ) : (
            config!.allowOrigins.map(origin => (
              <Badge key={origin} className="bg-[var(--color-surface-2)] text-[var(--color-foreground)]">
                {origin}
              </Badge>
            ))
          )}
        </div>
      </div>
    </CardShell>
  )
}

function ProviderConfigCard({
  health,
  config,
}: {
  health?: HealthResponse
  config?: RuntimeConfig
}) {
  const claude = statusOf(health?.checks ?? [], 'claude')
  const gemini = statusOf(health?.checks ?? [], 'gemini')

  const providerRows: Array<{
    name: string
    status: ServiceStatus
    detail: string
  }> = [
    {
      name: 'Claude CLI',
      status: claude?.status ?? 'unknown',
      detail: claude?.detail ?? '由後端健康檢查回傳',
    },
    {
      name: 'Gemini API',
      status: config?.geminiApiKeyConfigured ? 'ok' : 'warn',
      detail: config?.geminiApiKeyConfigured
        ? '已設定 API key，可啟用 Gemini provider'
        : '尚未設定 API key，Gemini provider 會被視為不可用',
    },
  ]

  return (
    <CardShell
      title="Provider 可用性"
      description="確認 Claude / Gemini 是否能用於新任務"
      icon={Bot}
    >
      <div className="space-y-2">
        {providerRows.map(row => {
          const meta = STATUS_META[row.status]
          const Icon = meta.icon
          return (
            <div
              key={row.name}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Icon size={15} className={meta.className} />
                  <span className="text-sm font-medium">{row.name}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">{row.detail}</p>
              </div>
              <Badge className="bg-[var(--color-surface-2)] text-[var(--color-foreground)]">
                <StatusDot status={row.status} />
                {meta.label}
              </Badge>
            </div>
          )
        })}

        {gemini ? (
          <div className="text-xs text-[var(--color-muted)]">
            {gemini.detail}
          </div>
        ) : null}
      </div>
    </CardShell>
  )
}

export function AdminSettingsPage() {
  const { data: health, isLoading: loadingHealth, error: healthError, refetch: refetchHealth, isFetching: fetchingHealth } = useHealth()
  const { data: runtimeConfig, isLoading: loadingConfig, error: configError, refetch: refetchConfig, isFetching: fetchingConfig } = useRuntimeConfig()

  const isLoading = loadingHealth || loadingConfig
  const error = healthError ?? configError
  const reload = () => {
    void refetchHealth()
    void refetchConfig()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <span className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold">設定</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            檢視 backend 健康狀態、runtime config 與 provider 可用性
          </p>
        </div>
        <Button variant="secondary" onClick={reload} loading={fetchingHealth || fetchingConfig}>
          <RefreshCw size={15} />
          重新整理
        </Button>
      </div>

      {error ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-4 py-3 text-sm text-[var(--color-destructive)]">
          設定資料載入失敗：{error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <HealthCheckCard health={health} />
        <RuntimeConfigCard config={runtimeConfig} />
        <ProviderConfigCard health={health} config={runtimeConfig} />
      </div>
    </div>
  )
}
