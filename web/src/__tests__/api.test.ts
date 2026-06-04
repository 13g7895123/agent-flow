import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import { fixtures } from './mocks/handlers'
import { agentsApi, pipelinesApi, projectsApi, runsApi, settingsApi, tasksApi } from '@/lib/api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('api client', () => {
  it('parses backend error payloads from both message and error keys', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'backend failed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(agentsApi.list()).rejects.toThrow('backend failed')
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/agents',
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    )
  })

  it('falls back to plain-text backend errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('service unavailable', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    await expect(pipelinesApi.list()).rejects.toThrow('service unavailable')
  })

  it('matches the mocked backend contract for list/get/create routes', async () => {
    const [agents, pipeline, project, runs, logs, createdTask, health, runtimeConfig] = await Promise.all([
      agentsApi.list(),
      pipelinesApi.get('pipeline-1'),
      projectsApi.get('project-1'),
      tasksApi.runs('task-1'),
      runsApi.logs('run-1'),
      tasksApi.create('project-1', { prompt: 'New task', maxRetries: 2 }),
      settingsApi.health(),
      settingsApi.runtimeConfig(),
    ])

    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({ id: fixtures.agent.id, name: fixtures.agent.name })
    expect(pipeline).toMatchObject({
      id: 'pipeline-1',
      fixerAgent: { id: fixtures.agent.id, name: fixtures.agent.name },
    })
    expect(project).toMatchObject({
      id: 'project-1',
      path: fixtures.project.path,
      pipeline: { id: fixtures.pipeline.id, name: fixtures.pipeline.name },
    })
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ id: fixtures.run.id, phase: 'step', exitCode: 0 })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ id: fixtures.log.id, runId: 'run-1', type: 'stdout' })
    expect(createdTask).toMatchObject({
      id: 'task-created',
      projectId: 'project-1',
      prompt: 'New task',
      maxRetries: 2,
      status: 'pending',
    })
    expect(health).toMatchObject({
      status: 'ok',
      checks: expect.arrayContaining([
        expect.objectContaining({ key: 'backend', status: 'ok' }),
        expect.objectContaining({ key: 'claude', status: 'ok' }),
      ]),
    })
    expect(runtimeConfig).toMatchObject({
      port: 3001,
      claudeTimeoutSecs: 300,
      defaultMaxRetries: 5,
      taskConcurrency: 2,
      geminiApiKeyConfigured: false,
    })
  })

  it('supports deletion routes with 204 responses', async () => {
    await expect(agentsApi.delete('agent-1')).resolves.toBeUndefined()
    await expect(pipelinesApi.delete('pipeline-1')).resolves.toBeUndefined()
    await expect(projectsApi.delete('project-1')).resolves.toBeUndefined()
    await expect(tasksApi.cancel('task-1')).resolves.toBeUndefined()
  })

  it('can override a handler for route-specific assertions', async () => {
    server.use(
      http.get('/api/tasks/:id/runs', ({ params }) =>
        HttpResponse.json([
          {
            ...fixtures.run,
            id: `run-for-${params.id}`,
          },
        ]),
      ),
    )

    const runs = await tasksApi.runs('task-override')
    expect(runs[0].id).toBe('run-for-task-override')
  })

  it('normalizes historical log payloads from alternate backend field names', async () => {
    server.use(
      http.get('/api/runs/:runId/logs', ({ params }) =>
        HttpResponse.json([
          {
            id: 'log-alt',
            executionRunId: String(params.runId),
            sequence: 7,
            logType: 'stderr',
            content: 'failed',
            timestamp: '2026-06-03T00:00:20.000Z',
          },
        ]),
      ),
    )

    const logs = await runsApi.logs('run-alt')
    expect(logs[0]).toMatchObject({
      id: 'log-alt',
      runId: 'run-alt',
      sequence: 7,
      type: 'stderr',
      createdAt: '2026-06-03T00:00:20.000Z',
    })
  })

  it('normalizes object-shaped health payloads from the Rust backend', async () => {
    server.use(
      http.get('/api/health', () =>
        HttpResponse.json({
          status: 'warn',
          checks: {
            backend: { status: 'ok' },
            database: { status: 'ok', detail: 'DB ping 成功' },
            redis: { status: 'warn', detail: 'Queue backlog' },
            claude: { status: 'ok', configured: true },
            gemini: { status: 'warn', configured: false, detail: 'API key 未設定' },
          },
          updatedAt: '2026-06-04T00:00:00.000Z',
        }),
      ),
    )

    const health = await settingsApi.health()

    expect(health).toMatchObject({
      status: 'warn',
      updatedAt: '2026-06-04T00:00:00.000Z',
    })
    expect(health.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'backend', label: 'Backend', status: 'ok' }),
        expect.objectContaining({ key: 'database', label: 'PostgreSQL', status: 'ok' }),
        expect.objectContaining({ key: 'redis', label: 'Redis', status: 'warn' }),
        expect.objectContaining({ key: 'claude', label: 'Claude CLI', status: 'ok', configured: true }),
        expect.objectContaining({ key: 'gemini', label: 'Gemini API', status: 'warn', configured: false }),
      ]),
    )
  })
})
