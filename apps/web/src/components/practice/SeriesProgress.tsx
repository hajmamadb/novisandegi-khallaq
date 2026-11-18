'use client';

import { Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { toPersianDigits } from '@/lib/utils/persian';

/**
 * Spec F.5.2 side column — «اگر سری‌محور: نوار پیشرفت سری».
 *
 * Shows the active series progress for a series-driven exercise slug:
 *   five-senses    → SENSES
 *   perspectives   → PERSPECTIVE
 *   morning-pages  → MORNING_PAGES
 *
 * WORD_GOAL is intentionally excluded: it is a cumulative user goal, not a
 * per-exercise track, so a progress bar next to an unrelated exercise would
 * be confusing.
 *
 * GET /gamification/series/by-type?type=… — no auto-init (a read on the
 * practice page must not create a series as a side effect). Returns null
 * (widget hidden) when no active series of that type exists.
 */

const SLUG_TO_TYPE: Record<string, string> = {
  'five-senses': 'SENSES',
  perspectives: 'PERSPECTIVE',
  'morning-pages': 'MORNING_PAGES',
};

const TYPE_LABELS: Record<string, string> = {
  SENSES: 'پنج حواس',
  PERSPECTIVE: 'دیدگاه‌های متعدد',
  MORNING_PAGES: 'صفحه‌های صبحگاهی',
};

interface SeriesDto {
  id: string;
  seriesType: string;
  status: string;
  remaining: { key: string; label: string; done: boolean }[];
  total: number;
  completed: number;
  progressPct: number;
  target: number;
  current: number;
}

export function SeriesProgress({ slug }: { slug: string }) {
  const seriesType = SLUG_TO_TYPE[slug];
  // Not a series-driven slug → render nothing.
  if (!seriesType) return null;

  const { data } = useQuery({
    queryKey: ['series', 'by-type', seriesType],
    staleTime: 30_000,
    queryFn: () => api.get<SeriesDto>(`/gamification/series/by-type?type=${seriesType}`),
  });

  // No active series of this type (or request in flight) → hidden.
  if (!data || data.status !== 'ACTIVE') return null;

  const label = TYPE_LABELS[data.seriesType] ?? data.seriesType;
  const pct = Math.min(100, data.progressPct);
  const allDone = data.total > 0 && data.completed >= data.total;

  return (
    <div className="border-t border-border pt-4">
      <h2 className="text-sm font-bold mb-2 flex items-center gap-2">
        <span>{label}</span>
        {allDone && (
          <span className="text-xs text-success inline-flex items-center gap-1">
            <Check size={12} /> کامل شد
          </span>
        )}
      </h2>
      <div className="h-1.5 bg-border rounded-full overflow-hidden" dir="ltr">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        {toPersianDigits(String(data.completed))} از {toPersianDigits(String(data.total))}
      </p>
      {data.remaining.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {data.remaining.slice(0, 5).map((item) => (
            <span
              key={item.key}
              className="text-xs bg-bg-tertiary border border-border rounded px-2 py-0.5 text-text-secondary"
            >
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
