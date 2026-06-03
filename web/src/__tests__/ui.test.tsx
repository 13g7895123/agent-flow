import { describe, expect, it } from 'vitest'
import { FolderOpen } from 'lucide-react'
import { Badge, ProviderBadge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { renderUi, getByText, getControlByLabel } from './test-utils'

describe('ui primitives', () => {
  it('renders badge states with the right labels and accent dot', () => {
    const { container } = renderUi(
      <div>
        <StatusBadge status="running" />
        <ProviderBadge provider="gemini" />
        <Badge color="#ff0000">Custom</Badge>
      </div>,
    )

    expect(getByText(container, '執行中')).toBeTruthy()
    expect(getByText(container, 'Gemini')).toBeTruthy()
    expect(getByText(container, 'Custom')).toBeTruthy()
    expect(container.querySelector('.animate-pulse-dot')).toBeTruthy()
  })

  it('renders labeled inputs with helper and error states', () => {
    const { container } = renderUi(
      <form>
        <Input label="名稱" error="名稱必填" required />
        <Textarea label="描述" helper="textarea helper" />
        <Select label="類型" helper="select helper">
          <option value="a">A</option>
        </Select>
      </form>,
    )

    const input = getControlByLabel(container, '名稱') as HTMLInputElement
    expect(input.required).toBe(true)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(getByText(container, '名稱必填')).toBeTruthy()
    expect(getByText(container, 'textarea helper')).toBeTruthy()
    expect(getByText(container, 'select helper')).toBeTruthy()
    expect(getControlByLabel(container, '描述')).toBeTruthy()
    expect(getControlByLabel(container, '類型')).toBeTruthy()
  })

  it('renders the empty state with action content', () => {
    const { container } = renderUi(
      <EmptyState
        icon={FolderOpen}
        title="還沒有項目"
        description="先建立一筆資料"
        action={<Button>建立</Button>}
      />,
    )

    expect(getByText(container, '還沒有項目')).toBeTruthy()
    expect(getByText(container, '先建立一筆資料')).toBeTruthy()
    expect(getByText(container, '建立')).toBeTruthy()
  })

  it('shows loading spinner state on buttons', () => {
    const { container } = renderUi(<Button loading>儲存</Button>)

    expect(container.querySelector('button[disabled]')).toBeTruthy()
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })
})
