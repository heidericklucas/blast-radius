import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { setupTestDb, type TestDb } from './db'
import { seedMesh } from './fixtures'
import { createApp } from '../../src/http/app'
import { MESHES } from '../../src/seed/mesh'

const acme = MESHES.find((m) => m.slug === 'acme')!
const tangled = MESHES.find((m) => m.slug === 'tangled')!

let ctx: TestDb
let app: ReturnType<typeof createApp>

beforeAll(async () => {
  ctx = await setupTestDb()
  app = createApp(ctx.db)
}, 180_000)

afterAll(async () => {
  await ctx?.teardown()
})

beforeEach(async () => {
  await ctx.db.execute(sql`TRUNCATE graphs CASCADE`)
})

describe('REST API', () => {
  it('GET /api/graphs/:slug returns the adjacency list', async () => {
    await seedMesh(ctx.db, acme)
    const res = await request(app).get('/api/graphs/acme')
    expect(res.status).toBe(200)
    expect(res.body.services).toHaveLength(acme.services.length)
    expect(res.body.dependencies).toHaveLength(acme.edges.length)
  })

  it('GET /deploy-order on a cyclic graph returns 409 with the exact cycle', async () => {
    await seedMesh(ctx.db, tangled)
    const res = await request(app).get('/api/graphs/tangled/deploy-order')
    expect(res.status).toBe(409)
    expect(res.body.details.cycles).toHaveLength(1)
    expect(res.body.details.cycles[0].length).toBe(3)
  })

  it('GET /deploy-order on a DAG returns ordered waves', async () => {
    await seedMesh(ctx.db, acme)
    const res = await request(app).get('/api/graphs/acme/deploy-order')
    expect(res.status).toBe(200)
    expect(res.body.waves[0].wave).toBe(0)
    expect(res.body.total).toBe(acme.services.length)
  })

  it('GET blast-radius for a missing service is 404', async () => {
    await seedMesh(ctx.db, acme)
    const res = await request(app).get(
      '/api/graphs/acme/services/00000000-0000-0000-0000-000000000000/blast-radius',
    )
    expect(res.status).toBe(404)
  })

  it('rejects a self-dependency with 400', async () => {
    const { idByKey } = await seedMesh(ctx.db, acme)
    const id = idByKey.get('catalog')!
    const res = await request(app).post('/api/graphs/acme/dependencies').send({ from: id, to: id })
    expect(res.status).toBe(400)
  })

  it('unknown graph slug is 404', async () => {
    const res = await request(app).get('/api/graphs/nope')
    expect(res.status).toBe(404)
  })
})
