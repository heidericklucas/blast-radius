import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from './api'
import type { BlastRadius, DeployOrder, Graph, Service } from './types'
import { GraphCanvas, type Highlight } from './components/GraphCanvas'

const EMPTY: Highlight = { root: null, impacted: new Set(), cycle: new Set() }

type Panel =
  | { kind: 'idle' }
  | { kind: 'blast'; root: string; result: BlastRadius }
  | { kind: 'deploy'; result: DeployOrder }
  | { kind: 'cycle'; cycles: string[][] }

const GRAPHS = [
  { slug: 'acme', label: 'Acme Commerce (24 services)' },
  { slug: 'tangled', label: 'Tangled (has a cycle)' },
]

export function App() {
  const [slug, setSlug] = useState('acme')
  const [graph, setGraph] = useState<Graph | null>(null)
  const [highlight, setHighlight] = useState<Highlight>(EMPTY)
  const [panel, setPanel] = useState<Panel>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setHighlight(EMPTY)
    setPanel({ kind: 'idle' })
    setError(null)
    api.graph(slug).then(setGraph).catch((e) => setError(String(e)))
  }, [slug])

  const byId = useMemo(() => {
    const m = new Map<string, Service>()
    for (const s of graph?.services ?? []) m.set(s.id, s)
    return m
  }, [graph])

  const name = useCallback((id: string) => byId.get(id)?.name ?? id, [byId])

  const onSelect = useCallback(
    async (id: string) => {
      setError(null)
      try {
        const result = await api.blastRadius(slug, id)
        setHighlight({ root: id, impacted: new Set(result.impacted.map((i) => i.service_id)), cycle: new Set() })
        setPanel({ kind: 'blast', root: id, result })
      } catch (e) {
        setError(String(e))
      }
    },
    [slug],
  )

  const planDeploy = useCallback(async () => {
    setError(null)
    try {
      const result = await api.deployOrder(slug)
      setHighlight(EMPTY)
      setPanel({ kind: 'deploy', result })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const cycles = ((e.body as { details?: { cycles?: string[][] } }).details?.cycles ?? []) as string[][]
        setHighlight({ root: null, impacted: new Set(), cycle: new Set(cycles.flat()) })
        setPanel({ kind: 'cycle', cycles })
      } else {
        setError(String(e))
      }
    }
  }, [slug])

  const reset = () => {
    setHighlight(EMPTY)
    setPanel({ kind: 'idle' })
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Blast Radius</h1>
          <p className="tagline">Service-dependency impact &amp; deploy-order analyzer — graph algorithms in Postgres.</p>
        </div>
        <select value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Choose a graph">
          {GRAPHS.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.label}
            </option>
          ))}
        </select>
      </header>

      <div className="main">
        <div className="canvas-wrap">{graph && <GraphCanvas graph={graph} highlight={highlight} onSelect={onSelect} />}</div>

        <aside className="sidebar">
          <div className="actions">
            <button onClick={planDeploy} className="primary">
              Plan deploy order
            </button>
            <button onClick={reset}>Reset</button>
          </div>

          {error && <div className="error">{error}</div>}

          {panel.kind === 'idle' && (
            <p className="hint">
              Click any node to see its <strong>blast radius</strong> — every service that fails if it fails.
              Or plan a deploy order; on a cyclic graph it refuses and highlights the loop.
            </p>
          )}

          {panel.kind === 'blast' && (
            <div>
              <h2>Blast radius of {name(panel.root)}</h2>
              <p className="count">{panel.result.count} services impacted</p>
              <ol className="list">
                {panel.result.impacted.map((i) => (
                  <li key={i.service_id}>
                    <span className="depth">+{i.depth}</span> {name(i.service_id)}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {panel.kind === 'deploy' && (
            <div>
              <h2>Deploy order</h2>
              <p className="count">{panel.result.waves.length} waves</p>
              {panel.result.waves.map((w) => (
                <div key={w.wave} className="wave">
                  <div className="wave-label">Wave {w.wave}</div>
                  <div className="wave-services">{w.services.map(name).join(', ')}</div>
                </div>
              ))}
            </div>
          )}

          {panel.kind === 'cycle' && (
            <div>
              <h2 className="danger">No deploy order exists</h2>
              <p>The dependency graph contains a cycle, so it cannot be topologically ordered:</p>
              {panel.cycles.map((c, idx) => (
                <div key={idx} className="cycle">
                  {c.map(name).join(' → ')} → {name(c[0]!)}
                </div>
              ))}
            </div>
          )}

          <div className="legend">
            <Legend color="#8b5cf6" label="gateway" />
            <Legend color="#3b82f6" label="service" />
            <Legend color="#10b981" label="database" />
            <Legend color="#f59e0b" label="cache" />
            <Legend color="#ec4899" label="queue" />
            <Legend color="#dc2626" label="failing / cycle" />
            <Legend color="#fb923c" label="impacted" />
          </div>
        </aside>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="legend-item">
      <span className="swatch" style={{ background: color }} /> {label}
    </span>
  )
}
