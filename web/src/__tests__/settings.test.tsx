import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminSettingsPage } from '@/pages/AdminSettingsPage'
import type { HealthResponse, RuntimeConfig } from '@/types'
import { renderUi, getByText } from './test-utils'

const settingsState = {
  health: {
    status: 'ok',
    checks: [
      { key: 'backend', label: 'Backend', status: 'ok', detail: 'Axum server 已啟動' },
      { key: 'database', label: 'PostgreSQL', status: 'ok', detail: 'DB ping 成功' },
      { key: 'redis', label: 'Redis', status: 'warn', detail: 'Queue 健康但延遲偏高' },
      { key: 'claude', label: 'Claude CLI', status: 'ok', detail: 'Claude CLI 可執行' },
      { key: 'gemini', label: 'Gemini API', status: 'warn', detail: 'API key 未設定' },
    ],
  } satisfies HealthResponse,
  runtimeConfig: {
    port: 3001,
    claudeTimeoutSecs: 300,
    defaultMaxRetries: 5,
    taskConcurrency: 2,
    allowOrigins: ['http://localhost:3000', 'http://localhost:5173'],
    geminiApiKeyConfigured: false,
  } satisfies RuntimeConfig,
}

const { refetchHealth, refetchRuntimeConfig } = vi.hoisted(() => ({
  refetchHealth: vi.fn(),
  refetchRuntimeConfig: vi.fn(),
}))

vi.mock('@/hooks/useSettings', () => ({
  useHealth: () => ({
    data: settingsState.health,
    isLoading: false,
    error: null,
    refetch: refetchHealth,
    isFetching: false,
  }),
  useRuntimeConfig: () => ({
    data: settingsState.runtimeConfig,
    isLoading: false,
    error: null,
    refetch: refetchRuntimeConfig,
    isFetching: false,
  }),
}))

beforeEach(() => {
  refetchHealth.mockReset()
  refetchRuntimeConfig.mockReset()
})

describe('AdminSettingsPage', () => {
  it('renders the health, runtime, and provider cards', () => {
    const { container } = renderUi(<AdminSettingsPage />)

    expect(getByText(container, '設定')).toBeTruthy()
    expect(getByText(container, 'Health 檢查')).toBeTruthy()
    expect(getByText(container, 'Runtime Config')).toBeTruthy()
    expect(getByText(container, 'Provider 可用性')).toBeTruthy()
    expect(getByText(container, 'PostgreSQL')).toBeTruthy()
    expect(getByText(container, 'Claude CLI')).toBeTruthy()
    expect(getByText(container, 'Gemini API')).toBeTruthy()
    expect(getByText(container, 'http://localhost:5173')).toBeTruthy()
  })
})
