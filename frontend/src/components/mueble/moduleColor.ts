// Paleta de colores por módulo. Vive en su propio módulo (sin dependencias de
// three.js) para que AssemblyPage pueda usar getModuleColor sin arrastrar el
// bundle 3D cuando la escena se carga de forma diferida.
const MODULE_PALETTE = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#d946ef',
  '#f43f5e',
]

export function getModuleColor(modulo?: string): string {
  if (!modulo) return '#64748b'
  let hash = 0
  for (let i = 0; i < modulo.length; i++) hash = modulo.charCodeAt(i) + ((hash << 5) - hash)
  const index = Math.abs(hash) % MODULE_PALETTE.length
  return MODULE_PALETTE[index]
}
