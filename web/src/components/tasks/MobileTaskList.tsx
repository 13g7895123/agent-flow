import React, { useState } from 'react';
import type { Task, TaskStatus } from '@/types';

interface MobileTaskListProps {
  tasks: Task[];
  columns: { status: TaskStatus; label: string }[];
  renderTaskCard: (task: Task) => React.ReactNode;
  onTabChange?: (status: TaskStatus) => void;
}

export const MobileTaskList: React.FC<MobileTaskListProps> = ({
  tasks,
  columns,
  renderTaskCard,
  onTabChange,
}) => {
  const [activeTab, setActiveTab] = useState<TaskStatus>(columns[0].status);

  const handleTabChange = (status: TaskStatus) => {
    setActiveTab(status);
    onTabChange?.(status);
  };

  const tasksByStatus = (status: TaskStatus) => tasks.filter(t => t.status === status);
  const activeTasks = tasksByStatus(activeTab);
  const activeColumn = columns.find(c => c.status === activeTab);

  return (
    <div className="w-full">
      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 -mx-4 px-4 scrollbar-hide">
        {columns.map(col => {
          const count = tasksByStatus(col.status).length;
          const isActive = activeTab === col.status;

          return (
            <button
              key={col.status}
              onClick={() => handleTabChange(col.status)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-3)]'
              }`}
              aria-selected={isActive}
              aria-label={`${col.label} (${count} 個任務)`}
            >
              <span className="flex items-center gap-2">
                {col.label}
                {count > 0 && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-white bg-opacity-30' : 'bg-[var(--color-surface)]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="min-h-24">
        {activeTasks.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-muted)]">
            <p className="text-sm">{activeColumn?.label}中沒有任務</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activeTasks.map(task => (
              <div key={task.id} className="animate-fade-in">
                {renderTaskCard(task)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileTaskList;
