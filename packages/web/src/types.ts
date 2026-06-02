export interface Service {
  id: string
  key: string
  name: string
  kind: string
  tier: number
}

export interface Edge {
  id: string
  from: string
  to: string
  kind: string
  critical: boolean
}

export interface Graph {
  services: Service[]
  dependencies: Edge[]
}

export interface BlastRadius {
  root: string
  count: number
  impacted: Array<{ service_id: string; depth: number }>
}

export interface DeployOrder {
  total: number
  waves: Array<{ wave: number; services: string[] }>
}

export interface CycleInfo {
  hasCycle: boolean
  cycles: string[][]
}
