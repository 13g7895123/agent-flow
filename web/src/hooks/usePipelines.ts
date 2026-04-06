import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pipelinesApi } from '@/lib/api'
import type { PipelineFormData } from '@/types'

export function usePipelines() {
  return useQuery({ queryKey: ['pipelines'], queryFn: pipelinesApi.list })
}

export function usePipeline(id: string) {
  return useQuery({ queryKey: ['pipelines', id], queryFn: () => pipelinesApi.get(id), enabled: !!id })
}

export function useCreatePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PipelineFormData) => pipelinesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  })
}

export function useUpdatePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PipelineFormData }) => pipelinesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  })
}

export function useSetDefaultPipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pipelinesApi.setDefault(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  })
}

export function useDeletePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pipelinesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  })
}
