// ---------------------------------------------------------------------------
// forceGraph.ts — a tiny hand-rolled force-directed layout (no d3).
//
// DECISION: ~60-line simulation instead of a new dependency. The cluster
// web is small (1 hub + ≤15 candidates), so simple pairwise repulsion +
// hub gravity + friction settles it in a few hundred rAF frames.
//
// Contract:
//   - `createNodes(hub, candidates, w, h)` — seed positions (hub centered,
//     candidates on a ring with a tiny deterministic jitter).
//   - `step(nodes, w, h)` — one physics tick, returns a new nodes array
//     (positions mutated in place). The component calls it from rAF until
//     it reports the system is settled.
// ---------------------------------------------------------------------------

export interface ForceNode {
  id: string;
  label: string;
  isHub: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  // DECISION: pinned=true keeps a node under the cursor while dragging;
  // the sim skips its integration but it still exerts repulsion.
  pinned: boolean;
}

const REPULSION = 2600; // pairwise push strength
const GRAVITY = 0.06; // hub pull toward center
const FRICION = 0.82; // velocity damping per frame
const SETTLE_EPS = 0.05; // mean speed below this counts as "settled"

// Small deterministic jitter so the layout is stable across renders.
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) - 0.5; // [-0.5, 0.5)
}

export function createNodes(
  hubLabel: string,
  candidateLabels: string[],
  width: number,
  height: number,
): ForceNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.34;

  const nodes: ForceNode[] = [
    {
      id: 'hub',
      label: hubLabel,
      isHub: true,
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      pinned: false,
    },
  ];

  const n = candidateLabels.length;
  candidateLabels.forEach((label, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2;
    const r = radius * (0.85 + Math.abs(jitter(i + 1)) * 0.3);
    nodes.push({
      id: `c${i}`,
      label,
      isHub: false,
      x: cx + Math.cos(angle) * r + jitter(i + 101) * 12,
      y: cy + Math.sin(angle) * r + jitter(i + 202) * 12,
      vx: 0,
      vy: 0,
      pinned: false,
    });
  });

  return nodes;
}

/**
 * One physics tick. Mutates `nodes` (x/y/vx/vy) and returns them.
 * Returns true when the system has settled (mean |v| < SETTLE_EPS).
 */
export function step(nodes: ForceNode[], width: number, height: number): boolean {
  const cx = width / 2;
  const cy = height / 2;
  const w = Math.min(width, height);

  // Pairwise repulsion (n ≤ 16 → ≤120 pairs, trivial).
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) {
        // Coincident nodes: nudge apart deterministically.
        dx = jitter(i * 31 + j) + 0.1;
        dy = jitter(j * 31 + i) + 0.1;
        d2 = dx * dx + dy * dy;
      }
      const d = Math.sqrt(d2);
      const f = REPULSION / d2;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
  }

  // Hub gravity to center (candidates drift inward too, weaker).
  for (const node of nodes) {
    const g = node.isHub ? GRAVITY : GRAVITY * 0.35;
    node.vx += (cx - node.x) * g;
    node.vy += (cy - node.y) * g;

    // Soft wall: keep every node inside the viewBox with padding.
    const pad = 24;
    const minX = pad;
    const maxX = width - pad;
    const minY = pad;
    const maxY = height - pad;
    if (node.x < minX) node.vx += (minX - node.x) * 0.1;
    if (node.x > maxX) node.vx += (maxX - node.x) * 0.1;
    if (node.y < minY) node.vy += (minY - node.y) * 0.1;
    if (node.y > maxY) node.vy += (maxY - node.y) * 0.1;

    if (node.pinned) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= FRICION;
    node.vy *= FRICION;
    node.x += node.vx;
    node.y += node.vy;
  }

  // Keep everything hard-clamped inside the wall.
  for (const node of nodes) {
    node.x = Math.max(8, Math.min(width - 8, node.x));
    node.y = Math.max(8, Math.min(height - 8, node.y));
  }

  // Settled?
  let mean = 0;
  for (const node of nodes) {
    mean += Math.hypot(node.vx, node.vy);
  }
  mean /= Math.max(nodes.length, 1);
  // `w` unused when settled detection is speed-based; kept for clarity.
  void w;
  return mean < SETTLE_EPS;
}
