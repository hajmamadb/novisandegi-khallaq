'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';
import { useCalendar } from '@/lib/calendar/calendar-provider';

interface Notification {
  id: string;
  type: string;
  titleFa: string;
  bodyFa: string;
  readAt: string | null;
  createdAt: string;
}

/**
 * `/notifications` — the user's notification list (newest first) with
 * single-item read + mark-all-read. The topbar badge (in AppShell) reads the
 * same unread count, so we invalidate ['notifications-unread'] after any
 * read action to keep it in sync.
 */
export default function NotificationsPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const { formatDate } = useCalendar();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    enabled: Boolean(token),
    staleTime: 30 * 1000,
    queryFn: () => api.get<Notification[]>('/notifications'),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
  };

  const markRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      refresh();
    } catch {
      // silent — the list just keeps the old state
    }
  };

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all');
      refresh();
    } catch {
      // silent
    }
  };

  const visible =
    filter === 'unread' ? items.filter((n) => !n.readAt) : items;

  const fmt = (iso: string) => formatDate(iso, true);

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">اعلان‌ها</h1>
          <button
            onClick={markAll}
            className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          >
            <CheckCheck size={14} />
            خواندن همه
          </button>
        </div>

        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full border ${
              filter === 'all'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-text-secondary'
            }`}
          >
            همه
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1 rounded-full border ${
              filter === 'unread'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-text-secondary'
            }`}
          >
            خوانده‌نشده
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-text-secondary">اعلانی ثبت نشده</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((n) => (
              <li
                key={n.id}
                className={`rounded-card border border-border bg-bg-secondary p-3 ${
                  n.readAt ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{n.titleFa}</p>
                    {n.bodyFa && (
                      <p className="text-xs text-text-secondary mt-1">
                        {n.bodyFa}
                      </p>
                    )}
                    <p className="text-[11px] text-text-secondary mt-2">
                      {fmt(n.createdAt)}
                    </p>
                  </div>
                  {!n.readAt && (
                    <button
                      onClick={() => markRead(n.id)}
                      className="shrink-0 text-xs text-accent hover:underline"
                    >
                      علامت‌گذاری خوانده‌شده
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
