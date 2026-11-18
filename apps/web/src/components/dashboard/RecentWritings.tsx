'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { toPersianDigits } from '@/lib/utils/persian';
import { useCalendar } from '@/lib/calendar/calendar-provider';

interface RecentWriting {
  id: string;
  startedAt: string;
  wordCount: number | null;
  exercise: { titleFa: string } | null;
}

interface RecentWritingsProps {
  sessions: RecentWriting[];
}

/** Spec F.5 — list of most recent writing sessions. */
export function RecentWritings({ sessions }: RecentWritingsProps) {
  const { formatDate } = useCalendar();
  if (sessions.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border rounded-card p-4">
        <h3 className="text-sm font-medium mb-2">آخرین نوشته‌ها</h3>
        <p className="text-xs text-text-secondary">هنوز نوشته‌ای نداری</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-card p-4">
      <h3 className="text-sm font-medium mb-3">آخرین نوشته‌ها</h3>
      <ul className="space-y-2">
        {sessions.slice(0, 5).map((s) => (
          <li key={s.id}>
            <Link
              href={`/history?session=${s.id}`}
              className="flex items-center gap-3 text-sm hover:text-accent transition-colors"
            >
              <FileText size={14} className="text-text-secondary shrink-0" />
              <span className="flex-1 truncate">
                {s.exercise?.titleFa ?? 'تمرین'}
              </span>
              <span className="text-xs text-text-secondary shrink-0">
                {formatDate(s.startedAt, true)}
              </span>
              {s.wordCount != null && (
                <span className="text-xs text-accent shrink-0">
                  {toPersianDigits(String(s.wordCount))} کلمه
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
