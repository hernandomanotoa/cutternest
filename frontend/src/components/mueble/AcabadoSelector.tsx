import { ACABADOS } from '../../utils/texturasMadera'

/**
 * Selector de acabado melamina para la vista 3D. "Color plano" (null)
 * restaura los colores por módulo actuales.
 */
export function AcabadoSelector({
  value,
  onChange,
}: {
  value: string | null
  onChange: (acabado: string | null) => void
}) {
  return (
    <label className='flex items-center gap-2 text-sm text-muted-foreground'>
      Acabado
      <select
        className='rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label='Acabado de melamina'
      >
        <option value=''>Color plano</option>
        {Object.entries(ACABADOS).map(([id, a]) => (
          <option key={id} value={id}>
            {a.nombre}
          </option>
        ))}
      </select>
    </label>
  )
}
