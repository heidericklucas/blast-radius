import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const url = process.env.DATABASE_URL ?? 'postgres://localhost:5432/blast_radius'
const client = postgres(url, { max: 1 })

await migrate(drizzle(client), { migrationsFolder: 'migrations' })
await client.end()
console.log('migrations applied')
