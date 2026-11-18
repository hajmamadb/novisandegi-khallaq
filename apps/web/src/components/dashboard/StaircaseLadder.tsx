'use client';

import { Check, RotateCcw, Target, TrendingUp } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { toPersianDigits } from '@/lib/utils/persian';

/**
 * Spec Phase 2 — Word Target Staircase (پله‌های سکو).
 *
 * 8-step ladder: 50 → 100 → 150 → 200 → 300 → 500 → 750 → 1000
 *
 * Each rung unlocks after 3 successful days (wordCount within ±10 % of
 * the rung target). Progression is driven automatically by the submit-time
 * hook in SessionsService — no explicit start needed.
 *
 * GET  /gamification/staircase         — read (lazy-create) state
 * POST /gamification/staircase/reset   — reset back to rung 0
 */

interface StaircaseDto {
  id: string;
  rungIndex: number;
  currentTarget: number;
  hitsToday: boolean;
  hitsThisRung: number;
  hitsRequired: number;
  progressPct: number;
  status: string;
  createdAt: string;
}

const WORD_LADDER = [50, 100, 150, 200, 300, 500, 750, 1000] as const;

export function StaircaseLadder() {
  const queryClient = useQueryClient();

  const { data: sc, isLoading } = useQuery({
    queryKey: ['staircase'],
    staleTime: 60 * 1000,
    queryFn: () => api.get<StaircaseDto>('/gamification/staircase'),
  });

  const reset = useMutation({
    mutationFn: () => api.post<StaircaseDto>('/gamification/staircase/reset'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staircase'] }),
  });

  if (isLoading) {
    return (
      <div className="bg-bg-secondary border border-border rounded-card p-4">
        <h2 className="text-sm font-bold mb-3">پله‌های سکو</h2>
        <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
      </div>
    );
  }

  if (!sc) return null;

  const isCompleted = sc.status === 'COMPLETED';
  const currentRung = sc.rungIndex;

  return (
    <div className="bg-bg-secondary border border-border rounded-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target size={16} className="text-accent shrink-0" />
        <h2 className="text-sm font-bold flex-1">پله‌های سکو</h2>
        {isCompleted ? (
          <span className="flex items-center gap-1 text-xs text-success whitespace-nowrap">
            <Check size={14} /> کامل شد
          </span>
        ) : (
          <button
            type="button"
            onClick={() => reset.mutate()}
            disabled={reset.isPending}
            className="flex items-center gap-1 text-xs text-text-secondary hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
            title="بازنشانی به پله‌ی اول"
          >
            <RotateCcw size={12} />
            بازنشانی
          </button>
        )}
      </div>

      {/* Ladder visualization */}
      <div className="space-y-1.5" dir="rtl">
        {WORD_LADDER.map((target, i) => {
          const isDone = isCompleted || i < currentRung;
          const isCurrent = !isCompleted && i === currentRung;
          const isLocked = !isCompleted && i > currentRung;

          return (
            <div
              key={target}
              className={`flex items-center gap-2 text-xs rounded-md px-2 py-1 border ${
                isDone
                  ? 'border-success/40 bg-success/10 text-success'
                  : isCurrent
                    ? 'border-accent bg-accent/10 text-accent font-bold'
                    : 'border-border bg-bg-tertiary text-text-secondary'
              }`}
            >
              <span className="w-5 text-center shrink-0">
                {isDone ? (
                  <Check size={12} />
                ) : isCurrent ? (
                  <TrendingUp size={12} />
                ) : (
                  <span className="text-[10px]">🔒</span>
                )}
              </span>
              <span className="flex-1">
                {toPersianDigits(String(target))} کلمه
              </span>
              {isCurrent && (
                <span className="text-[10px] whitespace-nowrap">
                  {toPersianDigits(String(sc.hitsThisRung))}/
                  {toPersianDigits(String(sc.hitsRequired))} روز
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Today's status */}
      {!isCompleted && (
        <p className="mt-3 text-xs text-text-secondary">
          {sc.hitsToday
            ? 'امروز یک ضربه ثبت شد.'
            : 'هنوز امروز ضربه‌ای ثبت نشده است.'}
        </p>
      )}
    </div>
  );
}
