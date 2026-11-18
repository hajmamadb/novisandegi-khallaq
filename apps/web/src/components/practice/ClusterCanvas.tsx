'use client';

// ---------------------------------------------------------------------------
// ClusterCanvas — the interactive force-directed word web for the six
// clustering exercises (spec G.10 / Phase B "خوشه‌ای + Force-Directed").
//
//   - The hub word sits center (bigger circle); candidate words orbit it.
//   - Drag any node to reposition (it stays pinned where you drop it).
//   - Click a candidate to add/remove it to the cluster.
//   - A live counter mirrors ExerciseValidator.checkClustering:
//     unique selected words (hub always counts) vs minHubWords.
//   - «کپی خوشه به پیش‌نویس» appends the cluster to the Tiptap draft.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { createNodes, step, type ForceNode } from '@/lib/forceGraph';
import { toPersianDigits } from '@/lib/utils/persian';

const WIDTH = 480;
const HEIGHT = 360;
const HUB_R = 34;
const CAND_R = 22;

interface ClusterCanvasProps {
  hubWord: string;
  candidates: { text: string; pos?: string | null }[];
  minHubWords: number;
  onCopyCluster: (clusterText: string) => void;
}

export function ClusterCanvas({
  hubWord,
  candidates,
  minHubWords,
  onCopyCluster,
}: ClusterCanvasProps) {
  const [nodes, setNodes] = useState<ForceNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settled, setSettled] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string } | null>(null);
  const movedRef = useRef(false);

  // Seed the sim once per hub/candidate set.
  useEffect(() => {
    setNodes(createNodes(hubWord, candidates.map((c) => c.text), WIDTH, HEIGHT));
    setSelected(new Set());
    setSettled(false);
  }, [hubWord, candidates]);

  // rAF loop: step the physics until it settles. Re-kicks on node changes
  // (e.g. unpin after drag) by depending on `settled`.
  useEffect(() => {
    if (settled) return;
    let raf = 0;
    let guard = 0;
    const tick = () => {
      guard += 1;
      setNodes((prev) => {
        const done = step(prev, WIDTH, HEIGHT);
        if (done && guard > 10) setSettled(true);
        // Return a new array identity so React re-renders every frame.
        return prev.map((n) => ({ ...n }));
      });
      if (guard < 300) raf = requestAnimationFrame(tick);
      else setSettled(true); // hard cap: ~5s at 60fps
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settled, nodes.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const hub = nodes[0];

  // Cluster = hub + selected candidates.
  const clusterWords = useMemo(() => {
    const list = [hubWord];
    for (const c of candidates) if (selected.has(c.text)) list.push(c.text);
    return list;
  }, [hubWord, candidates, selected]);

  const uniqueCount = new Set(clusterWords).size;
  const ready = uniqueCount >= minHubWords;

  // -------------------------------------------------------------------------
  // Pointer drag (pointer events → works for mouse + touch)
  // -------------------------------------------------------------------------

  const svgPoint = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    // The SVG is rendered responsive (width 100%); scale client coords.
    return {
      x: ((e.clientX - rect.left) / rect.width) * WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { id };
    movedRef.current = false;
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, pinned: true } : n)));
    setSettled(false); // let the web relax around the pinned node
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { id } = dragRef.current;
    const p = svgPoint(e);
    movedRef.current = true;
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, x: p.x, y: p.y, vx: 0, vy: 0 } : n)),
    );
  };

  const onPointerUp = () => {
    if (dragRef.current) {
      const { id } = dragRef.current;
      dragRef.current = null;
      // DECISION: release the pin and let the layout re-relax — matches
      // the "you can drag it anywhere" feel without a permanent override.
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, pinned: false } : n)));
      setSettled(false);
    }
  };

  // Distinguish a click (toggle selection) from a drag: only toggle if the
  // pointer barely moved (movedRef is set true in onPointerMove).
  const onNodeClick = (id: string, label: string) => {
    if (movedRef.current) return; // it was a drag, not a click
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleCopy = () => {
    if (clusterWords.length === 0) return;
    onCopyCluster(clusterWords.join('، '));
  };

  if (nodes.length === 0) {
    return (
      <div className="text-xs text-text-secondary py-6 text-center">
        در حال آماده‌سازی خوشه…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Live counter — mirrors ExerciseValidator.checkClustering */}
      <div
        className={`text-xs rounded-md p-2 flex items-center justify-between ${
          ready ? 'bg-success/10 text-success' : 'bg-bg-tertiary text-text-secondary'
        }`}
      >
        <span>
          کلمات خوشه: {toPersianDigits(String(uniqueCount))} از{' '}
          {toPersianDigits(String(minHubWords))}
        </span>
        {ready && <span>✓ کافی است</span>}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto touch-none select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ direction: 'ltr' }} // keep SVG coords LTR; labels are RTL
      >
        {/* Link lines hub → candidate (subtle) */}
        {nodes.slice(1).map((n) => (
          <line
            key={`link-${n.id}`}
            x1={hub.x}
            y1={hub.y}
            x2={n.x}
            y2={n.y}
            stroke={selected.has(n.label) ? 'var(--color-accent)' : 'var(--color-border)'}
            strokeOpacity={selected.has(n.label) ? 0.7 : 0.3}
            strokeWidth={selected.has(n.label) ? 1.5 : 1}
          />
        ))}

        {/* Candidate nodes */}
        {nodes.slice(1).map((n) => {
          const isSel = selected.has(n.label);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => onNodePointerDown(e, n.id)}
              onClick={() => onNodeClick(n.id, n.label)}
            >
              <circle
                r={CAND_R}
                fill={isSel ? 'var(--color-accent)' : 'var(--color-bg-tertiary)'}
                stroke={isSel ? 'var(--color-accent)' : 'var(--color-border)'}
                strokeWidth={1.5}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fill={isSel ? '#fff' : 'var(--color-text-secondary)'}
                style={{ fontFamily: 'inherit', pointerEvents: 'none' }}
              >
                {n.label}
              </text>
            </g>
          );
        })}

        {/* Hub node (bigger, always "in") */}
        <g transform={`translate(${hub.x}, ${hub.y})`} style={{ cursor: 'grab' }}>
          <circle
            r={HUB_R}
            fill="var(--color-accent)"
            fillOpacity={0.15}
            stroke="var(--color-accent)"
            strokeWidth={2}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={13}
            fontWeight={600}
            fill="var(--color-accent)"
            style={{ fontFamily: 'inherit', pointerEvents: 'none' }}
          >
            {hub.label}
          </text>
        </g>
      </svg>

      <button
        onClick={handleCopy}
        disabled={clusterWords.length === 0}
        className="flex items-center justify-center gap-2 w-full bg-accent text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        <Copy size={14} />
        کپی خوشه به پیش‌نویس
      </button>
    </div>
  );
}
