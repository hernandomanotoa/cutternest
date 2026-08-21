import * as React from 'react';
import { cn } from '../../utils/cn';

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <div className={cn('flex items-center gap-1 rounded-lg border bg-muted/40 p-1', className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement<TabsTriggerProps>(child)) return child;
        return React.cloneElement(child, {
          active: child.props.value === value,
          onClick: () => onValueChange(child.props.value),
        });
      })}
    </div>
  );
}

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  active?: boolean;
}

export function TabsTrigger({ value, active, children, className, ...props }: TabsTriggerProps) {
  return (
    <button
      type='button'
      value={value}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-background/50 hover:text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
