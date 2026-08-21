import * as React from 'react';
import { cn } from '../../utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger';
}

const variants = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/80 border-transparent',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent',
  outline: 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
  success: 'bg-success text-success-foreground hover:bg-success/80 border-transparent',
  warning: 'bg-warning text-warning-foreground hover:bg-warning/80 border-transparent',
  danger: 'bg-danger text-danger-foreground hover:bg-danger/80 border-transparent',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';
