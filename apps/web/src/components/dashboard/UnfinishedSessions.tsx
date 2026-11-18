'use client';

import Link from 'next/link';
import { RotateCcw, ArrowLeft, Clock, Target, AlertTriangle } from 'lucide-react';
import { toPersianDigits } from '@/lib/utils/persian';
import { useCalendar } from '@/lib/calendar/calendar-provider';

export interface UnfinishedSession {
  id: string;
  status: string;
  startedAt: string;
  wordCount?: number | null;
  exerciseType?: {
    id?: string;
    title?: string;
    slug?: string;
    category?: string;
    durationSeconds?: number;
    wordTargetMin?: number;
    wordTargetMax?: number;
  } | null;
  exercise?: {
    title?: string;
    titleFa?: string;
  } | null;
}

interface UnfinishedSessionsProps {
  sessions: UnfinishedSession[];
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ABANDONED: {
    label: 'رهاشده',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  IN_PROGRESS: {
    label: 'در جریان',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  SUSPENDED: {
    label: 'معلق',
    className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  },
};

export function UnfinishedSessions({ sessions }: UnfinishedSessionsProps) {
  const { formatDate } = useCalendar();

  if (!sessions || sessions.length === 0) {
    return null;
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-accent animate-pulse" />
          <h3 className="text-sm font-bold text-text-primary">
            تمرین‌های نیمه‌کاره و رهاشده
          </h3>
          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
            {toPersianDigits(String(sessions.length))} تمرین برای تکمیل
          </span>
        </div>
        <span className="text-xs text-text-secondary hidden sm:inline">
          کلیک کنید تا ادامه دهید و ثبت کنید
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sessions.map((s) => {
          const title =
            s.exerciseType?.title ??
            s.exercise?.title ??
            s.exercise?.titleFa ??
            'تمرین نویسندگی';

          const statusInfo = STATUS_LABELS[s.status] ?? {
            label: 'تکمیل‌نشده',
            className: 'bg-bg-primary text-text-secondary border-border',
          };

          const targetMin = s.exerciseType?.wordTargetMin ?? 100;
          const currentWords = s.wordCount ?? 0;
          const progressPercent = Math.min(100, Math.round((currentWords / targetMin) * 100));

          return (
            <Link
              key={s.id}
              href={`/practice/${s.id}`}
              className="group flex flex-col justify-between p-3.5 rounded-lg border border-border bg-bg-primary hover:border-accent hover:shadow-sm transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-sm text-text-primary group-hover:text-accent transition-colors line-clamp-1">
                  {title}
                </span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 font-medium ${statusInfo.className}`}
                >
                  {statusInfo.label}
                </span>
              </div>

              {/* ملاک رهاشدگی / پیشرفت کلمات */}
              <div className="bg-bg-secondary/70 border border-border/60 rounded-md p-2 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
                    <Target className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      هدف {toPersianDigits(String(targetMin))} کلمه بوده، ولی در{' '}
                      <strong>{toPersianDigits(String(currentWords))}</strong> کلمه رها کردی
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-text-secondary shrink-0">
                    {toPersianDigits(String(progressPercent))}٪
                  </span>
                </div>

                {/* نوار بصری پیشرفت نسبت به هدف */}
                <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-text-secondary pt-1">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatDate(s.startedAt, true)}</span>
                </div>

                <div className="flex items-center gap-1 text-accent font-semibold text-xs group-hover:translate-x-[-2px] transition-transform">
                  <span>ادامه و تکمیل</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
