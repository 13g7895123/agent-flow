import { http, HttpResponse } from 'msw'

const BASE = '/api'

export const handlers = [
  // ── Agents ────────────────────────────────────────────────────────────────
  http.get(`${BASE}/agents`, () => {
    return HttpResponse.json([])
  }),

  http.get(`${BASE}/agents/:id`, () => {
    return HttpResponse.json({
      id: '1',
      name: 'Test Agent',
      description: 'Test description',
      systemPrompt: 'Test prompt',
      stepPrompt: 'Test step prompt',
      modelProvider: 'claude',
      modelId: 'claude-3-5-sonnet-20241022',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      usedInPipelines: 0,
    })
  }),

  http.post(`${BASE}/agents`, () => {
    return HttpResponse.json(
      {
        id: '1',
        name: 'New Agent',
        systemPrompt: 'prompt',
        stepPrompt: 'step',
        modelProvider: 'claude',
      },
      { status: 201 }
    )
  }),

  http.put(`${BASE}/agents/:id`, () => {
    return HttpResponse.json({ id: '1', name: 'Updated' })
  }),

  http.put(`${BASE}/agents/:id/toggle`, () => {
    return HttpResponse.json({ id: '1', isActive: true })
  }),

  http.delete(`${BASE}/agents/:id`, () => {
    return HttpResponse.json(null, { status: 204 })
  }),

  // ── Pipelines ─────────────────────────────────────────────────────────────
  http.get(`${BASE}/pipelines`, () => {
    return HttpResponse.json([])
  }),

  http.get(`${BASE}/pipelines/:id`, () => {
    return HttpResponse.json({
      id: '1',
      name: 'Test Pipeline',
      description: 'Test',
      fixerAgentId: '1',
      fixerAgent: { id: '1', name: 'Fixer', modelProvider: 'claude' },
      isDefault: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      usedInProjects: 0,
      steps: [],
    })
  }),

  http.post(`${BASE}/pipelines`, () => {
    return HttpResponse.json({ id: '1', name: 'New Pipeline' }, { status: 201 })
  }),

  http.put(`${BASE}/pipelines/:id`, () => {
    return HttpResponse.json({ id: '1', name: 'Updated' })
  }),

  http.put(`${BASE}/pipelines/:id/default`, () => {
    return HttpResponse.json({ id: '1', isDefault: true })
  }),

  http.delete(`${BASE}/pipelines/:id`, () => {
    return HttpResponse.json(null, { status: 204 })
  }),

  // ── Projects ──────────────────────────────────────────────────────────────
  http.get(`${BASE}/projects`, () => {
    return HttpResponse.json([])
  }),

  http.get(`${BASE}/projects/:id`, () => {
    return HttpResponse.json({
      id: '1',
      name: 'Test Project',
      path: '/tmp/test',
      testCommand: 'echo test',
      pipelineId: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }),

  http.post(`${BASE}/projects`, () => {
    return HttpResponse.json({ id: '1', name: 'New Project' }, { status: 201 })
  }),

  http.put(`${BASE}/projects/:id`, () => {
    return HttpResponse.json({ id: '1', name: 'Updated' })
  }),

  http.delete(`${BASE}/projects/:id`, () => {
    return HttpResponse.json(null, { status: 204 })
  }),

  // ── Tasks ─────────────────────────────────────────────────────────────────
  http.get(`${BASE}/projects/:projectId/tasks`, () => {
    return HttpResponse.json([])
  }),

  http.post(`${BASE}/projects/:projectId/tasks`, () => {
    return HttpResponse.json(
      {
        id: '1',
        projectId: '1',
        pipelineId: '1',
        prompt: 'test',
        status: 'pending',
      },
      { status: 201 }
    )
  }),

  http.get(`${BASE}/tasks/:id`, () => {
    return HttpResponse.json({
      id: '1',
      projectId: '1',
      pipelineId: '1',
      prompt: 'test',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }),

  http.get(`${BASE}/tasks/:id/runs`, () => {
    return HttpResponse.json([])
  }),

  http.put(`${BASE}/tasks/:id/cancel`, () => {
    return HttpResponse.json({ id: '1', status: 'cancelled' })
  }),

  http.put(`${BASE}/tasks/:id/retry`, () => {
    return HttpResponse.json({ id: '1', status: 'pending' })
  }),

  http.get(`${BASE}/tasks/:id/stream`, () => {
    return new HttpResponse(null, { status: 200 })
  }),
]
