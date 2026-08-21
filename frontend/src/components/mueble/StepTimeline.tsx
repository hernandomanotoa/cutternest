import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';

export interface TimelineStep {
  id: string;
  numero: number;
  titulo: string;
}

export interface StepTimelineProps {
  steps: TimelineStep[];
  currentStep: number;
  onStepChange: (index: number) => void;
}

export function StepTimeline({ steps, currentStep, onStepChange }: StepTimelineProps) {
  if (steps.length === 0) return null;

  const progress = steps.length <= 1 ? 100 : (currentStep / (steps.length - 1)) * 100;
  const current = steps[currentStep];

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between gap-3'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => onStepChange(currentStep - 1)}
          disabled={currentStep === 0}
        >
          <ChevronLeft className='mr-1 h-4 w-4' />
          Anterior
        </Button>

        <span className='text-sm font-medium text-foreground'>
          Paso {current?.numero ?? currentStep + 1} de {steps.length}
        </span>

        <Button
          variant='outline'
          size='sm'
          onClick={() => onStepChange(currentStep + 1)}
          disabled={currentStep === steps.length - 1}
        >
          Siguiente
          <ChevronRight className='ml-1 h-4 w-4' />
        </Button>
      </div>

      <div className='relative flex items-center' aria-label='Línea de pasos de ensamblaje'>
        <div className='absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-secondary' />
        <div
          className='absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary transition-all duration-500'
          style={{ width: `${progress}%` }}
        />
        <div className='relative flex w-full justify-between'>
          {steps.map((step, index) => {
            const completed = index < currentStep;
            const active = index === currentStep;
            return (
              <button
                key={step.id}
                type='button'
                title={step.titulo}
                onClick={() => onStepChange(index)}
                className={cn(
                  'group relative flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  active
                    ? 'border-primary bg-primary'
                    : completed
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40 bg-background hover:border-primary/60'
                )}
                aria-current={active ? 'step' : undefined}
                aria-label={`Paso ${step.numero}: ${step.titulo}`}
              >
                <span
                  className={cn(
                    'absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100',
                    active ? 'text-primary opacity-100' : 'text-muted-foreground'
                  )}
                >
                  {step.numero}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
