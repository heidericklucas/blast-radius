import path from 'node:path'
import express, { type ErrorRequestHandler } from 'express'
import cors from 'cors'
import { ZodError } from 'zod'
import type { DB } from '../db/client'
import { buildRouter } from './routes'
import { HttpError } from './errors'

// Map Postgres SQLSTATE codes raised by the driver to clean HTTP responses.
const PG_ERROR_MAP: Record<string, [number, string]> = {
  '23505': [409, 'That record already exists.'],
  '23503': [400, 'A referenced service does not exist.'],
  '23514': [400, 'A constraint was violated.'],
  '22P02': [400, 'Malformed identifier.'],
}

export interface AppOptions {
  /** When set, the built web app is served from this directory (single-container demo). */
  webDir?: string
}

export function createApp(db: DB, opts: AppOptions = {}) {
  const app = express()
  app.use(cors())
  app.use(express.json())
  app.use('/api', buildRouter(db))

  if (opts.webDir) {
    const webDir = opts.webDir
    app.use(express.static(webDir))
    // SPA fallback for any non-API GET.
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(path.join(webDir, 'index.html'))
        return
      }
      next()
    })
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) })
      return
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid request body.', issues: err.issues })
      return
    }
    const code = (err as { code?: string }).code
    if (code && PG_ERROR_MAP[code]) {
      const [status, message] = PG_ERROR_MAP[code]
      res.status(status).json({ error: message })
      return
    }
    console.error(err)
    res.status(500).json({ error: 'Internal server error.' })
  }
  app.use(errorHandler)

  return app
}
