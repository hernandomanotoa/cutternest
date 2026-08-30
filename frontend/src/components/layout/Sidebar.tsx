import { Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, Box, FolderOpen, Package, PanelLeftClose, PanelRightClose } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/Sheet';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

export function Sidebar({ mobileOpen, onClose, collapsed = false, onToggle }: SidebarProps) {
  const { isGuest } = useAuth();

  const links: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: <LayoutDashboard className='h-5 w-5' />, end: true },
    { to: '/projects', label: 'Proyectos', icon: <FolderOpen className='h-5 w-5' />, end: true },
  ];

  if (!isGuest) {
    links.splice(1, 0, { to: '/optimizer', label: 'Optimizador', icon: <Box className='h-5 w-5' /> });
    links.push({ to: '/inventory', label: 'Inventario', icon: <Package className='h-5 w-5' /> });
  }

  const navClasses = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-foreground hover:bg-accent hover:text-accent-foreground',
      collapsed && 'justify-center px-2'
    );

  const renderNav = () => (
    <nav className='space-y-1'>
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={navClasses}
          onClick={onClose}
          title={collapsed ? link.label : undefined}
        >
          {link.icon}
          <span className={cn(collapsed && 'hidden')}>{link.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <>
      <aside className={cn(
        'hidden md:fixed md:left-0 md:top-0 md:z-30 md:flex md:h-full md:flex-col md:border-r md:bg-background',
        collapsed ? 'md:w-16' : 'md:w-64'
      )}>
        <div className='flex h-16 items-center border-b px-4'>
          <Link
            to='/'
            className='flex items-center gap-2 text-lg font-bold text-foreground'
          >
            <Box className='h-6 w-6 text-primary' />
            <span className={cn('font-bold', collapsed && 'hidden')}>CutterNest</span>
          </Link>
        </div>
        <div className='flex-1 overflow-y-auto p-3'>{renderNav()}</div>
        {onToggle && (
          <div className={cn('border-t p-3', collapsed && 'flex justify-center')}>
            <Button
              variant='ghost'
              size='icon'
              onClick={onToggle}
              aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            >
              {collapsed ? <PanelRightClose className='h-5 w-5' /> : <PanelLeftClose className='h-5 w-5' />}
            </Button>
          </div>
        )}
      </aside>

      <div className='md:hidden'>
        <Sheet open={mobileOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
          <SheetContent side='right' className='w-[280px]'>
            <SheetHeader className='mb-4'>
              <SheetTitle className='flex items-center gap-2'>
                <Box className='h-6 w-6 text-primary' />
                CutterNest
              </SheetTitle>
            </SheetHeader>
            {renderNav()}
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
