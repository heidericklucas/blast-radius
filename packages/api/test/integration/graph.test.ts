import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { setupTestDb, type TestDb } from './db'
import { normalizeCycle, reverseReach, seedMesh, topoWaves } from './fixtures'
import { blastRadius, deployWaves, findCycles } from '../../src/db/queries'
import { MESHES } from '../../src/seed/mesh'

const acme = MESHES.find((m) => m.slug === 'acme')!
const tangled = MESHES.find((m) => m.slug === 'tangled')!

let ctx: TestDb

beforeAll(async () => {
  ctx = await setupTestDb()
}, 180_000)

afterAll(async () => {
  await ctx?.teardown()
})

beforeEach(async () => {
  await ctx.db.execute(sql`TRUNCATE graphs CASCADE`)
})

describe('blastRadius — recursive reverse-reachability in SQL', () => {
  it.each(['catalog-db', 'event-bus', 'redis-cache', 'auth-db'])(
    'matches the in-JS reference for a failing %s',
    async (key) => {
      const { graphId, idByKey, keyById } = await seedMesh(ctx.db, acme)
      const rows = await blastRadius(ctx.db, graphId, idByKey.get(key)!)
      const got = rows.map((r) => keyById.get(r.service_id)!).sort()
      const expected = [...reverseReach(acme, key)].sort()
      expect(got).toEqual(expected)
    },
  )

  it('a leaf service that nothing depends on has an empty blast radius', async () => {
    const { graphId, idByKey } = await seedMesh(ctx.db, acme)
    const rows = await blastRadius(ctx.db, graphId, idByKey.get('web-app')!)
    expect(rows).toHaveLength(0)
  })

  it('reports increasing depth as impact propagates outward', async () => {
    const { graphId, idByKey, keyById } = await seedMesh(ctx.db, acme)
    const rows = await blastRadius(ctx.db, graphId, idByKey.get('catalog-db')!)
    const depthByKey = new Map(rows.map((r) => [keyById.get(r.service_id)!, r.depth]))
    // catalog directly depends on catalog-db; web-app is several hops further out.
    expect(depthByKey.get('catalog')).toBe(1)
    expect(depthByKey.get('web-app')!).toBeGreaterThan(depthByKey.get('catalog')!)
  })
})

describe('deployWaves — topological layering in SQL', () => {
  it('matches the in-JS longest-path reference for every service', async () => {
    const { graphId, keyById } = await seedMesh(ctx.db, acme)
    const rows = await deployWaves(ctx.db, graphId)
    const got = new Map(rows.map((w) => [keyById.get(w.service_id)!, w.wave]))
    const expected = topoWaves(acme)
    expect(got.size).toBe(acme.services.length)
    for (const [key, wave] of expected) expect(got.get(key)).toBe(wave)
  })

  it('places databases/queues (depend on nothing) in wave 0', async () => {
    const { graphId, keyById } = await seedMesh(ctx.db, acme)
    const rows = await deployWaves(ctx.db, graphId)
    const wave0 = rows.filter((w) => w.wave === 0).map((w) => keyById.get(w.service_id)!).sort()
    expect(wave0).toEqual(
      ['auth-db', 'catalog-db', 'event-bus', 'orders-db', 'payments-db', 'redis-cache'].sort(),
    )
  })
})

describe('findCycles — cycle detection in SQL', () => {
  it('returns no cycles for the acme DAG', async () => {
    const { graphId } = await seedMesh(ctx.db, acme)
    expect(await findCycles(ctx.db, graphId)).toHaveLength(0)
  })

  it('finds the exact alpha→beta→gamma loop in the tangled graph', async () => {
    const { graphId, keyById } = await seedMesh(ctx.db, tangled)
    const cycles = await findCycles(ctx.db, graphId)
    expect(cycles).toHaveLength(1)
    const keys = cycles[0]!.map((id) => keyById.get(id)!)
    expect(normalizeCycle(keys)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('terminates (does not hang) on a cyclic graph', async () => {
    // Reaching this assertion at all proves the path-array guard stopped the recursion.
    const { graphId } = await seedMesh(ctx.db, tangled)
    const cycles = await findCycles(ctx.db, graphId)
    expect(cycles.length).toBeGreaterThan(0)
  })
})
