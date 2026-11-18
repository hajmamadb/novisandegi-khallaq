'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Gift, Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { toPersianDigits } from '@/lib/utils/persian';

/**
 * Spec I.10 + F.5 — today's daily quests (مأموریت‌های روزانه).
 *
 * GET /gamification/quests/today — three seeded daily quests with live
 * progress (hooks: StreakService.onSubmitted, sessions submit one-variety).
 * Claim = POST /gamification/quests/:id/claim → InkTransaction + XP ledger.
 *
 * DECISION: "claimed" is server-derived (completedAt + InkTransaction marker);
 * the card shows «دریافت شد» for a claimed quest and a claim button for a
 * completed-but-unclaimed one.
 */
export interface TodayQuest {
  id: string;
  slug: string;
  titleFa: string;
  type: string;
  conditionJson: unknown;
  rewardXp: number;
  rewardInk: number;
  progress: number;
  target: number;
  completedAt: string | null;
  claimed: boolean;
}

/** Spec F.5 — quest list card (staleTime 60s, matching /sessions). */
export function MissionsList() {
  const queryClient = useQueryClient();

  const { data: quests = [], isLoading } = useQuery({
    queryKey: ['quests-today'],
    staleTime: 60 * 1000,
    queryFn: () => api.get<TodayQuest[]>('/gamification/quests/today'),
  });

  const claim = useMutation({
    mutationFn: (id: string) => api.post<TodayQuest>(`/gamification/quests/${id}/claim`),
    onSuccess: () => {
      // DECISION: invalidate the whole key — reward changes can also affect
      // the XP bar / badge shelf on the same dashboard.
      void queryClient.invalidateQueries({ queryKey: ['quests-today'] });
    },
  });

  return (
    <div className="bg-bg-secondary border border-border rounded-card p-4">
      <h2 className="text-sm font-bold mb-3">مأموریت‌های امروز</h2>

      {isLoading ? (
        <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
      ) : (
        <ul className="space-y-3">
          {quests.map((q) => (
            <li key={q.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm truncate">{q.titleFa}</p>
                  <p className="text-xs text-text-secondary whitespace-nowrap">
                    {toPersianDigits(String(q.progress))} از {toPersianDigits(String(q.target))}
                    {q.rewardInk > 0 && ` · جوهر ${toPersianDigits(String(q.rewardInk))}`}
                    {q.rewardXp > 0 && ` · ${toPersianDigits(String(q.rewardXp))} امتیاز`}
                  </p>
                </div>
                {/* Progress bar */}
                <div className="mt-1.5 h-1.5 bg-border rounded-full overflow-hidden" dir="ltr">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{
                      width: `${Math.min(100, (q.progress / Math.max(1, q.target)) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {q.claimed ? (
                <span className="flex items-center gap-1 text-xs text-success whitespace-nowrap">
                  <Check size={14} />
                  دریافت شد
                </span>
              ) : q.completedAt ? (
                <button
                  type="button"
                  onClick={() => claim.mutate(q.id)}
                  disabled={claim.isPending}
                  className="flex items-center gap-1.5 bg-accent text-white rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
                >
                  {claim.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Gift size={14} />
                  )}
                  دریافت پاداش
                </button>
              ) : null}
            </li>
          ))}
          {quests.length === 0 && (
            <li className="text-sm text-text-secondary">مأموریتی برای امروز نیست.</li>
          )}
        </ul>
      )}
    </div>
  );
}
