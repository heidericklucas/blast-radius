import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { createDb, type DB, type Sql } from '../../src/db/client'

export interface TestDb {
  db: DB
  client: Sql
  teardown: () => Promise<void>
}

/**
 * Provides a real Postgres for the integration suite. By default it boots one with
 * Testcontainers (this is what runs in CI). For fast local runs, set TEST_DATABASE_URL
 * to point at an existing Postgres and it will be used instead.
 */
export async function setupTestDb(): Promise<TestDb> {
  const envUrl = process.env.TEST_DATABASE_URL
  let url: string
  let stopContainer = async (): Promise<void> => {}

  if (envUrl) {
    url = envUrl
  } else {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql')
    const container = await new PostgreSqlContainer('postgres:17').start()
    url = container.getConnectionUri()
    stopContainer = async () => {
      await container.stop()
    }
  }

  const migrator = postgres(url, { max: 1 })
  await migrate(drizzle(migrator), { migrationsFolder: 'migrations' })
  await migrator.end()

  const { db, client } = createDb(url)
  return {
    db,
    client,
    teardown: async () => {
      await client.end()
      await stopContainer()
    },
  }
}
