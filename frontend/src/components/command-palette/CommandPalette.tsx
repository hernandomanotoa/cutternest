import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Command,
  FolderOpen,
  LayoutDashboard,
  Box,
  Package,
  Plus,
} from 'lucide-react';
import { api } from '../../api/client';
import type { Project } from '../../types';
import { useCommandStore } from '../../stores/commandStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { cn } from '../../utils/cn';

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const { open, setOpen } = useCommandStore();
  const [query, setQuery] = React.useState('');
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setOpen]);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get('/projects')
      .then((response) => {
        const data = Array.isArray(response.data)
          ? response.data
          : response.data.projects || [];
        setProjects(data);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
    setQuery('');
    setSelectedIndex(0);
  }, [open]);

  const actions: CommandItem[] = React.useMemo(
    () => [
      {
        id: 'dashboard',
        label: 'Ir a inicio',
        icon: <LayoutDashboard className='h-4 w-4' />,
        onSelect: () => {
          navigate('/');
          setOpen(false);
        },
      },
      {
        id: 'optimizer',
        label: 'Ir a optimizador',
        icon: <Box className='h-4 w-4' />,
        onSelect: () => {
          navigate('/optimizer');
          setOpen(false);
        },
      },
      {
        id: 'projects',
        label: 'Ir a proyectos',
        icon: <FolderOpen className='h-4 w-4' />,
        onSelect: () => {
          navigate('/projects');
          setOpen(false);
        },
      },
      {
        id: 'inventory',
        label: 'Ir a inventario',
        icon: <Package className='h-4 w-4' />,
        onSelect: () => {
          navigate('/inventory');
          setOpen(false);
        },
      },
      {
        id: 'new-project',
        label: 'Nuevo proyecto',
        icon: <Plus className='h-4 w-4' />,
        onSelect: () => {
          navigate('/projects');
          setOpen(false);
        },
      },
    ],
    [navigate, setOpen]
  );

  const projectItems: CommandItem[] = React.useMemo(() => {
    const term = query.toLowerCase();
    return projects
      .filter((project) => project.name.toLowerCase().includes(term))
      .map((project) => ({
        id: `project-${project.id}`,
        label: project.name,
        icon: <FolderOpen className='h-4 w-4' />,
        onSelect: () => {
          navigate('/projects');
          setOpen(false);
        },
      }));
  }, [projects, query, navigate, setOpen]);

  const items = React.useMemo(
    () => [...actions, ...projectItems],
    [actions, projectItems]
  );

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      items[selectedIndex]?.onSelect();
    }
  };

  React.useEffect(() => {
    const element = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    element?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className='overflow-hidden p-0' onKeyDown={handleKeyDown}>
        <DialogHeader className='px-4 pb-0 pt-4'>
          <DialogTitle className='flex items-center gap-2'>
            <Search className='h-4 w-4' />
            Buscar o navegar
          </DialogTitle>
        </DialogHeader>
        <div className='px-4 py-2'>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='Buscar proyectos o acciones...'
              className='pl-9'
              autoFocus
            />
            <kbd className='pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline-block'>
              <Command className='inline h-3 w-3' />K
            </kbd>
          </div>
        </div>
        <div
          ref={listRef}
          className='max-h-[60vh] overflow-auto px-2 pb-2'
        >
          {items.length === 0 && !loading && (
            <p className='p-4 text-center text-sm text-muted-foreground'>
              Sin resultados
            </p>
          )}
          {items.map((item, index) => (
            <button
              key={item.id}
              type='button'
              onClick={item.onSelect}
              onMouseEnter={() => setSelectedIndex(index)}
              className={cn(
                'flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm transition-colors',
                index === selectedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-accent/50'
              )}
            >
              <span className='text-muted-foreground'>{item.icon}</span>
              <span className='flex-1'>{item.label}</span>
            </button>
          ))}
          {loading && (
            <p className='p-4 text-center text-sm text-muted-foreground'>
              Cargando proyectos...
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
