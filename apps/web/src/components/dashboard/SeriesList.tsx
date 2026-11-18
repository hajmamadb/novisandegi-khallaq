'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Eye,
  Loader2,
  Moon,
  Pause,
  Play,
  Target,
  Users,
  Utensils,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import { toPersianDigits } from '@/lib/utils/persian';

/**
 * Spec Phase 2 — per-user exercise series (زنجیره‌های تمرین).
 *
 * GET  /gamification/series            — list all series (SENSES + PERSPECTIVE auto-init)
 * POST /gamification/series/start      — start MORNING_PAGES / WORD_GOAL
 * POST /gamification/series/:id/suspend — pause an active series
 * POST /gamification/series/:id/resume  — resume a paused series
 *
 * Progress is advanced automatically by the sessions submit hook (fire-and-forget).
 * SENSES and PERSPECTIVE are always present; MORNING_PAGES and WORD_GOAL need
 * an explicit «شروع» click (WORD_GOAL with a target prompt).
 */

// ---------------------------------------------------------------------------
// Types (mirror the API's SeriesDto)
// ---------------------------------------------------------------------------

export interface SeriesItem {
  key: string;
  label: string;
  done: boolean;
  doneAt?: string;
}

export interface SeriesDto {
  id: string;
  seriesType: string;
  status: string;
  remaining: SeriesItem[];
  done: SeriesItem[];
  total: number;
  completed: number;
  progressPct: number;
  target: number;
  current: number;
  lastActiveAt: string;
}

// ---------------------------------------------------------------------------
// Labels + icons
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  SENSES: 'پنج حواس',
  PERSPECTIVE: 'دیدگاه‌های متعدد',
  MORNING_PAGES: 'صفحه‌های صبحگاهی',
  WORD_GOAL: 'هدف کلمه',
};

const TYPE_ICONS: Record<string, typeof Eye> = {
  SENSES: Eye,
  PERSPECTIVE: Users,
  MORNING_PAGES: Moon,
  WORD_GOAL: Target,
};

