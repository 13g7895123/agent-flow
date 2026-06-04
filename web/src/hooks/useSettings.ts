import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '@/lib/api'

export function useHealth() {
  return useQuery({ queryKey: ['settings', 'health'], queryFn: settingsApi.health })
}

export function useRuntimeConfig() {
  return useQuery({ queryKey: ['settings', 'runtime-config'], queryFn: settingsApi.runtimeConfig })
}
