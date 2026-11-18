'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Check, X } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useCalendar } from '@/lib/calendar/calendar-provider';
import { toPersianDigits, translateRole } from '@/lib/utils/persian';

const INTEGRITY_LABELS: Record<string, string> = {
  PASSED: 'سالم و معتبر',
  WARNED: 'دارای هشدار',
  FAILED: 'ردشده و نامعتبر',
};

interface BankRow {
  key: string;
  labelFa: string;
  approved: number;
  pending: number;
  total: number;
}

// Mirrors apps/api AdminOverview (D.14).
interface AdminOverview {
  users: { total: number; active: number; byRole: Record<string, number> };
  activity: {
    sessionsTotal: number;
    sessionsToday: number;
    submittedTotal: number;
    abandonedTotal: number;
  };
  volume: { totalWords: number; totalMinutes: number; totalXpAwarded: number };
  integrity: Record<string, number>;
  anomalies: { total: number; open: number };
  badges: { total: number; awarded: number };
  banks: BankRow[];
  generatedAt: string;
}

const TABS = [
  { key: 'overview', label: 'نمای کلی' },
  { key: 'banks', label: 'بانک‌ها' },
  { key: 'gamification', label: 'گیمیفیکیشن' },
  { key: 'integrity', label: 'سالمی' },
  { key: 'users', label: 'کاربران' },
  { key: 'approvals', label: 'تأییدها' },
  { key: 'settings', label: 'تنظیمات سیستم' },
] as const;

// Mirrors apps/api AdminApprovalsService.PendingItem (D.14).
interface ApprovalItem {
  source: string;
  id: string;
  title: string;
  summary: string;
  status: string;
  meta?: Record<string, unknown>;
  createdAt?: string;
}

// Mirrors apps/api AdminSettingsService.list() (D.14).
interface SettingsResult {
  settings: Record<string, unknown>;
  rows: { key: string; valueJson: unknown; updatedAt: string }[];
}

const SOURCE_LABELS: Record<string, string> = {
  news: 'خبر',
  character: 'شخصیت',
  place: 'مکان',
  openingLine: 'خطای آغاز',
  imageAsset: 'تصویر',
  objectItem: 'اشیا',
  emotionLexicon: 'واژگان احساسی',
};

