import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { agentsApi } from '@/lib/api'
import type { AgentFormData } from '@/types'

export function useAgents() {
  return useQuery({ queryKey: ['agents'], queryFn: agentsApi.list })
}

export function useAgent(id: string) {
  return useQuery({ queryKey: ['agents', id], queryFn: () => agentsApi.get(id), enabled: !!id })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AgentFormData) => agentsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useUpdateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AgentFormData }) => agentsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useToggleAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => agentsApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}
