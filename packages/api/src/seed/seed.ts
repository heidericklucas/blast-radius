import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { createDb } from '../db/client'
import { dependencies, graphs, services } from '../db/schema'
import { MESHES } from './mesh'

const url = process.env.DATABASE_URL ?? 'postgres://localhost:5432/blast_radius'
const { db, client } = createDb(url)

for (const mesh of MESHES) {
  // Idempotent: cascade-delete any prior copy of this graph, then re-create it.
  await db.delete(graphs).where(eq(graphs.slug, mesh.slug))
  const graph = (await db.insert(graphs).values({ slug: mesh.slug, name: mesh.name }).returning())[0]!

  const idByKey = new Map<string, string>()
  for (const s of mesh.services) {
    const row = (
      await db
        .insert(services)
        .values({ graphId: graph.id, key: s.key, name: s.name, kind: s.kind, tier: s.tier })
        .returning({ id: services.id })
    )[0]!
    idByKey.set(s.key, row.id)
  }

  for (const [from, to, kind] of mesh.edges) {
    await db.insert(dependencies).values({
      graphId: graph.id,
      fromService: idByKey.get(from)!,
      toService: idByKey.get(to)!,
      kind: kind ?? 'sync',
    })
  }

  console.log(`seeded ${mesh.slug}: ${mesh.services.length} services, ${mesh.edges.length} edges`)
}

await client.end()
