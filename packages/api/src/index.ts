import 'dotenv/config'
import { createDb } from './db/client'
import { createApp } from './http/app'

const url = process.env.DATABASE_URL ?? 'postgres://localhost:5432/blast_radius'
const port = Number(process.env.PORT ?? 8080)
const webDir = process.env.WEB_DIR

const { db } = createDb(url)
const app = createApp(db, { webDir })

app.listen(port, () => {
  console.log(`blast-radius api listening on :${port}${webDir ? ` (serving web from ${webDir})` : ''}`)
})
