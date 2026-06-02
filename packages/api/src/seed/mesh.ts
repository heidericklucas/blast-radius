import type { DependencyKind, ServiceKind } from '../db/schema'

export interface MeshService {
  key: string
  name: string
  kind: ServiceKind
  tier: number
}

export interface MeshGraph {
  slug: string
  name: string
  services: MeshService[]
  /** [from, to] by service key — "from depends on to". */
  edges: Array<[string, string, DependencyKind?]>
}

/**
 * "acme" — a realistic ~24-service e-commerce mesh, intentionally a clean DAG so the
 * deploy-order planner has something meaningful to compute. Killing `catalog-db` or
 * `event-bus` produces a satisfyingly large blast radius.
 */
const acme: MeshGraph = {
  slug: 'acme',
  name: 'Acme Commerce',
  services: [
    { key: 'web-app', name: 'Web App', kind: 'service', tier: 0 },
    { key: 'mobile-bff', name: 'Mobile BFF', kind: 'service', tier: 0 },
    { key: 'gateway', name: 'API Gateway', kind: 'gateway', tier: 1 },
    { key: 'auth', name: 'Auth', kind: 'service', tier: 2 },
    { key: 'users', name: 'Users', kind: 'service', tier: 2 },
    { key: 'accounts', name: 'Accounts', kind: 'service', tier: 2 },
    { key: 'payments', name: 'Payments', kind: 'service', tier: 2 },
    { key: 'billing', name: 'Billing', kind: 'service', tier: 2 },
    { key: 'orders', name: 'Orders', kind: 'service', tier: 2 },
    { key: 'cart', name: 'Cart', kind: 'service', tier: 2 },
    { key: 'catalog', name: 'Catalog', kind: 'service', tier: 2 },
    { key: 'search', name: 'Search', kind: 'service', tier: 2 },
    { key: 'inventory', name: 'Inventory', kind: 'service', tier: 2 },
    { key: 'notifications', name: 'Notifications', kind: 'service', tier: 2 },
    { key: 'email-worker', name: 'Email Worker', kind: 'service', tier: 3 },
    { key: 'pricing', name: 'Pricing', kind: 'service', tier: 2 },
    { key: 'recommendations', name: 'Recommendations', kind: 'service', tier: 2 },
    { key: 'analytics', name: 'Analytics', kind: 'service', tier: 3 },
    { key: 'auth-db', name: 'Auth DB', kind: 'database', tier: 4 },
    { key: 'orders-db', name: 'Orders DB', kind: 'database', tier: 4 },
    { key: 'catalog-db', name: 'Catalog DB', kind: 'database', tier: 4 },
    { key: 'payments-db', name: 'Payments DB', kind: 'database', tier: 4 },
    { key: 'redis-cache', name: 'Redis Cache', kind: 'cache', tier: 4 },
    { key: 'event-bus', name: 'Event Bus', kind: 'queue', tier: 4 },
  ],
  edges: [
    ['web-app', 'gateway'],
    ['mobile-bff', 'gateway'],
    ['gateway', 'auth'],
    ['gateway', 'catalog'],
    ['gateway', 'search'],
    ['gateway', 'cart'],
    ['gateway', 'orders'],
    ['gateway', 'recommendations'],
    ['auth', 'auth-db'],
    ['auth', 'redis-cache'],
    ['users', 'auth-db'],
    ['accounts', 'users'],
    ['accounts', 'payments'],
    ['payments', 'payments-db'],
    ['payments', 'billing'],
    ['billing', 'payments-db'],
    ['billing', 'event-bus', 'async'],
    ['orders', 'orders-db'],
    ['orders', 'payments'],
    ['orders', 'inventory'],
    ['orders', 'event-bus', 'async'],
    ['cart', 'redis-cache'],
    ['cart', 'catalog'],
    ['catalog', 'catalog-db'],
    ['catalog', 'redis-cache'],
    ['search', 'catalog'],
    ['search', 'catalog-db'],
    ['inventory', 'orders-db'],
    ['inventory', 'event-bus', 'async'],
    ['notifications', 'event-bus', 'async'],
    ['notifications', 'email-worker'],
    ['email-worker', 'event-bus', 'async'],
    ['pricing', 'catalog-db'],
    ['recommendations', 'catalog'],
    ['recommendations', 'analytics'],
    ['analytics', 'event-bus', 'async'],
  ],
}

/**
 * "tangled" — a small graph with an intentional cycle (alpha -> beta -> gamma -> alpha).
 * Asking for a deploy order here returns 409 with the exact loop highlighted: the
 * screenshot-worthy hero moment.
 */
const tangled: MeshGraph = {
  slug: 'tangled',
  name: 'Tangled Services',
  services: [
    { key: 'alpha', name: 'Alpha', kind: 'service', tier: 1 },
    { key: 'beta', name: 'Beta', kind: 'service', tier: 1 },
    { key: 'gamma', name: 'Gamma', kind: 'service', tier: 1 },
    { key: 'delta', name: 'Delta', kind: 'service', tier: 0 },
    { key: 'epsilon', name: 'Epsilon', kind: 'service', tier: 0 },
  ],
  edges: [
    ['epsilon', 'delta'],
    ['delta', 'alpha'],
    ['alpha', 'beta'],
    ['beta', 'gamma'],
    ['gamma', 'alpha'],
  ],
}

export const MESHES: MeshGraph[] = [acme, tangled]
