import { Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, Box, FolderOpen, Package } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '../../utils/cn';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/Sheet';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
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
        : 'text-foreground hover:bg-accent hover:text-accent-foreground'
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
        >
          {link.icon}
          <span>{link.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <>
      <aside className='hidden md:fixed md:left-0 md:top-0 md:z-30 md:flex md:h-full md:w-64 md:flex-col md:border-r md:bg-background'>
        <div className='flex h-16 items-center border-b px-6'>
          <Link
            to='/'
            className='flex items-center gap-2 text-lg font-bold text-foreground'
          >
            <Box className='h-6 w-6 text-primary' />
            CutterNest
          </Link>
        </div>
        <div className='flex-1 p-4'>{renderNav()}</div>
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
