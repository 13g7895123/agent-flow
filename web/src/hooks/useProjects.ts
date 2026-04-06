import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '@/lib/api'
import type { ProjectFormData } from '@/types'

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: projectsApi.list })
}

export function useProject(id: string) {
  return useQuery({ queryKey: ['projects', id], queryFn: () => projectsApi.get(id), enabled: !!id })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ProjectFormData) => projectsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProjectFormData }) => projectsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}
