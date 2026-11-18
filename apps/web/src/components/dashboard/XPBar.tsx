'use client';

import { toPersianDigits } from '@/lib/utils/persian';

interface XPBarProps {
  level: number;
  xpCurrent: number;
  xpTarget: number;
}

/** Spec F.5 — XP progress bar for current level. */
export function XPBar({ level, xpCurrent, xpTarget }: XPBarProps) {
  const pct = xpTarget > 0 ? Math.min(100, Math.round((xpCurrent / xpTarget) * 100)) : 0;

  return (
    <div className="bg-bg-secondary border border-border rounded-card p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium">
          سطح {toPersianDigits(String(level))}
        </span>
        <span className="text-xs text-text-secondary">
          {toPersianDigits(String(xpCurrent))} از {toPersianDigits(String(xpTarget))} امتیاز
        </span>
      </div>
      <div className="w-full h-3 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
