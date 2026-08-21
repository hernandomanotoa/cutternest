export interface ExplodeControlProps {
  value: number;
  onChange: (value: number) => void;
}

export function ExplodeControl({ value, onChange }: ExplodeControlProps) {
  return (
    <div className='flex items-center gap-3 min-w-[14rem]'>
      <span className='text-xs font-medium text-muted-foreground whitespace-nowrap'>Vista explotada</span>
      <input
        type='range'
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className='h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-secondary accent-primary'
        aria-label='Factor de vista explotada'
      />
      <span className='w-10 text-right text-xs font-mono text-foreground'>
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}
