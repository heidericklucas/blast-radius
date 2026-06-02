import { Router, type NextFunction, type Request, type Response } from 'express'
import { and, eq } from 'drizzle-orm'
import type { DB } from '../db/client'
import { dependencies, services } from '../db/schema'
import { blastRadius, deployWaves, findCycles, findService, getGraph, resolveGraphId } from '../db/queries'
import { HttpError } from './errors'
import { dependencyInput, serviceInput } from './validation'

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<unknown>
const wrap = (fn: AsyncFn) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res, next).catch(next)
}

/** Express 5 types path params as `string | string[] | undefined`; narrow to a required string. */
function param(req: Request, name: string): string {
  const value = req.params[name]
  if (typeof value !== 'string') throw new HttpError(400, `Missing path parameter '${name}'.`)
  return value
}

export function buildRouter(db: DB): Router {
  const r = Router()

  const requireGraph = async (slug: string): Promise<string> => {
    const id = await resolveGraphId(db, slug)
    if (!id) throw new HttpError(404, `No graph with slug '${slug}'.`)
    return id
  }

  r.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  r.get(
    '/graphs/:slug',
    wrap(async (req, res) => {
      const graphId = await requireGraph(param(req, 'slug'))
      res.json(await getGraph(db, graphId))
    }),
  )

  // Blast radius: the transitive set of services that fail if this one fails.
  r.get(
    '/graphs/:slug/services/:id/blast-radius',
    wrap(async (req, res) => {
      const graphId = await requireGraph(param(req, 'slug'))
      const serviceId = param(req, 'id')
      const svc = await findService(db, graphId, serviceId)
      if (!svc) throw new HttpError(404, 'Service not found in this graph.')
      const impacted = await blastRadius(db, graphId, serviceId)
      res.json({ root: serviceId, count: impacted.length, impacted })
    }),
  )

  // All dependency cycles, each as the exact node path forming the loop.
  r.get(
    '/graphs/:slug/cycles',
    wrap(async (req, res) => {
      const graphId = await requireGraph(param(req, 'slug'))
      const cycles = await findCycles(db, graphId)
      res.json({ hasCycle: cycles.length > 0, cycles })
    }),
  )

  // Topological deploy order as waves; 409 (with the cycle) when none exists.
  r.get(
    '/graphs/:slug/deploy-order',
    wrap(async (req, res) => {
      const graphId = await requireGraph(param(req, 'slug'))
      const cycles = await findCycles(db, graphId)
      if (cycles.length > 0) {
        throw new HttpError(
          409,
          'A deploy order does not exist: the dependency graph contains a cycle.',
          { cycles },
        )
      }
      const waves = await deployWaves(db, graphId)
      const grouped = new Map<number, string[]>()
      for (const w of waves) {
        const arr = grouped.get(w.wave) ?? []
        arr.push(w.service_id)
        grouped.set(w.wave, arr)
      }
      const order = [...grouped.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([wave, ids]) => ({ wave, services: ids }))
      res.json({ total: waves.length, waves: order })
    }),
  )

  r.post(
    '/graphs/:slug/services',
    wrap(async (req, res) => {
      const graphId = await requireGraph(param(req, 'slug'))
      const input = serviceInput.parse(req.body)
      const created = (await db.insert(services).values({ graphId, ...input }).returning())[0]
      res.status(201).json(created)
    }),
  )

  r.delete(
    '/graphs/:slug/services/:id',
    wrap(async (req, res) => {
      const graphId = await requireGraph(param(req, 'slug'))
      const deleted = await db
        .delete(services)
        .where(and(eq(services.id, param(req, 'id')), eq(services.graphId, graphId)))
        .returning({ id: services.id })
      if (deleted.length === 0) throw new HttpError(404, 'Service not found in this graph.')
      res.status(204).end()
    }),
  )

  r.post(
    '/graphs/:slug/dependencies',
    wrap(async (req, res) => {
      const graphId = await requireGraph(param(req, 'slug'))
      const input = dependencyInput.parse(req.body)
      const created = (
        await db
          .insert(dependencies)
          .values({ graphId, fromService: input.from, toService: input.to, kind: input.kind, critical: input.critical })
          .returning()
      )[0]
      res.status(201).json(created)
    }),
  )

  r.delete(
    '/graphs/:slug/dependencies/:id',
    wrap(async (req, res) => {
      const graphId = await requireGraph(param(req, 'slug'))
      const deleted = await db
        .delete(dependencies)
        .where(and(eq(dependencies.id, param(req, 'id')), eq(dependencies.graphId, graphId)))
        .returning({ id: dependencies.id })
      if (deleted.length === 0) throw new HttpError(404, 'Dependency not found in this graph.')
      res.status(204).end()
    }),
  )

  return r
}