type TabKey = (typeof TABS)[number]['key'];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-bg-secondary p-4">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const { formatDate } = useCalendar();
  const isAdmin = user?.role === 'ADMIN';
  const [tab, setTab] = useState<TabKey>('overview');
  const queryClient = useQueryClient();

  const overviewQuery = useQuery({
    queryKey: ['admin-overview'],
    enabled: isAdmin,
    queryFn: async () => api.get<AdminOverview>('/admin/analytics/overview'),
  });

  const approvalsQuery = useQuery({
    queryKey: ['admin-approvals'],
    enabled: isAdmin && tab === 'approvals',
    staleTime: 30 * 1000,
    queryFn: async () => api.get<{ items: ApprovalItem[] }>('/admin/approvals'),
  });

  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    enabled: isAdmin && tab === 'settings',
    staleTime: 30 * 1000,
    queryFn: async () => api.get<SettingsResult>('/admin/settings'),
  });

  // DECISION: local optimistic-free refresh — after a decision we refetch the
  // list so the decided item drops out (it is no longer PENDING).
  const refreshApprovals = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-approvals'] });
  const refreshSettings = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-settings'] });

  const [decidingId, setDecidingId] = useState<string | null>(null);
  const decide = async (item: ApprovalItem, action: 'approve' | 'reject') => {
    setDecidingId(item.id);
    try {
      await api.post(`/admin/approvals/${item.source}/${item.id}/${action}`, {});
      refreshApprovals();
    } catch {
      alert('خطا در تصمیم‌گیری');
    } finally {
      setDecidingId(null);
    }
  };

  // Settings: each value is a JSON blob. We edit the raw string, parse on save.
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const saveSetting = async (key: string, raw: string) => {
    let parsed: unknown;
    try {
      parsed = raw.trim() === '' ? null : JSON.parse(raw);
    } catch {
      alert('مقدار باید JSON معتبر باشد.');
      return;
    }
    setSavingKey(key);
    try {
      await api.patch(`/admin/settings/${key}`, { value: parsed });
      refreshSettings();
    } catch {
      alert('خطا در ذخیره تنظیم');
    } finally {
      setSavingKey(null);
    }
  };

  // DECISION: client-side gate — the real guard is server-side (RolesGuard);
  // this only avoids rendering the page for non-admins who navigate directly.
  if (user?.role !== 'ADMIN') {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <Shield size={40} className="text-text-secondary" />
          <h1 className="text-lg font-bold">دسترسی محدود</h1>
          <p className="text-sm text-text-secondary">
            این صفحه فقط برای مدیران در دسترس است.
          </p>
        </div>
      </AppShell>
    );
  }

  const data = overviewQuery.data;

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">مدیریت</h1>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                tab === t.key
                  ? 'bg-accent text-white'
                  : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {overviewQuery.isLoading && <p className="text-text-secondary">در حال بارگذاری…</p>}
        {overviewQuery.isError && (
          <p className="text-sm text-red-500">خطا در بارگذاری داده‌ها.</p>
        )}

        {data && (
          <div className="space-y-8">
            {tab === 'overview' && (
              <>
                <Section title="کاربران">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard label="مجموع کاربران" value={toPersianDigits(String(data.users.total))} />
                    <StatCard label="فعال" value={toPersianDigits(String(data.users.active))} />
                  </div>
                </Section>
                <Section title="فعالیت">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard label="جلسات کل" value={toPersianDigits(String(data.activity.sessionsTotal))} />
                    <StatCard label="جلسات امروز" value={toPersianDigits(String(data.activity.sessionsToday))} />
                    <StatCard label="ارسال‌شده" value={toPersianDigits(String(data.activity.submittedTotal))} />
                    <StatCard label="رهاشده" value={toPersianDigits(String(data.activity.abandonedTotal))} />
                  </div>
                </Section>
                <Section title="حجم تولید">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <StatCard label="کل کلمات" value={toPersianDigits(String(data.volume.totalWords))} />
                    <StatCard label="کل دقیقه" value={toPersianDigits(String(data.volume.totalMinutes))} />
                    <StatCard label="امتیاز اعطاشده" value={toPersianDigits(String(data.volume.totalXpAwarded))} />
                  </div>
                </Section>
                <Section title="حفاظت و نشان‌ها">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard label="علائم غیرعادی (کل)" value={toPersianDigits(String(data.anomalies.total))} />
                    <StatCard label="علائم باز" value={toPersianDigits(String(data.anomalies.open))} />
                    <StatCard label="نشان‌ها" value={toPersianDigits(String(data.badges.total))} />
                    <StatCard label="اعطاشده" value={toPersianDigits(String(data.badges.awarded))} />
                  </div>
                </Section>
              </>
            )}

            {tab === 'banks' && (
              <Section title="بانک‌های محتوا">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-text-secondary">
                    برای مدیریت (افزودن / ویرایش / حذف) آیتم‌ها به صفحه‌ی بعد بروید.
                  </p>
                  <a
                    href="/admin/banks"
                    className="rounded-md bg-accent text-white px-4 py-2 text-sm hover:opacity-90"
                  >
                    مدیریت آیتم‌ها
                  </a>
                </div>
                <div className="overflow-x-auto rounded-card border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-bg-secondary text-right text-xs text-text-secondary">
                        <th className="px-3 py-2">بانک</th>
                        <th className="px-3 py-2">مجموع</th>
                        <th className="px-3 py-2">تأییدشده</th>
                        <th className="px-3 py-2">در انتظار</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.banks.map((b) => (
                        <tr key={b.key} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">{b.labelFa}</td>
                          <td className="px-3 py-2">{toPersianDigits(String(b.total))}</td>
                          <td className="px-3 py-2">{toPersianDigits(String(b.approved))}</td>
                          <td className="px-3 py-2">{toPersianDigits(String(b.pending))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {tab === 'gamification' && (
              <Section title="گیمیفیکیشن">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="تعداد نشان‌ها" value={toPersianDigits(String(data.badges.total))} />
                  <StatCard label="نشان‌های اعطاشده" value={toPersianDigits(String(data.badges.awarded))} />
                </div>
              </Section>
            )}

            {tab === 'integrity' && (
              <Section title="نتیجه آزمون اصالت (سالمی)">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {Object.entries(data.integrity).map(([k, v]) => (
                    <StatCard key={k} label={INTEGRITY_LABELS[k] ?? k} value={toPersianDigits(String(v))} />
                  ))}
                </div>
              </Section>
            )}

            {tab === 'users' && (
              <Section title="کاربران بر اساس نقش">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {Object.entries(data.users.byRole).map(([role, count]) => (
                    <StatCard key={role} label={translateRole(role)} value={toPersianDigits(String(count))} />
                  ))}
                </div>
              </Section>
            )}

            {tab === 'approvals' && (
              <Section title="در انتظار تأیید">
                {approvalsQuery.isLoading ? (
                  <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
                ) : approvalsQuery.isError ? (
                  <p className="text-sm text-red-500">خطا در بارگذاری تأییدها.</p>
                ) : (approvalsQuery.data?.items ?? []).length === 0 ? (
                  <p className="text-sm text-text-secondary">آیتمی در انتظار نیست.</p>
                ) : (
                  <div className="space-y-2">
                    {(approvalsQuery.data?.items ?? []).map((item) => (
                      <div
                        key={`${item.source}:${item.id}`}
                        className="rounded-md border border-border bg-bg-primary p-3 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-bg-tertiary text-text-secondary">
                              {SOURCE_LABELS[item.source] ?? item.source}
                            </span>
                            <span className="text-sm font-medium truncate">{item.title}</span>
                          </div>
                          {item.summary && (
                            <p className="text-xs text-text-secondary mt-1 line-clamp-2" dir="rtl">
                              {item.summary}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => decide(item, 'approve')}
                            disabled={decidingId === item.id}
                            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                          >
                            <Check size={12} />
                            تأیید
                          </button>
                          <button
                            onClick={() => decide(item, 'reject')}
                            disabled={decidingId === item.id}
                            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                          >
                            <X size={12} />
                            رد
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {tab === 'settings' && (
              <Section title="تنظیمات سیستم">
                <p className="text-xs text-text-secondary">
                  هر مقدار به‌صورت JSON ذخیره می‌شود. مقدار را ویرایش و ذخیره کن.
                </p>
                {settingsQuery.isLoading ? (
                  <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
                ) : settingsQuery.isError ? (
                  <p className="text-sm text-red-500">خطا در بارگذاری تنظیمات.</p>
                ) : (settingsQuery.data?.rows ?? []).length === 0 ? (
                  <p className="text-sm text-text-secondary">تنظیمی ثبت نشده است.</p>
                ) : (
                  <div className="space-y-2">
                    {(settingsQuery.data?.rows ?? []).map((row) => {
                      const initial =
                        typeof row.valueJson === 'string'
                          ? row.valueJson
                          : JSON.stringify(row.valueJson, null, 2);
                      const draft =
                        settingDrafts[row.key] !== undefined
                          ? settingDrafts[row.key]
                          : initial;
                      return (
                        <div
                          key={row.key}
                          className="rounded-md border border-border bg-bg-primary p-3 space-y-2"
                        >
                          <label className="text-sm font-medium block" dir="ltr">
                            {row.key}
                          </label>
                          <textarea
                            value={draft}
                            onChange={(e) =>
                              setSettingDrafts((prev) => ({
                                ...prev,
                                [row.key]: e.target.value,
                              }))
                            }
                            rows={2}
                            className="w-full rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm font-mono"
                            dir="ltr"
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-text-secondary">
                              {formatDate(row.updatedAt)}
                            </span>
                            <button
                              onClick={() => saveSetting(row.key, draft)}
                              disabled={savingKey === row.key || draft === initial}
                              className="text-xs px-3 py-1.5 rounded-md bg-accent text-white disabled:opacity-50"
                            >
                              {savingKey === row.key ? 'در حال ذخیره…' : 'ذخیره'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