// DECISION: SENSES and PERSPECTIVE are auto-init (no start button). SENSES is
// sequential: one place, five senses — each `five-senses` submit marks the
// NEXT remaining sense done (بینا→شنوا→بویا→چشایی→لمس). PERSPECTIVE advances
// one viewpoint per `perspectives` submit (دیدگاه ۱→۲→۳).

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SeriesList() {
  const queryClient = useQueryClient();
  const [targetDraft, setTargetDraft] = useState<string>('');

  const { data: series = [], isLoading } = useQuery({
    queryKey: ['series'],
    staleTime: 60 * 1000,
    queryFn: () => api.get<SeriesDto[]>('/gamification/series'),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['series'] });

  const start = useMutation({
    mutationFn: ({ type, target }: { type: string; target?: number }) =>
      api.post<SeriesDto>('/gamification/series/start', { type, target }),
    onSuccess: invalidate,
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.post<SeriesDto>(`/gamification/series/${id}/suspend`),
    onSuccess: invalidate,
  });

  const resume = useMutation({
    mutationFn: (id: string) => api.post<SeriesDto>(`/gamification/series/${id}/resume`),
    onSuccess: invalidate,
  });

  return (
    <div className="bg-bg-secondary border border-border rounded-card p-4">
      <h2 className="text-sm font-bold mb-3">زنجیره‌های تمرین</h2>

      {isLoading ? (
        <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
      ) : (
        <ul className="space-y-4">
          {series.map((s) => (
            <SeriesCard
              key={s.id}
              s={s}
              onStart={(type, target) => start.mutate({ type, target })}
              isStarting={start.isPending}
              onStartTarget={(target) => {
                setTargetDraft('');
                start.mutate({ type: 'WORD_GOAL', target });
              }}
              targetDraft={targetDraft}
              setTargetDraft={setTargetDraft}
              onSuspend={suspend.mutate}
              isSuspend={suspend.isPending}
              onResume={resume.mutate}
              isResume={resume.isPending}
            />
          ))}
          {series.length === 0 && (
            <li className="text-sm text-text-secondary">هنوز زنجیره‌ای فعال نیست.</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: one series row
// ---------------------------------------------------------------------------

function SeriesCard(props: {
  s: SeriesDto;
  onStart: (type: string, target?: number) => void;
  isStarting: boolean;
  onStartTarget: (target: number) => void;
  targetDraft: string;
  setTargetDraft: (v: string) => void;
  onSuspend: (id: string) => void;
  isSuspend: boolean;
  onResume: (id: string) => void;
  isResume: boolean;
}) {
  const { s } = props;
  const Icon = TYPE_ICONS[s.seriesType] ?? Eye;
  const label = TYPE_LABELS[s.seriesType] ?? s.seriesType;
  const isActive = s.status === 'ACTIVE';
  const isCompleted = s.status === 'COMPLETED';
  const isSuspended = s.status === 'SUSPENDED';

  // For WORD_GOAL show "X از Y کلمه"; for others "X از Y".
  const progressLabel =
    s.seriesType === 'WORD_GOAL'
      ? `${toPersianDigits(String(s.current))} از ${toPersianDigits(String(s.target))} کلمه`
      : `${toPersianDigits(String(s.completed))} از ${toPersianDigits(String(s.total))}`;

  return (
    <li className="space-y-2">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-accent shrink-0" />
        <p className="text-sm font-medium flex-1 truncate">{label}</p>

        {isCompleted ? (
          <span className="flex items-center gap-1 text-xs text-success whitespace-nowrap">
            <Check size={14} />
            کامل شد
          </span>
        ) : isSuspended ? (
          <button
            type="button"
            onClick={() => props.onResume(s.id)}
            disabled={props.isResume}
            className="flex items-center gap-1 text-xs text-accent hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
          >
            {props.isResume ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            ادامه
          </button>
        ) : isActive ? (
          s.seriesType === 'MORNING_PAGES' || s.seriesType === 'WORD_GOAL' ? (
            <button
              type="button"
              onClick={() => props.onSuspend(s.id)}
              disabled={props.isSuspend}
              className="flex items-center gap-1 text-xs text-text-secondary hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
            >
              {props.isSuspend ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
              توقف
            </button>
          ) : null
        ) : null}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-border rounded-full overflow-hidden" dir="ltr">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${Math.min(100, s.progressPct)}%` }}
        />
      </div>
      <p className="text-xs text-text-secondary">{progressLabel}</p>

      {/* Remaining items (for checklist-type series) */}
      {s.remaining.length > 0 && s.seriesType !== 'WORD_GOAL' && (
        <div className="flex flex-wrap gap-1.5">
          {s.remaining.slice(0, 5).map((item) => (
            <span
              key={item.key}
              className="text-xs bg-bg-tertiary border border-border rounded px-2 py-0.5 text-text-secondary"
            >
              {item.label}
            </span>
          ))}
          {s.remaining.length > 5 && (
            <span className="text-xs text-text-secondary">
              +{toPersianDigits(String(s.remaining.length - 5))}
            </span>
          )}
        </div>
      )}

      {/* Start buttons for MORNING_PAGES / WORD_GOAL when no active row */}
      {!isActive &&
        !isCompleted &&
        !isSuspended &&
        (s.seriesType === 'MORNING_PAGES' || s.seriesType === 'WORD_GOAL') && (
          <div className="flex items-center gap-2">
            {s.seriesType === 'MORNING_PAGES' && (
              <button
                type="button"
                onClick={() => props.onStart('MORNING_PAGES')}
                disabled={props.isStarting}
                className="flex items-center gap-1.5 bg-accent text-white rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {props.isStarting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Moon size={14} />
                )}
                شروع (۷ روز)
              </button>
            )}
            {s.seriesType === 'WORD_GOAL' && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={100}
                  step={100}
                  placeholder="هدف کلمه"
                  value={props.targetDraft}
                  onChange={(e) => props.setTargetDraft(e.target.value)}
                  className="w-28 bg-bg-tertiary border border-border rounded-md px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    const t = parseInt(props.targetDraft, 10) || 1000;
                    props.onStartTarget(t);
                  }}
                  disabled={props.isStarting}
                  className="flex items-center gap-1.5 bg-accent text-white rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {props.isStarting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Target size={14} />
                  )}
                  شروع
                </button>
              </div>
            )}
          </div>
        )}
    </li>
  );
}
