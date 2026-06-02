import { z } from 'zod'

const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Must be a UUID.')

export const serviceInput = z.object({
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  kind: z.enum(['service', 'database', 'cache', 'queue', 'gateway']).default('service'),
  tier: z.number().int().min(0).max(9).default(2),
})
export type ServiceInput = z.infer<typeof serviceInput>

export const dependencyInput = z
  .object({
    from: uuidString,
    to: uuidString,
    kind: z.enum(['sync', 'async', 'data']).default('sync'),
    critical: z.boolean().default(true),
  })
  .refine((d) => d.from !== d.to, { message: 'A service cannot depend on itself.' })
export type DependencyInput = z.infer<typeof dependencyInput>
