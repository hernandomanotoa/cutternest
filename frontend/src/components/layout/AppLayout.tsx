import { Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { CommandPalette } from '../command-palette/CommandPalette';
import * as React from 'react';
import { Navigate } from 'react-router-dom';

const SIDEBAR_KEY = 'cutternest-sidebar-collapsed';

export function AppLayout() {
  const { isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(SIDEBAR_KEY);
      if (saved === 'true') setSidebarCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  if (!isAuthenticated) {
    return <Navigate to='/login' replace />;
  }

  return (
    <div className='min-h-screen bg-background text-foreground'>
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
      />
      <div className={sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'}>
        <Header
          onMenuClick={() => setMobileOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarToggle={toggleSidebar}
        />
        <main className='px-4 pb-8 pt-20 md:px-6'>
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
