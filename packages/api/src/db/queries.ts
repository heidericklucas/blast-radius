import { and, eq, sql } from 'drizzle-orm'
import type { DB } from './client'
import { dependencies, graphs, services } from './schema'

export async function resolveGraphId(db: DB, slug: string): Promise<string | null> {
  const rows = await db.select({ id: graphs.id }).from(graphs).where(eq(graphs.slug, slug)).limit(1)
  return rows[0]?.id ?? null
}

export interface ServiceRow {
  id: string
  key: string
  name: string
  kind: string
  tier: number
}
export interface EdgeRow {
  id: string
  from: string
  to: string
  kind: string
  critical: boolean
}

export async function getGraph(db: DB, graphId: string): Promise<{ services: ServiceRow[]; dependencies: EdgeRow[] }> {
  const svc = await db
    .select({ id: services.id, key: services.key, name: services.name, kind: services.kind, tier: services.tier })
    .from(services)
    .where(eq(services.graphId, graphId))
  const eds = await db
    .select({
      id: dependencies.id,
      from: dependencies.fromService,
      to: dependencies.toService,
      kind: dependencies.kind,
      critical: dependencies.critical,
    })
    .from(dependencies)
    .where(eq(dependencies.graphId, graphId))
  return { services: svc, dependencies: eds }
}

export async function findService(db: DB, graphId: string, serviceId: string): Promise<ServiceRow | null> {
  const rows = await db
    .select({ id: services.id, key: services.key, name: services.name, kind: services.kind, tier: services.tier })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.graphId, graphId)))
    .limit(1)
  return rows[0] ?? null
}

export interface ImpactRow {
  service_id: string
  depth: number
}

/**
 * Blast radius of a failing node: every service that transitively depends on it.
 * This is reverse-reachability — we walk the dependency edges *backward* from the
 * failing node (who-depends-on-me), accumulating a path[] of visited nodes so the
 * traversal terminates even when the graph contains cycles.
 */
export async function blastRadius(db: DB, graphId: string, serviceId: string): Promise<ImpactRow[]> {
  const rows = await db.execute(sql`
    WITH RECURSIVE impact(service_id, path, depth) AS (
      -- seed: direct dependents of the failing node
      SELECT d.from_service, ARRAY[d.to_service, d.from_service], 1
      FROM dependencies d
      WHERE d.to_service = ${serviceId} AND d.graph_id = ${graphId}
      UNION ALL
      -- step: dependents of anything already impacted
      SELECT d.from_service, i.path || d.from_service, i.depth + 1
      FROM dependencies d
      JOIN impact i ON d.to_service = i.service_id
      WHERE d.graph_id = ${graphId}
        AND d.from_service <> ALL (i.path)   -- cycle guard: never revisit a node on this path
    )
    SELECT service_id::text AS service_id, MIN(depth)::int AS depth
    FROM impact
    GROUP BY service_id
    ORDER BY depth, service_id
  `)
  return rows as unknown as ImpactRow[]
}

export interface WaveRow {
  service_id: string
  wave: number
}

/**
 * Deploy order as topological "waves". Wave 0 = services that depend on nothing;
 * each later wave depends only on earlier ones. A service's wave is the length of
 * its longest dependency chain (MAX over all paths). Only valid on a DAG — callers
 * must check findCycles() first, since a cyclic node has no finite wave.
 */
export async function deployWaves(db: DB, graphId: string): Promise<WaveRow[]> {
  const rows = await db.execute(sql`
    WITH RECURSIVE layer(service_id, wave) AS (
      SELECT s.id, 0
      FROM services s
      WHERE s.graph_id = ${graphId}
        AND NOT EXISTS (
          SELECT 1 FROM dependencies d
          WHERE d.from_service = s.id AND d.graph_id = ${graphId}
        )
      UNION ALL
      SELECT d.from_service, l.wave + 1
      FROM layer l
      JOIN dependencies d ON d.to_service = l.service_id AND d.graph_id = ${graphId}
      WHERE l.wave < 256   -- safety cap; real DAGs never approach this
    )
    SELECT service_id::text AS service_id, MAX(wave)::int AS wave
    FROM layer
    GROUP BY service_id
    ORDER BY wave, service_id
  `)
  return rows as unknown as WaveRow[]
}

/**
 * Every dependency cycle, each returned as the exact node path forming the loop.
 * We walk forward building simple paths (the `NOT ... = ANY(path)` guard keeps them
 * simple), then keep a walk only when its current node has an edge back to the start
 * AND the start is the lexicographically-smallest node in the path. That canonical
 * "rooted at the minimum node" rule reports each directed cycle exactly once.
 */
export async function findCycles(db: DB, graphId: string): Promise<string[][]> {
  const rows = await db.execute(sql`
    WITH RECURSIVE walk(start_id, current_id, path) AS (
      SELECT s.id, s.id, ARRAY[s.id]
      FROM services s
      WHERE s.graph_id = ${graphId}
      UNION ALL
      SELECT w.start_id, d.to_service, w.path || d.to_service
      FROM walk w
      JOIN dependencies d ON d.from_service = w.current_id AND d.graph_id = ${graphId}
      WHERE NOT d.to_service = ANY (w.path)   -- keep paths simple (no revisits)
        AND array_length(w.path, 1) < 64      -- safety cap on cycle length
    )
    SELECT w.path AS cycle
    FROM walk w
    JOIN dependencies d
      ON d.from_service = w.current_id AND d.to_service = w.start_id AND d.graph_id = ${graphId}
    WHERE w.start_id::text = (SELECT MIN(x::text) FROM unnest(w.path) AS x)   -- canonical root = min node (uuid has no min() aggregate, compare as text)
    ORDER BY array_length(w.path, 1)
  `)
  const raw = rows as unknown as { cycle: string[] }[]
  const seen = new Set<string>()
  const out: string[][] = []
  for (const r of raw) {
    const key = r.cycle.join('>')
    if (!seen.has(key)) {
      seen.add(key)
      out.push(r.cycle)
    }
  }
  return out
}
