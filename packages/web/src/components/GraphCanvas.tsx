import { useEffect, useRef, useState } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import type { Graph } from '../types'

const WIDTH = 920
const HEIGHT = 640

interface SimNode extends SimulationNodeDatum {
  id: string
  key: string
  name: string
  kind: string
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  id: string
}

const KIND_COLOR: Record<string, string> = {
  service: '#3b82f6',
  gateway: '#8b5cf6',
  database: '#10b981',
  cache: '#f59e0b',
  queue: '#ec4899',
}

export interface Highlight {
  root: string | null
  impacted: Set<string>
  cycle: Set<string>
}

export function GraphCanvas({
  graph,
  highlight,
  onSelect,
}: {
  graph: Graph
  highlight: Highlight
  onSelect: (id: string) => void
}) {
  const [, tick] = useState(0)
  const nodesRef = useRef<SimNode[]>([])
  const linksRef = useRef<SimLink[]>([])

  useEffect(() => {
    const nodes: SimNode[] = graph.services.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      kind: s.kind,
    }))
    const links: SimLink[] = graph.dependencies.map((d) => ({ id: d.id, source: d.from, target: d.to }))
    nodesRef.current = nodes
    linksRef.current = links

    const sim = forceSimulation(nodes)
      .force('charge', forceManyBody().strength(-460))
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((n) => n.id)
          .distance(92)
          .strength(0.65),
      )
      .force('center', forceCenter(WIDTH / 2, HEIGHT / 2))
      .force('collide', forceCollide(36))
      .on('tick', () => tick((x) => x + 1))

    return () => {
      sim.stop()
    }
  }, [graph])

  const nodes = nodesRef.current
  const links = linksRef.current

  const isHot = (id: string) => highlight.root === id || highlight.impacted.has(id) || highlight.cycle.has(id)

  const nodeFill = (n: SimNode): string => {
    if (highlight.cycle.has(n.id)) return '#ef4444'
    if (highlight.root === n.id) return '#dc2626'
    if (highlight.impacted.has(n.id)) return '#fb923c'
    return KIND_COLOR[n.kind] ?? '#64748b'
  }

  const hasHighlight = highlight.root !== null || highlight.impacted.size > 0 || highlight.cycle.size > 0

  return (
    <svg
      className="graph"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Service dependency graph"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
        </marker>
        <marker id="arrow-hot" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#fb923c" />
        </marker>
      </defs>

      {links.map((l) => {
        const s = l.source as SimNode
        const t = l.target as SimNode
        if (s.x == null || t.x == null) return null
        const hot = isHot(s.id) && isHot(t.id)
        const dim = hasHighlight && !hot
        return (
          <line
            key={l.id}
            x1={s.x}
            y1={s.y}
            x2={t.x}
            y2={t.y}
            stroke={hot ? '#fb923c' : '#475569'}
            strokeWidth={hot ? 2.5 : 1.25}
            strokeOpacity={dim ? 0.15 : 0.8}
            markerEnd={hot ? 'url(#arrow-hot)' : 'url(#arrow)'}
          />
        )
      })}

      {nodes.map((n) => {
        if (n.x == null || n.y == null) return null
        const dim = hasHighlight && !isHot(n.id)
        return (
          <g
            key={n.id}
            transform={`translate(${n.x},${n.y})`}
            className="node"
            opacity={dim ? 0.3 : 1}
            onClick={() => onSelect(n.id)}
            tabIndex={0}
            role="button"
            aria-label={`${n.name} (${n.kind})`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(n.id)
            }}
          >
            <circle r={18} fill={nodeFill(n)} stroke="#0f172a" strokeWidth={2} />
            <text y={32} textAnchor="middle" className="node-label">
              {n.key}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
