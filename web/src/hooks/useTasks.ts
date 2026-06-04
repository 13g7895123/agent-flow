import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { runsApi, tasksApi } from '@/lib/api'
import type { TaskFormData } from '@/types'

export function useTasks(projectId: string) {
  return useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId),
    enabled: !!projectId,
  })
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', 'detail', id],
    queryFn: () => tasksApi.get(id),
    enabled: !!id,
  })
}

export function useTaskRuns(taskId: string) {
  return useQuery({
    queryKey: ['tasks', 'runs', taskId],
    queryFn: () => tasksApi.runs(taskId),
    enabled: !!taskId,
  })
}

export function useRunLogs(runId: string | null) {
  return useQuery({
    queryKey: ['runs', 'logs', runId],
    queryFn: () => runsApi.logs(runId!),
    enabled: !!runId,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: TaskFormData }) =>
      tasksApi.create(projectId, data),
    onSuccess: (_task, { projectId }) =>
      qc.invalidateQueries({ queryKey: ['tasks', projectId] }),
  })
}

export function useCancelTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useRetryTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksApi.retry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
