'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits, CALENDAR_FORMATS, CALENDAR_LABELS, DEFAULT_CALENDAR, type CalendarFormat } from '@/lib/utils/persian';

// Spec H.4 — user default settings shape.
interface UserSettings {
  autoSaveInterval: number;
  editorFontSize: number;
  editorFontFamily: string;
  showWordCounter: boolean;
  backspaceEnabled: boolean;
  gamificationMode: string;
  notifications: { badges: boolean; streak: boolean; feedback: boolean };
  dayStartHour: number;
  restDayOfWeek: number | null;
  bankFilters: Record<string, unknown>;
  excludeFromRecommendations: boolean;
  calendar: CalendarFormat;
}

const DEFAULT_SETTINGS: UserSettings = {
  autoSaveInterval: 10,
  editorFontSize: 16,
  editorFontFamily: 'Vazirmatn',
  showWordCounter: true,
  backspaceEnabled: true,
  gamificationMode: 'BALANCED',
  notifications: { badges: true, streak: true, feedback: true },
  dayStartHour: 0,
  restDayOfWeek: null,
  bankFilters: {},
  excludeFromRecommendations: false,
  calendar: DEFAULT_CALENDAR,
};

const TABS = [
  { key: 'profile', label: 'پروفایل' },
  { key: 'writing', label: 'نوشتن' },
  { key: 'game', label: 'بازی' },
  { key: 'calendar', label: 'روز/تقویم' },
  { key: 'privacy', label: 'حریم خصوصی' },
  { key: 'data', label: 'داده' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const GAMIFICATION_MODES = [
  { value: 'RELAXED', label: 'آرام' },
  { value: 'BALANCED', label: 'متعادل' },
  { value: 'INTENSE', label: 'شدید' },
];

const FONT_OPTIONS = [
  { value: 'Vazirmatn', label: 'وزیرمتن (پیش‌فرض)' },
  { value: 'B Nazanin', label: 'بی‌نازنین' },
  { value: 'B Titr', label: 'بی‌تیتر' },
  { value: 'Tahoma', label: 'تاهما' },
];
const REST_DAYS = [
  { value: null, label: 'ندارد' },
  { value: 5, label: 'جمعه' },
  { value: 6, label: 'شنبه' },
  { value: 0, label: 'یکشنبه' },
  { value: 1, label: 'دوشنبه' },
  { value: 2, label: 'سه‌شنبه' },
  { value: 3, label: 'چهارشنبه' },
  { value: 4, label: 'پنجشنبه' },
];

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm text-text-secondary mb-1">{children}</label>;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-bg-tertiary'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'right-0.5 translate-x-0' : 'right-[22px] -translate-x-[22px]'
          }`}
        />
      </button>
    </label>
  );
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('profile');
  const [displayName, setDisplayName] = useState('');
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  // Hydrate user + settings from API.
  const meQuery = useQuery({
    queryKey: ['me-settings'],
    enabled: Boolean(user),
    queryFn: async () =>
      api.get<{
        displayName: string;
        email: string;
        settingsJson?: Record<string, unknown>;
      }>('/users/me'),
  });

  useEffect(() => {
    if (meQuery.data) {
      setDisplayName(meQuery.data.displayName ?? '');
      const s = meQuery.data.settingsJson as Partial<UserSettings> | undefined;
      setSettings({ ...DEFAULT_SETTINGS, ...s, notifications: { ...DEFAULT_SETTINGS.notifications, ...(s?.notifications ?? {}) } });
    }
  }, [meQuery.data]);

  async function save() {
    setSaving(true);
    try {
      await api.patch('/users/me', { displayName, settingsJson: settings });
      queryClient.invalidateQueries({ queryKey: ['me-settings'] });
      toast.success('ذخیره شد');
    } catch {
      toast.error('خطا در ذخیره‌سازی');
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">تنظیمات</h1>

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

        <div className="max-w-lg space-y-6">
          {tab === 'profile' && (
            <div className="space-y-4">
              <div>
                <Label>نام نمایشی</Label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm"
                />
              </div>
              <div>
                <Label>ایمیل</Label>
                <input
                  type="email"
                  value={user?.email ?? ''}
                  disabled
                  className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-secondary"
                />
              </div>
            </div>
          )}

          {tab === 'writing' && (
            <div className="space-y-4">
              <div>
                <Label>فاصله ذخیره‌سازی خودکار (ثانیه)</Label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={settings.autoSaveInterval}
                  onChange={(e) => update('autoSaveInterval', Number(e.target.value))}
                  className="w-24 rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm"
                />
              </div>
              <div>
                <Label>اندازه فونت ویرایشگر</Label>
                <input
                  type="number"
                  min={12}
                  max={28}
                  value={settings.editorFontSize}
                  onChange={(e) => update('editorFontSize', Number(e.target.value))}
                  className="w-24 rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm"
                />
              </div>
              <div>
                <Label>فونت ویرایشگر</Label>
                <select
                  value={settings.editorFontFamily}
                  onChange={(e) => update('editorFontFamily', e.target.value)}
                  className="w-full rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <Toggle
                checked={settings.showWordCounter}
                onChange={(v) => update('showWordCounter', v)}
                label="نمایش شمارنده کلمات"
              />
              <Toggle
                checked={settings.backspaceEnabled}
                onChange={(v) => update('backspaceEnabled', v)}
                label="فعال بودن بک‌اسپیس"
              />
            </div>
          )}

          {tab === 'game' && (
            <div className="space-y-4">
              <div>
                <Label>حالت گیمیفیکیشن</Label>
                <select
                  value={settings.gamificationMode}
                  onChange={(e) => update('gamificationMode', e.target.value)}
                  className="w-full rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm"
                >
                  {GAMIFICATION_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>اعلان‌ها</Label>
                <Toggle
                  checked={settings.notifications.badges}
                  onChange={(v) => update('notifications', { ...settings.notifications, badges: v })}
                  label="نشان‌ها"
                />
                <Toggle
                  checked={settings.notifications.streak}
                  onChange={(v) => update('notifications', { ...settings.notifications, streak: v })}
                  label="استریک (زنجیره)"
                />
                <Toggle
                  checked={settings.notifications.feedback}
                  onChange={(v) => update('notifications', { ...settings.notifications, feedback: v })}
                  label="بازخورد"
                />
              </div>
            </div>
          )}

          {tab === 'calendar' && (
            <div className="space-y-4">
              <div>
                <Label>نوع تقویم</Label>
                <select
                  value={settings.calendar}
                  onChange={(e) => update('calendar', e.target.value as CalendarFormat)}
                  className="w-full rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm"
                >
                  {CALENDAR_FORMATS.map((c) => (
                    <option key={c} value={c}>{CALENDAR_LABELS[c]}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-text-secondary">
                  پیش‌فرض: شمسی (جلالی). این انتخاب نوع نمایش تاریخ در کل سامانه را عوض می‌کند.
                </p>
              </div>
              <div>
                <Label>ساعت شروع روز</Label>
                <select
                  value={settings.dayStartHour}
                  onChange={(e) => update('dayStartHour', Number(e.target.value))}
                  className="w-32 rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{toPersianDigits(String(i).padStart(2, '0'))}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>روز استراحت هفتگی</Label>
                <select
                  value={settings.restDayOfWeek ?? ''}
                  onChange={(e) =>
                    update('restDayOfWeek', e.target.value === '' ? null : Number(e.target.value))
                  }
                  className="w-full rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm"
                >
                  {REST_DAYS.map((d) => (
                    <option key={String(d.value)} value={d.value === null ? '' : d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {tab === 'privacy' && (
            <div className="space-y-4">
              <Toggle
                checked={settings.excludeFromRecommendations}
                onChange={(v) => update('excludeFromRecommendations', v)}
                label="استثنا از توصیه‌ها"
              />
              <p className="text-xs text-text-secondary">
                اگر فعال باشد، تمرین‌های شما در توصیه‌های هوشمند بقیه کاربران نمایش داده نمی‌شود.
              </p>
            </div>
          )}

          {tab === 'data' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold mb-2">خروجی داده</h3>
                <p className="text-xs text-text-secondary mb-3">
                  تمام داده‌های خود (جلسات، پیشرفت، تنظیمات) را به‌صورت JSON دریافت کنید.
                </p>
                <button
                  onClick={async () => {
                    try {
                      const data = await api.get<Blob>('/users/me/export');
                      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'kargah-export.json';
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      toast.error('خطا در خروجی داده');
                    }
                  }}
                  className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
                >
                  دانلود خروجی
                </button>
              </div>
            </div>
          )}

          {/* Save button — visible on all tabs */}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-accent px-6 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
