import { Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { CommandPalette } from '../command-palette/CommandPalette';
import * as React from 'react';
import { Navigate } from 'react-router-dom';

export function AppLayout() {
  const { isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  if (!isAuthenticated) {
    return <Navigate to='/login' replace />;
  }

  return (
    <div className='min-h-screen bg-background text-foreground'>
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className='md:pl-64'>
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className='px-4 pb-8 pt-20 md:px-6'>
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
