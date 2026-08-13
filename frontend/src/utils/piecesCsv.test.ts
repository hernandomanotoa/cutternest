import { describe, it, expect } from 'vitest'
import { generateCsv, parseCsv, TEMPLATE_HASH } from './piecesCsv'
import type { PieceInput } from '../types'

describe('piecesCsv', () => {
  const sample: PieceInput[] = [
    {
      id: 'base',
      nombre: 'Base',
      ancho: 120,
      alto: 60,
      cantidad: 1,
      rotar: true,
      color: '#FF6B6B',
      espesor: 18,
      cantos: 'T,B,L,R',
    },
    {
      id: 'lateral-izq',
      nombre: 'Lateral Izq',
      ancho: 50,
      alto: 180,
      cantidad: 2,
      rotar: false,
      color: '#45B7D1',
      espesor: 18,
      cantos: 'T,B,L',
    },
  ]

  it('generates CSV with version header and template hash', () => {
    const csv = generateCsv(sample)
    expect(csv).toContain('CutterNest Piezas v1')
    expect(csv).toContain(`hash: ${TEMPLATE_HASH}`)
    expect(csv).toContain('id,nombre,ancho,alto,cantidad,rotar,color,espesor,cantos')
    expect(csv).toContain('Base,120,60,1,si,#FF6B6B,18,"T,B,L,R"')
    expect(csv).toContain('Lateral Izq,50,180,2,no,#45B7D1,18,"T,B,L"')
  })

  it('parses a generated CSV and returns pieces', () => {
    const csv = generateCsv(sample)
    const result = parseCsv(csv)
    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.pieces).toHaveLength(2)
    expect(result.pieces[0]).toEqual(sample[0])
    expect(result.pieces[1]).toEqual(sample[1])
  })

  it('rejects CSV with missing version header', () => {
    const result = parseCsv('id,nombre,ancho,alto,cantidad,rotar,color,espesor,cantos\n')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.error).toContain('cabecera')
  })

  it('rejects CSV with wrong template hash', () => {
    const csv = '# CutterNest Piezas v1\n# hash: 0000000000000000000000000000000000000000000000000000000000000000\nid,nombre,ancho,alto,cantidad,rotar,color,espesor,cantos\n'
    const result = parseCsv(csv)
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.error).toContain('hash')
  })

  it('rejects CSV with wrong columns', () => {
    const csv = `# CutterNest Piezas v1\n# hash: ${TEMPLATE_HASH}\nnombre,ancho\nBase,120\n`
    const result = parseCsv(csv)
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.error).toContain('columnas')
  })

  it('rejects row with invalid dimensions', () => {
    const csv = `# CutterNest Piezas v1\n# hash: ${TEMPLATE_HASH}\nid,nombre,ancho,alto,cantidad,rotar,color,espesor,cantos\nbase,Base,-10,60,1,si,#FF6B6B,18,\n`
    const result = parseCsv(csv)
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.error).toContain('ancho')
  })

  it('rejects row with invalid color', () => {
    const csv = `# CutterNest Piezas v1\n# hash: ${TEMPLATE_HASH}\nid,nombre,ancho,alto,cantidad,rotar,color,espesor,cantos\nbase,Base,120,60,1,si,red,18,\n`
    const result = parseCsv(csv)
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.error).toContain('color')
  })
})
