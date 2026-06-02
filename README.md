# Blast Radius

[![CI](https://github.com/heidericklucas/blast-radius/actions/workflows/ci.yml/badge.svg)](https://github.com/heidericklucas/blast-radius/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-22-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

**Model a service-dependency graph and answer the questions you only ask during an incident — entirely with Postgres recursive CTEs.**

When something breaks at 3am, you need answers fast:

- *"If `auth-db` goes down, exactly which user-facing services page?"* → **blast radius**
- *"What's the safe order to redeploy these 24 services?"* → **deploy order**
- *"Do we have a circular dependency that will deadlock a cold start?"* → **cycle detection**

Blast Radius models your services and their dependencies as a plain relational
adjacency list, then answers all three with `WITH RECURSIVE` queries — no graph
database, no in-memory BFS in the app layer. The hard logic lives in SQL, and it's
verified against a real Postgres with Testcontainers.

> A hosted demo will live at `blast-radius.lucashvieira.dev` (deploy in progress).
> Until then, it runs locally in about 30 seconds — see [Run it locally](#run-it-locally).

---

## The interesting part: the graph engine is SQL

An edge `from_service → to_service` reads *"from depends on to."* So the blast radius
of a failing node is **reverse reachability** — every service that can reach the failed
node by following dependency edges. A single recursive CTE computes it, with a `path[]`
array guard so the traversal terminates even when the graph contains cycles:

```sql
WITH RECURSIVE impact(service_id, path, depth) AS (
  -- seed: direct dependents of the failing node
  SELECT d.from_service, ARRAY[d.to_service, d.from_service], 1
  FROM dependencies d
  WHERE d.to_service = $1 AND d.graph_id = $2
  UNION ALL
  -- step: dependents of anything already impacted
  SELECT d.from_service, i.path || d.from_service, i.depth + 1
  FROM dependencies d
  JOIN impact i ON d.to_service = i.service_id
  WHERE d.graph_id = $2
    AND d.from_service <> ALL (i.path)   -- cycle guard: never revisit a node on this path
)
SELECT service_id, MIN(depth) AS depth
FROM impact GROUP BY service_id ORDER BY depth;
```

All three algorithms live in [`packages/api/src/db/queries.ts`](packages/api/src/db/queries.ts):

| Query | Technique | Returns |
| --- | --- | --- |
| `blastRadius` | reverse-reachability recursive CTE with a `path[]` cycle guard | every service that fails if the target fails, with hop distance |
| `deployWaves` | iterative topological layering (longest dependency chain) | ordered deploy "waves" (wave 0 depends on nothing) |
| `findCycles` | simple-path walk, canonicalized to the minimum node per loop | the exact node path of every dependency cycle |

### The hero moment

Ask for a deploy order on a graph that contains a cycle and the API refuses with
`409 Conflict` **and the exact loop**, which the UI highlights in red:

```http
GET /api/graphs/tangled/deploy-order  →  409 Conflict
{
  "error": "A deploy order does not exist: the dependency graph contains a cycle.",
  "details": { "cycles": [["alpha", "beta", "gamma"]] }
}
```

## How correctness is proven

The recursive CTEs are the kind of thing that's easy to get subtly wrong (infinite
recursion on cycles, off-by-one wave numbers, missed transitive edges). So the
integration tests use **differential testing**: an independent, in-JavaScript reference
implementation (reverse-reachability BFS and longest-path layering) is run against the
same fixtures, and the SQL output must match it exactly — across a clean DAG, a graph
with an `alpha → beta → gamma → alpha` cycle, and disconnected components. There's also
an explicit test that the cyclic graph **terminates** rather than hanging.

The suite boots a real Postgres with [Testcontainers](https://testcontainers.com/) by
default, and accepts a `TEST_DATABASE_URL` to run against an existing instance instead —
which is how CI runs it, against a Postgres service container, for speed and reliability.
See [`packages/api/test/integration`](packages/api/test/integration).

## Architecture

```
React 19 + Vite (d3-force SVG graph)  ──/api──▶  Express 5 REST API  ──▶  PostgreSQL
        packages/web                              packages/api          (graph engine in SQL)
```

In production a single container serves the built SPA and the API; Postgres runs
alongside it.

## Tech stack

- **Frontend** — React 19, Vite, TypeScript, a custom d3-force directed graph rendered to SVG
- **Backend** — Node 22, Express 5, Drizzle ORM + `postgres`, Zod validation
- **Database** — PostgreSQL, relational adjacency-list model, three recursive CTEs
- **Testing** — Vitest, Testcontainers, differential testing vs. an in-JS reference
- **Tooling** — pnpm workspaces, ESLint 9 flat config, tsup, GitHub Actions CI

## Run it locally

```bash
pnpm install

# 1. a Postgres (either works)
docker compose up -d postgres          # or point DATABASE_URL at your own
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/blast_radius

# 2. schema + demo data
pnpm db:migrate
pnpm seed

# 3. run api (:8080) and web (:5173)
pnpm dev
```

Open http://localhost:5173, click any node to see its blast radius, or switch to the
**Tangled** graph and hit *Plan deploy order* to watch it refuse a cyclic graph.

Run the test suite against an existing Postgres:

```bash
createdb blast_radius_test
TEST_DATABASE_URL=postgres://localhost:5432/blast_radius_test pnpm test
```

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/graphs/:slug` | the graph (services + dependency edges) |
| `GET` | `/api/graphs/:slug/services/:id/blast-radius` | transitive impact set of a failing service |
| `GET` | `/api/graphs/:slug/deploy-order` | topological deploy waves, or `409` with the cycle |
| `GET` | `/api/graphs/:slug/cycles` | every dependency cycle as a node path |
| `POST` | `/api/graphs/:slug/services` | add a service |
| `POST` | `/api/graphs/:slug/dependencies` | add a dependency edge |
| `DELETE` | `/api/graphs/:slug/services/:id` | remove a service |
| `DELETE` | `/api/graphs/:slug/dependencies/:id` | remove a dependency edge |

## Data model

```
graphs (id, slug, name)
  └─ services (id, graph_id, key, name, kind, tier)
       └─ dependencies (id, graph_id, from_service, to_service, kind, critical)
```

`dependencies` is the directed edge table — the entire graph engine operates over it.

## Where a graph DB would win

Recursive CTEs over an adjacency list are the right tool up to roughly thousands of
edges, which covers any real service mesh. Past that — million-edge social graphs,
deep variable-length traversals — a purpose-built graph database earns its keep. At
service-topology scale, a recursive CTE is simpler, needs no extra infrastructure, and
keeps a single source of truth in Postgres.

## Deploy

The repo builds to a single self-contained image:

```bash
docker build -t blast-radius .
docker run -p 8080:8080 -e DATABASE_URL=... blast-radius
```

The container applies migrations, seeds the demo meshes, and serves the SPA + API on
one port — intended for Dokploy + GHCR on a small VPS, with Neon's free tier as a
managed-Postgres alternative.

## License

MIT
