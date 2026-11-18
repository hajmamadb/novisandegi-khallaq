'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Search } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';
import { useCalendar } from '@/lib/calendar/calendar-provider';

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  _count: { submissions: number; sessions: number };
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
}

const ROLE_LABELS: Record<string, string> = {
  USER: 'کاربر',
  NOVICE: 'نوآموز',
  CRAFTSPERSON: 'کاربلد',
  JOURNEYMAN: 'کارآموز',
  ARTISAN: 'هنرمند',
  CREATIVE: 'خلاق',
  PROFESSIONAL: 'حرفه‌ای',
  MENTOR: 'مربی',
  EDITOR: 'ویراستار',
  ADMIN: 'مدیر',
};

const ROLE_COLORS: Record<string, string> = {
  USER: 'bg-gray-100 text-gray-700',
  NOVICE: 'bg-zinc-100 text-zinc-700',
  CRAFTSPERSON: 'bg-blue-100 text-blue-700',
  JOURNEYMAN: 'bg-sky-100 text-sky-700',
  ARTISAN: 'bg-purple-100 text-purple-700',
  CREATIVE: 'bg-emerald-100 text-emerald-700',
  PROFESSIONAL: 'bg-indigo-100 text-indigo-700',
  MENTOR: 'bg-amber-100 text-amber-700',
  ADMIN: 'bg-red-100 text-red-700',
  EDITOR: 'bg-rose-100 text-rose-700',
};

export default function AdminUsersPage() {
  const user = useAuthStore((s) => s.user);
  const { formatDate } = useCalendar();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search, roleFilter],
    queryFn: () =>
      api.get<UsersResponse>(
        `/admin/users?page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ''}${roleFilter ? `&role=${roleFilter}` : ''}`,
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
          <Users className="h-5 w-5" />
          <h1 className="text-lg font-bold">کاربران</h1>
          {data && (
            <span className="text-xs text-text-secondary">
              {toPersianDigits(data.total)} کاربر
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-text-secondary" />
            <input
              type="text"
              placeholder="جستجو (ایمیل یا نام)…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="rounded-card border border-border bg-bg-secondary py-2 pr-9 pl-3 text-sm w-64"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="rounded-card border border-border bg-bg-secondary py-2 px-3 text-sm"
          >
            <option value="">همه نقش‌ها</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-text-secondary">در حال بارگذاری…</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-bg-secondary">
                <tr>
                  <th className="px-4 py-2 text-right font-medium">نام</th>
                  <th className="px-4 py-2 text-right font-medium">ایمیل</th>
                  <th className="px-4 py-2 text-right font-medium">نقش</th>
                  <th className="px-4 py-2 text-right font-medium">فعال</th>
                  <th className="px-4 py-2 text-right font-medium">ارسال‌ها</th>
                  <th className="px-4 py-2 text-right font-medium">جلسات</th>
                  <th className="px-4 py-2 text-right font-medium">سازماندهی</th>
                </tr>
              </thead>
              <tbody>
                {data?.users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{u.displayName}</td>
                    <td className="px-4 py-2 text-text-secondary" dir="ltr">{u.email}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-700'}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {u.isActive ? '✅' : '❌'}
                    </td>
                    <td className="px-4 py-2">{toPersianDigits(u._count.submissions)}</td>
                    <td className="px-4 py-2">{toPersianDigits(u._count.sessions)}</td>
                    <td className="px-4 py-2 text-xs text-text-secondary">
                      {formatDate(u.createdAt)}
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
