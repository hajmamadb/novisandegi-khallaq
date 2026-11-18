'use client';

import { Award } from 'lucide-react';
import { toPersianDigits } from '@/lib/utils/persian';
import type { BadgeItem } from '@/lib/types';

interface BadgeShelfProps {
  badges: BadgeItem[];
}

/** Spec F.5 — badge shelf showing earned + in-progress badges. */
export function BadgeShelf({ badges }: BadgeShelfProps) {
  const earned = badges.filter((b) => b.earned);
  const inProgress = badges.filter((b) => !b.earned && b.progress && b.progress.target > 0);

  if (earned.length === 0 && inProgress.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border rounded-card p-4">
        <h3 className="text-sm font-medium mb-2">نشان‌ها</h3>
        <p className="text-xs text-text-secondary">هنوز نشانی کسب نشده</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-card p-4">
      <h3 className="text-sm font-medium mb-3">
        نشان‌ها ({toPersianDigits(String(earned.length))})
      </h3>
      <div className="flex flex-wrap gap-2">
        {earned.map((badge) => (
          <div
            key={badge.id}
            title={badge.descriptionFa}
            className="flex items-center gap-1.5 bg-accent/10 text-accent rounded-full px-3 py-1 text-xs font-medium"
          >
            <Award size={12} />
            {badge.titleFa}
          </div>
        ))}
        {inProgress.map((badge) => (
          <div
            key={badge.id}
            title={`${badge.titleFa} — ${badge.progress!.current}/${badge.progress!.target}`}
            className="flex items-center gap-1.5 bg-border/30 text-text-secondary rounded-full px-3 py-1 text-xs"
          >
            <Award size={12} />
            {badge.titleFa} ({toPersianDigits(String(badge.progress!.current))}/
            {toPersianDigits(String(badge.progress!.target))})
          </div>
        ))}
      </div>
    </div>
  );
}
