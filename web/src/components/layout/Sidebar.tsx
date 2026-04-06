import { NavLink } from 'react-router-dom'
import { FolderOpen, Bot, GitBranch, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  end?: boolean
}

const mainNav: NavItem[] = [
  { to: '/',        icon: FolderOpen, label: '專案',     end: true },
]

const adminNav: NavItem[] = [
  { to: '/admin/agents',    icon: Bot,        label: 'Agent 庫' },
  { to: '/admin/pipelines', icon: GitBranch,  label: 'Pipeline' },
]

function NavItem({ to, icon: Icon, label, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm',
          'transition-colors duration-150 cursor-pointer',
          isActive
            ? 'bg-[var(--color-accent)] text-white font-medium'
            : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]',
        )
      }
    >
      <Icon size={16} />
      {label}
    </NavLink>
  )
}

export function Sidebar() {
  const { theme, toggle } = useTheme()

  return (
    <aside
      style={{ width: 'var(--sidebar-width)' }}
      className="flex flex-col shrink-0 h-dvh sticky top-0 border-r border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[var(--color-border)]">
        <span className="font-['Fira_Code'] font-semibold text-sm text-[var(--color-foreground)]">
          agent<span className="text-[var(--color-accent)]">_flow</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto" aria-label="主導覽">
        {mainNav.map(item => <NavItem key={item.to} {...item} />)}

        <div className="mt-4 mb-1 px-3">
          <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider">後台管理</p>
        </div>
        {adminNav.map(item => <NavItem key={item.to} {...item} />)}
      </nav>

      {/* Footer: theme toggle */}
      <div className="px-3 py-4 border-t border-[var(--color-border)]">
        <button
          onClick={toggle}
          aria-label={theme === 'dark' ? '切換淺色模式' : '切換深色模式'}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2 rounded-[var(--radius-md)] text-sm',
            'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]',
            'transition-colors duration-150 cursor-pointer',
          )}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? '淺色模式' : '深色模式'}
        </button>
      </div>
    </aside>
  )
}
