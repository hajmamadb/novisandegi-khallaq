'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Timeline, type TimelineItem } from '@/components/history/Timeline';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';

const PAGE_SIZE = 20;

interface HistoryStats {
  totalSessions: number;
  completedSessions: number;
  abandonedSessions: number;
  totalWords: number;
  totalMinutes: number;
  avgWordsPerSession: number;
  totalXpAwarded: number;
  byExercise: { id: string; slug: string; titleFa: string; count: number; words: number }[];
  byIntegrity: Record<string, number>;
  byMonth: { month: string; count: number; words: number }[];
}

const STATUS_OPTIONS = [
  { value: '', label: 'همه' },
  { value: 'SUBMITTED', label: 'ارسال‌شده' },
  { value: 'ABANDONED', label: 'رهاشده' },
  { value: 'IN_PROGRESS', label: 'در حال انجام' },
];

/**
 * Spec F.5 — `/history`: filters + `<Timeline>` + pagination (20/page) +
 * JSON/Markdown export.
 *
 * DECISION: export is a plain authenticated GET (the token lives in
 * localStorage, so fetch carries the Authorization header). We open the URL
 * in a new tab; the browser's Same-Origin policy lets the auth header ride
 * along and the Content-Disposition: attachment header triggers the download.
 */
export default function HistoryPage() {
  const token = useAuthStore((s) => s.token);

  // Filter state — the three filters the spec implies (status, exercise, date range).
  const [status, setStatus] = useState('');
  const [exerciseTypeId, setExerciseTypeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  // Timeline (paged).
  const timelineQuery = useQuery({
    queryKey: ['history-timeline', status, exerciseTypeId, from, to, page],
    enabled: Boolean(token),
    staleTime: 60 * 1000,
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (exerciseTypeId) params.set('exerciseTypeId', exerciseTypeId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get<{ items: TimelineItem[]; total: number; hasMore: boolean }>(
        `/history/timeline?${params.toString()}`,
      );
    },
  });

  // Lifetime stats (top summary cards).
  const statsQuery = useQuery({
    queryKey: ['history-stats'],
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<HistoryStats>('/history/stats'),
  });

  // Distinct exercise types available for the filter (from stats).
  const exercises = statsQuery.data?.byExercise ?? [];

  const hasFilters = status || exerciseTypeId || from || to;

  function resetFilters() {
    setStatus('');
    setExerciseTypeId('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  function applyFilter(fn: () => void) {
    fn();
    setPage(1);
  }

  function downloadExport(format: 'json' | 'markdown') {
    // Authenticated fetch → blob → programmatic download.
    const tokenVal = localStorage.getItem('token');
    fetch(`/api/v1/history/export?format=${format}`, {
      headers: tokenVal ? { Authorization: `Bearer ${tokenVal}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = format === 'json' ? 'history.json' : 'history.md';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(() => {
        // Fallback: open in a new tab (same-origin, header rides along).
        window.open(`/api/v1/history/export?format=${format}`, '_blank');
      });
  }

  const items = timelineQuery.data?.items ?? [];
  const stats = statsQuery.data;

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">تاریخچه</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadExport('json')}
              className="flex items-center gap-1.5 text-sm border border-border rounded-md px-3 py-2 hover:bg-bg-tertiary transition-colors"
            >
              <Download size={15} />
              JSON
            </button>
            <button
              onClick={() => downloadExport('markdown')}
              className="flex items-center gap-1.5 text-sm border border-border rounded-md px-3 py-2 hover:bg-bg-tertiary transition-colors"
            >
              <Download size={15} />
              Markdown
            </button>
          </div>
        </div>

        {/* Stats summary */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-bg-secondary border border-border rounded-card p-3">
              <p className="text-xs text-text-secondary">جلسات کل</p>
              <p className="text-lg font-bold">{toPersianDigits(String(stats.totalSessions))}</p>
            </div>
            <div className="bg-bg-secondary border border-border rounded-card p-3">
              <p className="text-xs text-text-secondary">کلمات نوشته‌شده</p>
              <p className="text-lg font-bold">{toPersianDigits(String(stats.totalWords))}</p>
            </div>
            <div className="bg-bg-secondary border border-border rounded-card p-3">
              <p className="text-xs text-text-secondary">مجموع امتیازات</p>
              <p className="text-lg font-bold">{toPersianDigits(String(stats.totalXpAwarded))}</p>
            </div>
            <div className="bg-bg-secondary border border-border rounded-card p-3">
              <p className="text-xs text-text-secondary">میانگین کلمه / جلسه</p>
              <p className="text-lg font-bold">{toPersianDigits(String(stats.avgWordsPerSession))}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-bg-secondary border border-border rounded-card p-3 grid grid-cols-1 sm:grid-cols-5 gap-2">
          <select
            value={status}
            onChange={(e) => applyFilter(() => setStatus(e.target.value))}
            className="bg-bg-tertiary border border-border rounded-md px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={exerciseTypeId}
            onChange={(e) => applyFilter(() => setExerciseTypeId(e.target.value))}
            className="bg-bg-tertiary border border-border rounded-md px-3 py-2 text-sm"
          >
            <option value="">همه تمرین‌ها</option>
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.titleFa || ex.slug}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={from}
            onChange={(e) => applyFilter(() => setFrom(e.target.value))}
            className="bg-bg-tertiary border border-border rounded-md px-3 py-2 text-sm"
            aria-label="از تاریخ"
          />

          <input
            type="date"
            value={to}
            onChange={(e) => applyFilter(() => setTo(e.target.value))}
            className="bg-bg-tertiary border border-border rounded-md px-3 py-2 text-sm"
            aria-label="تا تاریخ"
          />

          {hasFilters ? (
            <button
              onClick={resetFilters}
              className="text-sm border border-border rounded-md px-3 py-2 hover:bg-bg-tertiary transition-colors"
            >
              پاک کردن فیلترها
            </button>
          ) : (
            <div />
          )}
        </div>

        {/* Timeline */}
        <Timeline items={items} loading={timelineQuery.isLoading} />

        {/* Pagination */}
        {timelineQuery.data && timelineQuery.data.hasMore && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="text-sm border border-border rounded-md px-4 py-2 hover:bg-bg-tertiary disabled:opacity-40 transition-colors"
            >
              قبلی
            </button>
            <span className="text-sm text-text-secondary">
              صفحه {toPersianDigits(String(page))}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              className="text-sm border border-border rounded-md px-4 py-2 hover:bg-bg-tertiary transition-colors"
            >
              بعدی
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
