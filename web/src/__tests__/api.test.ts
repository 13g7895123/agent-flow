import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './mocks/server'
import { fixtures } from './mocks/handlers'
import { agentsApi, pipelinesApi, projectsApi, runsApi, tasksApi } from '@/lib/api'

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
    const [agents, pipeline, project, runs, logs, createdTask] = await Promise.all([
      agentsApi.list(),
      pipelinesApi.get('pipeline-1'),
      projectsApi.get('project-1'),
      tasksApi.runs('task-1'),
      runsApi.logs('run-1'),
      tasksApi.create('project-1', { prompt: 'New task', maxRetries: 2 }),
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
})
