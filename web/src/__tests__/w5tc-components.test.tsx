import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormErrorSummary } from '@/components/forms/FormErrorSummary';
import { ApiErrorAlert } from '@/components/forms/ApiErrorAlert';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { ToastProvider, useToast } from '@/components/ui/ToastProvider';
import { MobileTaskList } from '@/components/tasks/MobileTaskList';
import { AccessibleDndInstructions } from '@/components/pipelines/AccessibleDndInstructions';

describe('FormErrorSummary', () => {
  it('不顯示錯誤當沒有 errors', () => {
    const { container } = render(<FormErrorSummary errors={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('顯示錯誤清單', () => {
    const errors = ['欄位 A 必填', '欄位 B 格式錯誤'];
    render(<FormErrorSummary errors={errors} />);

    expect(screen.getByText('表單驗證有誤，請修正：')).toBeInTheDocument();
    expect(screen.getByText('欄位 A 必填')).toBeInTheDocument();
    expect(screen.getByText('欄位 B 格式錯誤')).toBeInTheDocument();
  });

  it('有正確的 role 屬性', () => {
    render(<FormErrorSummary errors={['Error']} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('ApiErrorAlert', () => {
  it('不顯示當沒有 error', () => {
    const { container } = render(<ApiErrorAlert error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('顯示錯誤訊息', () => {
    render(<ApiErrorAlert error="Failed to save data" />);
    expect(screen.getByText('API 錯誤')).toBeInTheDocument();
    expect(screen.getByText('Failed to save data')).toBeInTheDocument();
  });

  it('自訂標題', () => {
    render(<ApiErrorAlert error="Error" title="Custom Error" />);
    expect(screen.getByText('Custom Error')).toBeInTheDocument();
  });

  it('可以關閉錯誤', () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <ApiErrorAlert error="Error" onDismiss={onDismiss} />
    );
    const closeButton = container.querySelector('button');
    if (closeButton) {
      fireEvent.click(closeButton);
      expect(onDismiss).toHaveBeenCalled();
    }
  });
});

describe('SkeletonCard', () => {
  it('顯示預設的骨架', () => {
    const { container } = render(<SkeletonCard count={1} />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('顯示多個骨架', () => {
    const { container } = render(<SkeletonCard count={3} />);
    const cards = container.querySelectorAll('.bg-white');
    expect(cards.length).toBe(3);
  });
});

describe('ToastProvider', () => {
  it('提供 useToast hook', () => {
    const TestComponent = () => {
      const { addToast, toasts } = useToast();
      return (
        <>
          <button onClick={() => addToast('Test', 'success')}>
            Show Toast
          </button>
          <div>{toasts.length} toasts</div>
        </>
      );
    };

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    const button = screen.getByText('Show Toast');
    fireEvent.click(button);
    expect(screen.getByText(/1 toasts/)).toBeInTheDocument();
  });
});

describe('MobileTaskList', () => {
  it('顯示分頁選項', () => {
    const mockTasks = [
      {
        id: '1',
        prompt: 'Task 1',
        status: 'pending' as const,
        projectId: 'proj-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        currentRetry: 0,
        maxRetries: 5,
        pipelineSnapshot: {
          id: 'pipe-1',
          name: 'Pipeline 1',
          fixerAgent: { id: 'agent-1', name: 'Fixer' },
          steps: [],
        },
        stepOutputs: [],
      },
    ] as any;

    const columns = [
      { status: 'pending' as const, label: 'Pending' },
      { status: 'done' as const, label: 'Done' },
    ];

    render(
      <MobileTaskList
        tasks={mockTasks}
        columns={columns}
        renderTaskCard={task => <div key={task.id}>{task.prompt}</div>}
      />
    );

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
});

describe('AccessibleDndInstructions', () => {
  it('顯示操作說明', () => {
    render(<AccessibleDndInstructions />);
    expect(screen.getByText('拖曳排序操作說明')).toBeInTheDocument();
    expect(screen.getByText('使用滑鼠拖曳')).toBeInTheDocument();
  });

  it('可以展開收合', () => {
    const { container } = render(<AccessibleDndInstructions />);
    const button = container.querySelector('button');

    if (button) {
      expect(button.getAttribute('aria-expanded')).toBe('true');
      fireEvent.click(button);
      expect(button.getAttribute('aria-expanded')).toBe('false');
    }
  });
});
