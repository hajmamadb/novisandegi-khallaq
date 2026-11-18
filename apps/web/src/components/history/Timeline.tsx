'use client';

import { CheckCircle2, XCircle, Clock, FileText } from 'lucide-react';
import { toPersianDigits } from '@/lib/utils/persian';
import { useCalendar } from '@/lib/calendar/calendar-provider';

export interface TimelineItem {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  exerciseType: { id: string; slug: string; title: string } | null;
  wordCount: number | null;
  durationSeconds: number | null;
  xpAwarded: number | null;
  integrityResult: string | null;
  submittedAt: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'ارسال‌شده', cls: 'text-green-600 bg-green-500/10' },
  ABANDONED: { label: 'رهاشده', cls: 'text-red-500 bg-red-500/10' },
  IN_PROGRESS: { label: 'در حال انجام', cls: 'text-amber-600 bg-amber-500/10' },
};

const INTEGRITY_META: Record<string, { label: string; cls: string }> = {
  PASSED: { label: 'یکپارچگی: سالم', cls: 'text-green-600' },
  WARNED: { label: 'یکپارچگی: هشدار', cls: 'text-amber-600' },
  FAILED: { label: 'یکپارچگی: ناموفق', cls: 'text-red-500' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'text-text-secondary bg-bg-tertiary' };
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
  );
}

/** Spec F.5 — one row in the history timeline. */
function TimelineRow({ item }: { item: TimelineItem }) {
  const { formatDate } = useCalendar();
  const integrity = item.integrityResult ? INTEGRITY_META[item.integrityResult] : null;
  return (
    <div className="bg-bg-secondary border border-border rounded-card p-4 flex items-start gap-3">
      {/* Status icon */}
      <span className="mt-0.5">
        {item.status === 'SUBMITTED' ? (
          <CheckCircle2 size={20} className="text-green-500" />
        ) : item.status === 'ABANDONED' ? (
          <XCircle size={20} className="text-red-400" />
        ) : (
          <Clock size={20} className="text-amber-500" />
        )}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">
            {item.exerciseType?.title ?? 'تمرین بدون عنوان'}
          </span>
          <StatusBadge status={item.status} />
        </div>
        <p className="text-xs text-text-secondary mt-1">
          {formatDate(item.startedAt, true)}
        </p>

        {/* Submission metrics */}
        {item.wordCount != null && (
          <div className="flex items-center gap-4 mt-2 text-xs text-text-secondary flex-wrap">
            <span className="flex items-center gap-1">
              <FileText size={13} />
              {toPersianDigits(String(item.wordCount))} کلمه
            </span>
            {item.durationSeconds != null && (
              <span>{toPersianDigits(String(Math.round(item.durationSeconds / 60)))} دقیقه</span>
            )}
            {item.xpAwarded != null && (
              <span className="text-accent">+{toPersianDigits(String(item.xpAwarded))} امتیاز</span>
            )}
            {integrity && <span className={integrity.cls}>{integrity.label}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

interface TimelineProps {
  items: TimelineItem[];
  loading?: boolean;
}

/** Spec F.5 — vertical list of the owner's sessions, newest first. */
export function Timeline({ items, loading }: TimelineProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-bg-secondary border border-border rounded-card p-4 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border rounded-card p-8 text-center text-text-secondary">
        هنوز هیچ جلسه‌ای ثبت نشده است.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <TimelineRow key={item.id} item={item} />
      ))}
    </div>
  );
}
