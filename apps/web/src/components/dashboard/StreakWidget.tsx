'use client';

import { Flame } from 'lucide-react';
import { toPersianDigits } from '@/lib/utils/persian';

interface StreakWidgetProps {
  currentStreak: number;
  bestStreak: number;
}

/** Spec F.5 — streak display widget. */
export function StreakWidget({ currentStreak, bestStreak }: StreakWidgetProps) {
  return (
    <div className="bg-bg-secondary border border-border rounded-card p-4">
      <div className="flex items-center gap-3">
        <div
          className={`p-3 rounded-full ${
            currentStreak > 0 ? 'bg-warning/10 text-warning' : 'bg-border/30 text-text-secondary'
          }`}
        >
          <Flame size={24} />
        </div>
        <div>
          <p className="text-2xl font-bold">
            {toPersianDigits(String(currentStreak))}
            <span className="text-sm font-normal text-text-secondary mr-1">روز</span>
          </p>
          <p className="text-xs text-text-secondary">
            بهترین: {toPersianDigits(String(bestStreak))} روز
          </p>
        </div>
      </div>
    </div>
  );
}
