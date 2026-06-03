import { type ReactElement } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

type RenderOptions = {
  route?: string
  queryClient?: QueryClient
}

type RenderResult = {
  container: HTMLElement
  root: Root
  unmount: () => void
}

const mounted: RenderResult[] = []

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

export function renderUi(ui: ReactElement, options: RenderOptions = {}): RenderResult {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)
  const queryClient = options.queryClient ?? createTestQueryClient()
  const route = options.route ?? '/'

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          {ui}
        </MemoryRouter>
      </QueryClientProvider>,
    )
  })

  const result: RenderResult = {
    container,
    root,
    unmount: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
      const index = mounted.indexOf(result)
      if (index >= 0) mounted.splice(index, 1)
    },
  }

  mounted.push(result)
  return result
}

export function cleanupRendered() {
  while (mounted.length > 0) {
    mounted.pop()?.unmount()
  }
}

export function getByText(container: HTMLElement, text: string | RegExp): HTMLElement {
  const matcher = typeof text === 'string'
    ? (value: string) => value.includes(text)
    : (value: string) => text.test(value)

  const elements = Array.from(container.querySelectorAll<HTMLElement>('*'))
  const match = elements.find(el => matcher(el.textContent?.trim() ?? ''))
  if (!match) throw new Error(`Unable to find text: ${String(text)}`)
  return match
}

export function getControlByLabel(container: HTMLElement, labelText: string) {
  const labels = Array.from(container.querySelectorAll('label')) as HTMLLabelElement[]
  const label = labels.find(el => (el.textContent ?? '').includes(labelText))
  if (!label) throw new Error(`Unable to find label: ${labelText}`)
  const control = label.control
  if (!control) throw new Error(`Label has no associated control: ${labelText}`)
  return control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
}

export function getButton(container: HTMLElement, name: string) {
  const button = container.querySelector(`button[aria-label="${name}"]`)
  if (!button) throw new Error(`Unable to find button: ${name}`)
  return button as HTMLButtonElement
}

export async function click(el: Element) {
  await act(async () => {
    if (el instanceof HTMLElement && typeof el.click === 'function') {
      el.click()
      return
    }
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

export async function inputValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  await act(async () => {
    if (el instanceof HTMLSelectElement) {
      el.value = value
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
      return
    }

    el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }))
  })
}

export async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

export async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}
