import type { BlastRadius, CycleInfo, DeployOrder, Graph } from './types'

const BASE = '/api'

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? res.statusText, body)
  }
  return (await res.json()) as T
}

export const api = {
  graph: (slug: string) => get<Graph>(`/graphs/${slug}`),
  blastRadius: (slug: string, id: string) =>
    get<BlastRadius>(`/graphs/${slug}/services/${id}/blast-radius`),
  deployOrder: (slug: string) => get<DeployOrder>(`/graphs/${slug}/deploy-order`),
  cycles: (slug: string) => get<CycleInfo>(`/graphs/${slug}/cycles`),
}
