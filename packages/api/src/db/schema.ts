import { sql } from 'drizzle-orm'
import { boolean, check, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

/**
 * A service-dependency graph is stored as a plain relational adjacency list:
 * `services` are the nodes, `dependencies` are the directed edges. An edge
 * `from_service -> to_service` reads "from depends on to" (from needs to to run).
 * All graph analysis (blast radius, deploy order, cycles) is computed in SQL with
 * recursive CTEs over the `dependencies` table — see src/db/queries.ts.
 */

export const graphs = pgTable('graphs', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    graphId: uuid('graph_id')
      .notNull()
      .references(() => graphs.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('service'),
    tier: integer('tier').notNull().default(2),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('services_graph_key_uq').on(t.graphId, t.key),
    check('services_kind_check', sql`${t.kind} in ('service','database','cache','queue','gateway')`),
  ],
)

export const dependencies = pgTable(
  'dependencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    graphId: uuid('graph_id')
      .notNull()
      .references(() => graphs.id, { onDelete: 'cascade' }),
    fromService: uuid('from_service')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    toService: uuid('to_service')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('sync'),
    critical: boolean('critical').notNull().default(true),
  },
  (t) => [
    unique('dependencies_edge_uq').on(t.fromService, t.toService),
    check('dependencies_no_self_check', sql`${t.fromService} <> ${t.toService}`),
    check('dependencies_kind_check', sql`${t.kind} in ('sync','async','data')`),
  ],
)

export type ServiceKind = 'service' | 'database' | 'cache' | 'queue' | 'gateway'
export type DependencyKind = 'sync' | 'async' | 'data'
