import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentForm } from '@/pages/AdminAgentsPage'
import { PipelineForm } from '@/pages/AdminPipelinesPage'
import { ProjectForm, ProjectsPage } from '@/pages/ProjectsPage'
import type { Agent, Pipeline, Project } from '@/types'
import {
  renderUi,
  getByText,
  getControlByLabel,
  click,
  submit,
} from './test-utils'

const projectsState = {
  data: [] as Project[],
  isLoading: false,
}

const agentsState = {
  data: [] as Agent[],
  isLoading: false,
}

const pipelinesState = {
  data: [] as Pipeline[],
  isLoading: false,
}

const createProject = vi.fn()
const updateProject = vi.fn()
const deleteProject = vi.fn()
const createAgent = vi.fn()
const updateAgent = vi.fn()
const toggleAgent = vi.fn()
const deleteAgent = vi.fn()
const createPipeline = vi.fn()
const updatePipeline = vi.fn()
const setDefaultPipeline = vi.fn()
const deletePipeline = vi.fn()

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: projectsState.data, isLoading: projectsState.isLoading }),
  useCreateProject: () => ({ mutate: createProject, isPending: false, error: null }),
  useUpdateProject: () => ({ mutate: updateProject, isPending: false, error: null }),
  useDeleteProject: () => ({ mutate: deleteProject, isPending: false, error: null }),
}))

vi.mock('@/hooks/useAgents', () => ({
  useAgents: () => ({ data: agentsState.data, isLoading: agentsState.isLoading }),
  useCreateAgent: () => ({ mutate: createAgent, isPending: false, error: null }),
  useUpdateAgent: () => ({ mutate: updateAgent, isPending: false, error: null }),
  useToggleAgent: () => ({ mutate: toggleAgent, isPending: false, error: null }),
  useDeleteAgent: () => ({ mutate: deleteAgent, isPending: false, error: null }),
}))

vi.mock('@/hooks/usePipelines', () => ({
  usePipelines: () => ({ data: pipelinesState.data, isLoading: pipelinesState.isLoading }),
  useCreatePipeline: () => ({ mutate: createPipeline, isPending: false, error: null }),
  useUpdatePipeline: () => ({ mutate: updatePipeline, isPending: false, error: null }),
  useSetDefaultPipeline: () => ({ mutate: setDefaultPipeline, isPending: false, error: null }),
  useDeletePipeline: () => ({ mutate: deletePipeline, isPending: false, error: null }),
}))

beforeEach(() => {
  projectsState.data = []
  projectsState.isLoading = false
  agentsState.data = []
  agentsState.isLoading = false
  pipelinesState.data = []
  pipelinesState.isLoading = false

  for (const spy of [
    createProject,
    updateProject,
    deleteProject,
    createAgent,
    updateAgent,
    toggleAgent,
    deleteAgent,
    createPipeline,
    updatePipeline,
    setDefaultPipeline,
    deletePipeline,
  ]) {
    spy.mockReset()
  }
})

describe('forms and page states', () => {
  it('validates the agent form and Gemini-specific model id requirement', async () => {
    const { container } = renderUi(
      <AgentForm onSubmit={createAgent} />,
    )

    const gemini = container.querySelector('input[type="radio"][value="gemini"]') as HTMLInputElement
    await click(gemini)
    await submit(container.querySelector('form') as HTMLFormElement)

    expect(getByText(container, '請輸入名稱')).toBeTruthy()
    expect(getByText(container, '請輸入系統提示詞')).toBeTruthy()
    expect(getByText(container, '請輸入步驟提示詞')).toBeTruthy()
    expect(getByText(container, 'Gemini 必須填寫 Model ID（例如 gemini-2.0-flash）')).toBeTruthy()
  })

  it('validates the pipeline form step selection', async () => {
    agentsState.data = [
      {
        id: 'agent-1',
        name: 'Agent 1',
        description: '',
        modelProvider: 'claude',
        modelId: '',
        systemPrompt: '',
        stepPrompt: '',
        isActive: true,
        usedInPipelines: 0,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]

    const { container } = renderUi(
      <PipelineForm onSubmit={createPipeline} />,
    )

    await submit(container.querySelector('form') as HTMLFormElement)

    expect(getByText(container, '請輸入 Pipeline 名稱')).toBeTruthy()
    expect(getByText(container, '請選擇修正 Agent')).toBeTruthy()
    expect(getByText(container, '步驟 1 尚未選擇 Agent')).toBeTruthy()
  })

  it('validates the project form and uses the pipeline list from the query hook', async () => {
    pipelinesState.data = [
      {
        id: 'pipeline-1',
        name: 'Pipeline 1',
        description: '',
        fixerAgentId: 'agent-1',
        fixerAgent: { id: 'agent-1', name: 'Agent 1', modelProvider: 'claude' },
        steps: [],
        isDefault: false,
        isActive: true,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ]

    const { container } = renderUi(
      <ProjectForm onSubmit={createProject} />,
    )

    await submit(container.querySelector('form') as HTMLFormElement)

    expect(getByText(container, '請輸入專案名稱')).toBeTruthy()
    expect(getByText(container, '請輸入專案路徑')).toBeTruthy()
    expect(getByText(container, '請選擇 Pipeline')).toBeTruthy()
    expect((getControlByLabel(container, '執行 Pipeline') as HTMLSelectElement).options).toHaveLength(2)
  })

  it('shows the projects loading state', () => {
    projectsState.isLoading = true

    const { container } = renderUi(<ProjectsPage />)

    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('shows the projects empty state', () => {
    projectsState.data = []

    const { container } = renderUi(<ProjectsPage />)

    expect(getByText(container, '還沒有專案')).toBeTruthy()
    expect(getByText(container, '新增專案')).toBeTruthy()
  })
})
