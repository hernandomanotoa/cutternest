import * as React from 'react';
import { Link } from 'react-router-dom';
import { Menu, Search, Command, Moon, Sun, User, LogOut, Box } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { useCommandStore } from '../../stores/commandStore';
import { api } from '../../api/client';
import { Button } from '../ui/Button';
import { Separator } from '../ui/Separator';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, isGuest, clear } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { setOpen: setCommandOpen } = useCommandStore();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignorar errores de red
    }
    clear();
    window.location.href = '/login';
  };

  return (
    <header className='fixed left-0 right-0 top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:left-64'>
      <div className='flex items-center gap-3'>
        <Button
          variant='ghost'
          size='icon'
          className='md:hidden'
          onClick={onMenuClick}
          aria-label='Abrir menú'
        >
          <Menu className='h-5 w-5' />
        </Button>
        <Link
          to='/'
          className='flex items-center gap-2 text-foreground md:hidden'
        >
          <Box className='h-6 w-6 text-primary' />
          <span className='font-bold'>CutterNest</span>
        </Link>
      </div>

      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          className='hidden gap-2 text-muted-foreground md:inline-flex'
          onClick={() => setCommandOpen(true)}
        >
          <Search className='h-4 w-4' />
          Buscar...
          <kbd className='ml-2 rounded border bg-muted px-1.5 text-xs'>
            <Command className='inline h-3 w-3' />K
          </kbd>
        </Button>

        <Button
          variant='ghost'
          size='icon'
          onClick={toggleTheme}
          aria-label='Cambiar tema'
        >
          {resolvedTheme === 'dark' ? (
            <Sun className='h-5 w-5' />
          ) : (
            <Moon className='h-5 w-5' />
          )}
        </Button>

        <div className='relative' ref={menuRef}>
          <Button
            variant='ghost'
            size='icon'
            className='rounded-full'
            onClick={() => setMenuOpen((open) => !open)}
            aria-label='Menú usuario'
          >
            <User className='h-5 w-5' />
          </Button>

          {menuOpen && (
            <div className='absolute right-0 mt-2 w-56 rounded-md border bg-popover p-2 text-popover-foreground shadow-lg'>
              <div className='px-2 py-1.5 text-sm font-medium'>
                {isGuest ? 'Invitado' : user?.username}
              </div>
              <div className='px-2 py-1.5 text-xs text-muted-foreground'>
                {isGuest ? 'Solo lectura' : user?.role}
              </div>
              <Separator className='my-2' />
              <button
                type='button'
                onClick={handleLogout}
                className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground'
              >
                <LogOut className='h-4 w-4' />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
