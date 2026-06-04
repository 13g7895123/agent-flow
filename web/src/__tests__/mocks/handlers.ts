import { http, HttpResponse } from 'msw'
import type { Agent, AgentLog, ExecutionRun, Pipeline, Project, Task } from '@/types'

const BASE = '/api'

export const fixtures = {
  agent: {
    id: 'agent-1',
    name: 'Test Agent',
    description: 'Test description',
    modelProvider: 'claude',
    modelId: 'claude-3-5-sonnet-20241022',
    systemPrompt: 'System prompt',
    stepPrompt: 'Step prompt',
    isActive: true,
    usedInPipelines: 2,
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-02T12:00:00.000Z',
  } satisfies Agent,
  pipeline: {
    id: 'pipeline-1',
    name: 'Test Pipeline',
    description: 'Pipeline description',
    fixerAgentId: 'agent-1',
    fixerAgent: {
      id: 'agent-1',
      name: 'Test Agent',
      modelProvider: 'claude',
    },
    steps: [
      {
        id: 'step-1',
        agentId: 'agent-1',
        agent: {
          id: 'agent-1',
          name: 'Test Agent',
          modelProvider: 'claude',
          modelId: 'claude-3-5-sonnet-20241022',
        },
        order: 1,
        label: 'Analyze',
      },
    ],
    isDefault: false,
    isActive: true,
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-02T12:00:00.000Z',
  } satisfies Pipeline,
  project: {
    id: 'project-1',
    name: 'Test Project',
    path: '/tmp/test-project',
    testCommand: 'bun test',
    pipelineId: 'pipeline-1',
    pipeline: {
      id: 'pipeline-1',
      name: 'Test Pipeline',
    },
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-02T12:00:00.000Z',
  } satisfies Project,
  run: {
    id: 'run-1',
    taskId: 'task-1',
    stepId: 'step-1',
    agentId: 'agent-1',
    agentName: 'Test Agent',
    phase: 'step',
    runIndex: 1,
    promptSent: 'Implement feature',
    output: 'ok',
    errorMessage: '',
    exitCode: 0,
    success: true,
    durationMs: 1200,
    startedAt: '2026-06-03T00:00:00.000Z',
    completedAt: '2026-06-03T00:01:00.000Z',
  } satisfies ExecutionRun,
  log: {
    id: 'log-1',
    runId: 'run-1',
    sequence: 1,
    type: 'stdout',
    content: 'worker started',
    createdAt: '2026-06-03T00:00:10.000Z',
  } satisfies AgentLog,
  task: {
    id: 'task-1',
    projectId: 'project-1',
    prompt: 'Test task',
    status: 'pending',
    currentRetry: 0,
    maxRetries: 3,
    pipelineSnapshot: {
      id: 'pipeline-1',
      name: 'Test Pipeline',
      fixerAgent: {
        id: 'agent-1',
        name: 'Test Agent',
        modelProvider: 'claude',
        modelId: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'System prompt',
        stepPrompt: 'Step prompt',
      },
      steps: [
        {
          id: 'step-1',
          agentId: 'agent-1',
          agent: {
            id: 'agent-1',
            name: 'Test Agent',
            modelProvider: 'claude',
            modelId: 'claude-3-5-sonnet-20241022',
            systemPrompt: 'System prompt',
            stepPrompt: 'Step prompt',
          },
          order: 1,
          label: 'Analyze',
        },
      ],
    },
    stepOutputs: {},
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    completedAt: null,
  } satisfies Task,
}

async function readJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>
}

