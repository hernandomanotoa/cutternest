import type { CatalogResponse } from '../types'
import { api } from '../api/client'

let cache: CatalogResponse | null = null

export async function fetchCatalog(): Promise<CatalogResponse> {
  if (cache) return cache
  const response = await api.get<CatalogResponse>('/catalog')
  const data = response.data
  cache = data
  return data
}
