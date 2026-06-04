import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface AccessibleDndInstructionsProps {
  className?: string;
}

export const AccessibleDndInstructions: React.FC<AccessibleDndInstructionsProps> = ({
  className = '',
}) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={`rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors"
        aria-expanded={expanded}
        aria-label="拖曳排序操作說明"
      >
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-[var(--color-accent)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm font-medium text-[var(--color-foreground)]">
            拖曳排序操作說明
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-[var(--color-muted)]" />
        ) : (
          <ChevronDown size={16} className="text-[var(--color-muted)]" />
        )}
      </button>

      {expanded && (
        <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-background)] space-y-3">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--color-foreground)]">
              使用滑鼠拖曳
            </h4>
            <p className="text-sm text-[var(--color-muted)]">
              按住任何步驟的把手圖示 (六點點) 並向上或向下拖曳即可改變排序。
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--color-foreground)]">
              使用鍵盤操作
            </h4>
            <ul className="space-y-2">
              <li className="text-sm text-[var(--color-muted)]">
                <span className="font-mono bg-[var(--color-surface-2)] px-2 py-1 rounded text-xs mr-2">
                  Space / Enter
                </span>
                在選中的步驟上按下，開始拖曳模式
              </li>
              <li className="text-sm text-[var(--color-muted)]">
                <span className="font-mono bg-[var(--color-surface-2)] px-2 py-1 rounded text-xs mr-2">
                  ↑ / ↓ 箭頭
                </span>
                移動步驟位置 (向上或向下)
              </li>
              <li className="text-sm text-[var(--color-muted)]">
                <span className="font-mono bg-[var(--color-surface-2)] px-2 py-1 rounded text-xs mr-2">
                  Escape
                </span>
                取消拖曳操作
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--color-foreground)]">
              Tab 鍵瀏覽
            </h4>
            <p className="text-sm text-[var(--color-muted)]">
              按 Tab 鍵可以在各個步驟之間切換焦點，最後按 Enter 確認排序。
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccessibleDndInstructions;
