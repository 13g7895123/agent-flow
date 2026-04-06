import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createTaskStream } from '@/lib/api'
import type {
  TaskStatus,
  SseLogEvent,
  SseStepStartEvent,
  SseStepDoneEvent,
  SseStatusEvent,
} from '@/types'

export interface LogLine {
  sequence: number
  type: 'stdout' | 'stderr' | 'system'
  content: string
}

export interface StreamState {
  logs: LogLine[]
  status: TaskStatus | null
  currentStep: number | null
  isConnected: boolean
}

export function useTaskStream(taskId: string | null, active: boolean) {
  const qc = useQueryClient()
  const [state, setState] = useState<StreamState>({
    logs: [],
    status: null,
    currentStep: null,
    isConnected: false,
  })
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!taskId || !active) return

    const es = createTaskStream(taskId)
    esRef.current = es

    setState({ logs: [], status: null, currentStep: null, isConnected: true })

    const appendLog = (line: LogLine) =>
      setState(s => ({ ...s, logs: [...s.logs, line] }))

    es.addEventListener('step_start', (e: MessageEvent) => {
      const data: SseStepStartEvent = JSON.parse(e.data)
      setState(s => ({ ...s, currentStep: data.stepOrder }))
      appendLog({
        sequence: Date.now(),
        type: 'system',
        content: `▶ 步驟 ${data.stepOrder}：${data.agentName}${data.label ? ` (${data.label})` : ''}`,
      })
    })

    es.addEventListener('log', (e: MessageEvent) => {
      const data: SseLogEvent = JSON.parse(e.data)
      appendLog({ sequence: data.sequence, type: data.type, content: data.content })
    })

    es.addEventListener('step_done', (e: MessageEvent) => {
      const data: SseStepDoneEvent = JSON.parse(e.data)
      appendLog({
        sequence: Date.now(),
        type: 'system',
        content: `${data.success ? '✓' : '✗'} 步驟 ${data.stepOrder} ${data.success ? '完成' : '失敗'}`,
      })
    })

    es.addEventListener('status', (e: MessageEvent) => {
      const data: SseStatusEvent = JSON.parse(e.data)
      setState(s => ({ ...s, status: data.status }))
      qc.invalidateQueries({ queryKey: ['tasks', 'detail', taskId] })
    })

    es.addEventListener('done', () => {
      setState(s => ({ ...s, isConnected: false }))
      qc.invalidateQueries({ queryKey: ['tasks'] })
      es.close()
    })

    es.onerror = () => {
      setState(s => ({ ...s, isConnected: false }))
    }

    return () => { es.close(); esRef.current = null }
  }, [taskId, active, qc])

  return state
}
