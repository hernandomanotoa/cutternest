import { ACABADOS } from '../../utils/texturasMadera'

/**
 * Selector de acabado melamina para la vista 3D: botones con muestra de
 * color (spec §7). "Color plano" (null) restaura los colores por módulo.
 * El cambio es instantáneo: los materiales se regeneran con la misma
 * semilla y los anteriores se liberan (texture/material dispose).
 */
export function AcabadoSelector({
  value,
  onChange,
}: {
  value: string | null
  onChange: (acabado: string | null) => void
}) {
  return (
    <div className='flex flex-wrap items-center gap-2' role='group' aria-label='Acabado de melamina'>
      <span className='text-sm text-muted-foreground'>Acabado</span>
      <button
        type='button'
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={`rounded-md border px-2 py-1 text-xs transition-colors ${
          value === null
            ? 'border-primary bg-primary/10 font-semibold text-foreground'
            : 'border-border bg-background text-muted-foreground hover:text-foreground'
        }`}
      >
        Color plano
      </button>
      {Object.entries(ACABADOS).map(([id, a]) => {
        const activo = value === id
        return (
          <button
            key={id}
            type='button'
            aria-pressed={activo}
            title={a.nombre}
            onClick={() => onChange(id)}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
              activo
                ? 'border-primary bg-primary/10 font-semibold text-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            <span
              aria-hidden
              className='inline-block h-3.5 w-3.5 rounded-sm border border-border'
              style={{ backgroundColor: a.colorBase }}
            />
            {a.nombre}
          </button>
        )
      })}
    </div>
  )
}
