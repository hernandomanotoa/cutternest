import { ACABADOS, COMBINACIONES } from '../../utils/texturasMadera'

/**
 * Selección de acabado: combinación exterior + interior de caja (los
 * acabados sueltos son la combinación con interior Blanco Liso).
 * `null` = color plano por módulo.
 */
export interface SeleccionAcabado {
  exterior: string
  interior: string
}

export type AlcanceAcabado = 'todo' | 'internos'

/**
 * Selector de acabado melamina para la vista 3D (spec §7 extendido):
 * - Combinaciones curadas (exterior + interior de caja) con doble muestra.
 * - Acabados sueltos (interior Blanco Liso, carpintería real).
 * - "Color plano" (null) restaura los colores por módulo.
 * - Alcance: aplicar a todo el mueble o solo a los módulos internos (los
 *   de los extremos quedan en color plano — son los visibles desde fuera).
 * El cambio es instantáneo: los materiales se regeneran con la misma
 * semilla y los anteriores se liberan (texture/material dispose).
 */
export function AcabadoSelector({
  value,
  alcance,
  onChange,
  onAlcanceChange,
}: {
  value: SeleccionAcabado | null
  alcance: AlcanceAcabado
  onChange: (sel: SeleccionAcabado | null) => void
  onAlcanceChange: (alcance: AlcanceAcabado) => void
}) {
  const mismaSeleccion = (a: SeleccionAcabado | null, b: SeleccionAcabado | null) =>
    (a?.exterior ?? null) === (b?.exterior ?? null) && (a?.interior ?? null) === (b?.interior ?? null)

  return (
    <div className='flex flex-wrap items-center gap-x-4 gap-y-2' role='group' aria-label='Acabado de melamina'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-sm text-muted-foreground'>Combinaciones</span>
        {Object.entries(COMBINACIONES).map(([id, c]) => {
          const activo = mismaSeleccion(value, c)
          return (
            <button
              key={id}
              type='button'
              aria-pressed={activo}
              title={`Exterior ${ACABADOS[c.exterior]?.nombre ?? c.exterior} · interior ${ACABADOS[c.interior]?.nombre ?? c.interior}`}
              onClick={() => onChange({ exterior: c.exterior, interior: c.interior })}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                activo
                  ? 'border-primary bg-primary/10 font-semibold text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              <span aria-hidden className='flex overflow-hidden rounded-sm border border-border'>
                <span
                  className='inline-block h-3.5 w-3'
                  style={{ backgroundColor: ACABADOS[c.exterior]?.colorBase ?? '#000' }}
                />
                <span
                  className='inline-block h-3.5 w-3'
                  style={{ backgroundColor: ACABADOS[c.interior]?.colorBase ?? '#fff' }}
                />
              </span>
              {c.nombre}
            </button>
          )
        })}
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-sm text-muted-foreground'>Acabados</span>
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
          const activo = mismaSeleccion(value, { exterior: id, interior: 'blanco' })
          return (
            <button
              key={id}
              type='button'
              aria-pressed={activo}
              title={`${a.nombre} (interior Blanco Liso)`}
              onClick={() => onChange({ exterior: id, interior: 'blanco' })}
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

      <div className='flex items-center gap-2' role='group' aria-label='Alcance del acabado'>
        <span className='text-sm text-muted-foreground'>Aplicar a</span>
        {(
          [
            ['todo', 'Todo el mueble'],
            ['internos', 'Solo módulos internos'],
          ] as Array<[AlcanceAcabado, string]>
        ).map(([modo, etiqueta]) => (
          <button
            key={modo}
            type='button'
            aria-pressed={alcance === modo}
            title={
              modo === 'internos'
                ? 'Solo los módulos que no están en los extremos llevan acabado; los de los extremos quedan en color plano'
                : 'Todos los módulos llevan el acabado seleccionado'
            }
            onClick={() => onAlcanceChange(modo)}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              alcance === modo
                ? 'border-primary bg-primary/10 font-semibold text-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>
    </div>
  )
}
