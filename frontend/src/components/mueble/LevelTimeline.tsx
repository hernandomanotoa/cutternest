import * as React from 'react';
import { cn } from '../../utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';

export interface LevelTimelineProps {
  levels: string[][];
  currentLevel: number;
  onLevelChange?: (index: number) => void;
  getPieceLabel?: (id: string) => string;
}

export function LevelTimeline({
  levels,
  currentLevel,
  onLevelChange,
  getPieceLabel,
}: LevelTimelineProps) {
  if (levels.length === 0) return null;

  return (
    <div className='space-y-3'>
      <h3 className='text-sm font-medium text-foreground'>Niveles de ensamblaje</h3>
      <div className='flex flex-col gap-3'>
        {levels.map((level, index) => {
          const active = index === currentLevel;
          return (
            <Card
              key={index}
              role='button'
              aria-label={`Nivel ${index + 1}`}
              aria-pressed={active}
              tabIndex={onLevelChange ? 0 : -1}
              onClick={() => onLevelChange?.(index)}
              onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onLevelChange?.(index);
                }
              }}
              className={cn(
                'transition-colors',
                onLevelChange ? 'cursor-pointer hover:border-primary' : 'cursor-default',
                active && 'border-primary ring-1 ring-primary'
              )}
            >
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium text-foreground'>
                  Nivel {index + 1}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='flex flex-wrap gap-2'>
                  {level.map((id) => (
                    <Badge key={id} variant={active ? 'default' : 'secondary'}>
                      {getPieceLabel ? getPieceLabel(id) : id}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
