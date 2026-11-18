'use client';

import { PenLine, Target, Clock } from 'lucide-react';
import { toPersianDigits } from '@/lib/utils/persian';

interface TodayCardProps {
  sessionsToday: number;
  wordsToday: number;
  minutesToday: number;
}

/** Spec F.5 — today's writing summary card. */
export function TodayCard({ sessionsToday, wordsToday, minutesToday }: TodayCardProps) {
  const items = [
    { icon: PenLine, label: 'جلسه', value: sessionsToday },
    { icon: Target, label: 'کلمه', value: wordsToday },
    { icon: Clock, label: 'دقیقه', value: minutesToday },
  ];

  return (
    <div className="bg-bg-secondary border border-border rounded-card p-4">
      <h3 className="text-sm font-medium mb-3">امروز</h3>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <Icon size={18} className="text-accent" />
            <span className="text-lg font-bold">{toPersianDigits(String(value))}</span>
            <span className="text-xs text-text-secondary">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