export const handlers = [
  http.get(`${BASE}/agents`, () => HttpResponse.json([fixtures.agent])),
  http.get(`${BASE}/agents/:id`, ({ params }) =>
    HttpResponse.json({ ...fixtures.agent, id: String(params.id) }),
  ),
  http.post(`${BASE}/agents`, async ({ request }) => {
    const body = await readJson<Partial<Agent>>(request)
    return HttpResponse.json(
      {
        ...fixtures.agent,
        ...body,
        id: 'agent-created',
      },
      { status: 201 },
    )
  }),
  http.put(`${BASE}/agents/:id`, async ({ request, params }) => {
    const body = await readJson<Partial<Agent>>(request)
    return HttpResponse.json({
      ...fixtures.agent,
      ...body,
      id: String(params.id),
    })
  }),
  http.put(`${BASE}/agents/:id/toggle`, ({ params }) =>
    HttpResponse.json({
      ...fixtures.agent,
      id: String(params.id),
      isActive: false,
    }),
  ),
  http.delete(`${BASE}/agents/:id`, () => HttpResponse.json(null, { status: 204 })),

  http.get(`${BASE}/pipelines`, () => HttpResponse.json([fixtures.pipeline])),
  http.get(`${BASE}/pipelines/:id`, ({ params }) =>
    HttpResponse.json({ ...fixtures.pipeline, id: String(params.id) }),
  ),
  http.post(`${BASE}/pipelines`, async ({ request }) => {
    const body = await readJson<Partial<Pipeline>>(request)
    return HttpResponse.json(
      {
        ...fixtures.pipeline,
        ...body,
        id: 'pipeline-created',
      },
      { status: 201 },
    )
  }),
  http.put(`${BASE}/pipelines/:id`, async ({ request, params }) => {
    const body = await readJson<Partial<Pipeline>>(request)
    return HttpResponse.json({
      ...fixtures.pipeline,
      ...body,
      id: String(params.id),
    })
  }),
  http.put(`${BASE}/pipelines/:id/default`, ({ params }) =>
    HttpResponse.json({
      ...fixtures.pipeline,
      id: String(params.id),
      isDefault: true,
    }),
  ),
  http.delete(`${BASE}/pipelines/:id`, () => HttpResponse.json(null, { status: 204 })),

  http.get(`${BASE}/projects`, () => HttpResponse.json([fixtures.project])),
  http.get(`${BASE}/projects/:id`, ({ params }) =>
    HttpResponse.json({ ...fixtures.project, id: String(params.id) }),
  ),
  http.post(`${BASE}/projects`, async ({ request }) => {
    const body = await readJson<Partial<Project>>(request)
    return HttpResponse.json(
      {
        ...fixtures.project,
        ...body,
        id: 'project-created',
      },
      { status: 201 },
    )
  }),
  http.put(`${BASE}/projects/:id`, async ({ request, params }) => {
    const body = await readJson<Partial<Project>>(request)
    return HttpResponse.json({
      ...fixtures.project,
      ...body,
      id: String(params.id),
    })
  }),
  http.delete(`${BASE}/projects/:id`, () => HttpResponse.json(null, { status: 204 })),

  http.get(`${BASE}/projects/:projectId/tasks`, () => HttpResponse.json([fixtures.task])),
  http.post(`${BASE}/projects/:projectId/tasks`, async ({ request, params }) => {
    const body = await readJson<{ prompt: string; maxRetries: number }>(request)
    return HttpResponse.json(
      {
        ...fixtures.task,
        id: 'task-created',
        projectId: String(params.projectId),
        prompt: body.prompt,
        maxRetries: body.maxRetries,
      },
      { status: 201 },
    )
  }),
  http.get(`${BASE}/tasks/:id`, ({ params }) =>
    HttpResponse.json({ ...fixtures.task, id: String(params.id) }),
  ),
  http.get(`${BASE}/tasks/:id/runs`, () => HttpResponse.json([fixtures.run])),
  http.get(`${BASE}/runs/:runId/logs`, ({ params }) =>
    HttpResponse.json([{ ...fixtures.log, runId: String(params.runId) }]),
  ),
  http.put(`${BASE}/tasks/:id/cancel`, () => HttpResponse.json(null, { status: 204 })),
  http.put(`${BASE}/tasks/:id/retry`, () => HttpResponse.json(null, { status: 204 })),
  http.get(`${BASE}/tasks/:id/stream`, () => new HttpResponse(null, { status: 200 })),
]
