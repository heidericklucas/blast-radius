# Repository conventions

- This is a personal, public portfolio project by Lucas Vieira. All work is authored and
  published as his own. Do **not** add references to AI assistants, code generators, or
  "co-authored-by" trailers in commits, PRs, code comments, docs, or any other artifact.
- Commit as `Lucas Vieira <heidericklucas@gmail.com>` only.
- Keep the scope small and sharp: the graph engine (the three recursive CTEs) is the point.
  Verify SQL correctness with the Testcontainers integration tests before changing queries.
- Local dev: a Postgres is expected at `DATABASE_URL`. Tests use Testcontainers in CI and
  fall back to `TEST_DATABASE_URL` when set (e.g. a local Postgres) for fast local runs.
