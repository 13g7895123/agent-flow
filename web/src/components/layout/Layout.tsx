import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function Layout() {
  return (
    <div className="flex min-h-dvh bg-[var(--color-background)]">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-[var(--color-accent)] focus:text-white focus:rounded"
        >
          跳至主要內容
        </a>
        <div id="main-content" className="px-8 py-8 max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
