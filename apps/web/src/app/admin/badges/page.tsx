'use client';

import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';

interface BadgeRow {
  id: string;
  slug: string;
  family: string;
  tier: number;
  titleFa: string;
  descriptionFa: string;
  iconAsset?: string;
  isHidden: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  _count: { awards: number };
}

interface BadgesResponse {
  badges: BadgeRow[];
}

const FAMILY_LABELS: Record<string, string> = {
  A: 'دسته یکم — فعالیت',
  B: 'دسته دوم — کیفیت',
  C: 'دسته سوم — جامعه',
  D: 'دسته چهارم — تخصص',
  E: 'دسته پنجم — ویژه',
};

export default function AdminBadgesPage() {
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-badges'],
    queryFn: () => api.get<BadgesResponse>('/admin/badges'),
    enabled: user?.role === 'ADMIN',
  });

  if (user?.role !== 'ADMIN') {
    return (
      <AppShell>
        <p className="text-center text-text-secondary">دسترسی مجاز نیست</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Award className="h-5 w-5" />
          <h1 className="text-lg font-bold">نشان‌ها</h1>
          {data && (
            <span className="text-xs text-text-secondary">
              {toPersianDigits(data.badges.length)} نشان
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="text-text-secondary">در حال بارگذاری…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.badges.map((b) => (
              <div
                key={b.id}
                className={`rounded-card border p-4 ${
                  b.isActive
                    ? 'border-border bg-bg-secondary'
                    : 'border-border/50 bg-bg-secondary/50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {b.iconAsset ? (
                      <img src={b.iconAsset} alt="" className="h-8 w-8 rounded" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-amber-100 text-amber-700">
                        <Award className="h-4 w-4" />
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-bold">{b.titleFa}</h3>
                      <p className="text-xs text-text-secondary">
                        {FAMILY_LABELS[b.family] ?? b.family} — سطح {toPersianDigits(b.tier)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 text-xs">
                    {b.isHidden && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5">پنهان</span>
                    )}
                    {!b.isActive && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5">غیرفعال</span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-text-secondary line-clamp-2">{b.descriptionFa}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-text-secondary">
                  <span>دریافت: {toPersianDigits(b._count.awards)}</span>
                  <span>ترتیب: {toPersianDigits(b.displayOrder)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
