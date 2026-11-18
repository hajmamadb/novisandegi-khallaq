'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Search } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';
import { useCalendar } from '@/lib/calendar/calendar-provider';

interface AuditLogRow {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  entries: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

export default function AdminLogsPage() {
  const user = useAuthStore((s) => s.user);
  const { formatDate } = useCalendar();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const limit = 100;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit-log', page, action],
    queryFn: () =>
      api.get<AuditLogResponse>(
        `/admin/audit-log?page=${page}&limit=${limit}${action ? `&action=${action}` : ''}`,
      ),
    enabled: user?.role === 'ADMIN',
  });

  if (user?.role !== 'ADMIN') {
    return (
      <AppShell>
        <p className="text-center text-text-secondary">دسترسی مجاز نیست</p>
      </AppShell>
    );
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5" />
          <h1 className="text-lg font-bold">گزارش وقایع و ممیزی</h1>
          {data && (
            <span className="text-xs text-text-secondary">
              {toPersianDigits(data.total)} رکورد
            </span>
          )}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-text-secondary" />
            <input
              type="text"
              placeholder="فلتر بر اساس اکشن…"
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(1); }}
              className="rounded-card border border-border bg-bg-secondary py-2 pr-9 pl-3 text-sm w-56"
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-text-secondary">در حال بارگذاری…</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-bg-secondary">
                <tr>
                  <th className="px-4 py-2 text-right font-medium">تاریخ</th>
                  <th className="px-4 py-2 text-right font-medium">عملیات</th>
                  <th className="px-4 py-2 text-right font-medium">نوع هدف</th>
                  <th className="px-4 py-2 text-right font-medium">شناسه هدف</th>
                  <th className="px-4 py-2 text-right font-medium">دلیل</th>
                  <th className="px-4 py-2 text-right font-medium">مجری</th>
                </tr>
              </thead>
              <tbody>
                {data?.entries.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-xs text-text-secondary whitespace-nowrap">
                      {formatDate(e.createdAt, true)}
                    </td>
                    <td className="px-4 py-2 font-medium text-xs" dir="ltr">{e.action}</td>
                    <td className="px-4 py-2 text-xs text-text-secondary">{e.targetType ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-text-secondary font-mono max-w-[120px] truncate">
                      {e.targetId ? e.targetId.slice(0, 8) + '…' : '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-text-secondary max-w-[200px] truncate">
                      {e.reason ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-text-secondary font-mono max-w-[100px] truncate">
                      {e.actorId ? e.actorId.slice(0, 8) + '…' : 'سیستم'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-card border border-border px-3 py-1.5 text-sm disabled:opacity-40"
            >
              قبلی
            </button>
            <span className="text-sm text-text-secondary">
              صفحه {toPersianDigits(page)} از {toPersianDigits(totalPages)}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-card border border-border px-3 py-1.5 text-sm disabled:opacity-40"
            >
              بعدی
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
