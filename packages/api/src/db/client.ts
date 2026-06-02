import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export function createDb(url: string) {
  const client = postgres(url, { max: 10, onnotice: () => {} })
  const db = drizzle(client, { schema })
  return { db, client }
}

export type DB = ReturnType<typeof createDb>['db']
export type Sql = ReturnType<typeof createDb>['client']
