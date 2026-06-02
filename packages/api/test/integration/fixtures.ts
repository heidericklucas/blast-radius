import type { DB } from '../../src/db/client'
import { dependencies, graphs, services } from '../../src/db/schema'
import type { MeshGraph } from '../../src/seed/mesh'

export interface Seeded {
  graphId: string
  idByKey: Map<string, string>
  keyById: Map<string, string>
}

export async function seedMesh(db: DB, mesh: MeshGraph): Promise<Seeded> {
  const graph = (await db.insert(graphs).values({ slug: mesh.slug, name: mesh.name }).returning())[0]!
  const idByKey = new Map<string, string>()
  const keyById = new Map<string, string>()
  for (const s of mesh.services) {
    const row = (
      await db
        .insert(services)
        .values({ graphId: graph.id, key: s.key, name: s.name, kind: s.kind, tier: s.tier })
        .returning({ id: services.id })
    )[0]!
    idByKey.set(s.key, row.id)
    keyById.set(row.id, s.key)
  }
  for (const [from, to, kind] of mesh.edges) {
    await db.insert(dependencies).values({
      graphId: graph.id,
      fromService: idByKey.get(from)!,
      toService: idByKey.get(to)!,
      kind: kind ?? 'sync',
    })
  }
  return { graphId: graph.id, idByKey, keyById }
}

// --- Independent in-JS reference algorithms (for differential testing vs the SQL) ---

/** Every key that transitively depends on `startKey` (reverse reachability). */
export function reverseReach(mesh: MeshGraph, startKey: string): Set<string> {
  const dependents = new Map<string, string[]>()
  for (const [from, to] of mesh.edges) {
    const arr = dependents.get(to) ?? []
    arr.push(from)
    dependents.set(to, arr)
  }
  const out = new Set<string>()
  const stack = [...(dependents.get(startKey) ?? [])]
  while (stack.length) {
    const n = stack.pop()!
    if (out.has(n)) continue
    out.add(n)
    for (const d of dependents.get(n) ?? []) stack.push(d)
  }
  return out
}

/** Longest-dependency-chain depth per node (the deploy "wave"). Throws on a cycle. */
export function topoWaves(mesh: MeshGraph): Map<string, number> {
  const deps = new Map<string, string[]>()
  for (const s of mesh.services) deps.set(s.key, [])
  for (const [from, to] of mesh.edges) deps.get(from)!.push(to)

  const memo = new Map<string, number>()
  const visiting = new Set<string>()
  const wave = (k: string): number => {
    const cached = memo.get(k)
    if (cached !== undefined) return cached
    if (visiting.has(k)) throw new Error(`cycle through ${k}`)
    visiting.add(k)
    let w = 0
    for (const d of deps.get(k) ?? []) w = Math.max(w, wave(d) + 1)
    visiting.delete(k)
    memo.set(k, w)
    return w
  }
  for (const s of mesh.services) wave(s.key)
  return memo
}

/** Rotate a directed cycle to start at its alphabetically-smallest key (for comparison). */
export function normalizeCycle(keys: string[]): string[] {
  if (keys.length === 0) return keys
  const smallest = [...keys].sort()[0]!
  const at = keys.indexOf(smallest)
  return [...keys.slice(at), ...keys.slice(0, at)]
}
