'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, Trash2, History } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';
import { useCalendar } from '@/lib/calendar/calendar-provider';

interface Writing {
  id: string;
  title: string;
  contentText: string;
  wordCount: number;
  tags: string[];
  status: string;
  folderId: string | null;
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  folder: { id: string; name: string } | null;
}

interface Version {
  id: string;
  versionNumber: number;
  saveTrigger: string;
  wordCount: number;
  createdAt: string;
}

interface Folder {
  id: string;
  name: string;
}

/**
 * `/writings/[id]` — view & edit a single writing (title, body, tags, folder)
 * plus its draft-version history (when it was imported from a session).
 */
export default function WritingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const { formatDate } = useCalendar();

  const { data: writing, isLoading, error } = useQuery({
    queryKey: ['writing', id],
    enabled: Boolean(token) && Boolean(id),
    staleTime: 30 * 1000,
    queryFn: () => api.get<Writing>(`/writings/${id}`),
  });

  const versionsQuery = useQuery({
    queryKey: ['writing-versions', id],
    enabled: Boolean(token) && Boolean(writing?.sourceSessionId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Version[]>(`/writings/${id}/versions`),
  });

  const foldersQuery = useQuery({
    queryKey: ['writings-folders'],
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Folder[]>('/writings/folders'),
  });

  const [title, setTitle] = useState<string | null>(null);
  const [contentText, setContentText] = useState<string | null>(null);
  const [tags, setTags] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const t = title ?? writing?.title ?? '';
  const c = contentText ?? writing?.contentText ?? '';
  const tg = tags ?? (writing?.tags ?? []).join(', ');

  const dirty = title !== null || contentText !== null || tags !== null;

  const save = async (folderId: string | null) => {
    setSaving(true);
    try {
      await api.patch(`/writings/${id}`, {
        title: t.trim(),
        contentText: c,
        tags: tg
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        folderId,
      });
      setTitle(null);
      setContentText(null);
      setTags(null);
      queryClient.invalidateQueries({ queryKey: ['writing', id] });
      queryClient.invalidateQueries({ queryKey: ['writings'] });
    } catch {
      alert('خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('این نوشته برای همیشه حذف شود؟')) return;
    try {
      await api.delete(`/writings/${id}`);
      queryClient.invalidateQueries({ queryKey: ['writings'] });
      router.push('/writings');
    } catch {
      alert('خطا در حذف');
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
      </AppShell>
    );
  }

  if (error || !writing) {
    return (
      <AppShell>
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">نوشته پیدا نشد</p>
          <Link2Back />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/writings')}
            className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
          >
            <ArrowRight size={14} />
            بازگشت به نوشته‌ها
          </button>
          <button
            onClick={remove}
            className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300"
          >
            <Trash2 size={14} />
            حذف
          </button>
        </div>

        <div className="rounded-card border border-border bg-bg-secondary p-4 space-y-3">
          <input
            value={t}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-base font-medium"
          />
          <textarea
            value={c}
            onChange={(e) => setContentText(e.target.value)}
            rows={12}
            dir="rtl"
            className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm leading-7"
          />
          <input
            value={tg}
            onChange={(e) => setTags(e.target.value)}
            placeholder="برچسب‌ها (با ویرای جدا کنید)"
            className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
          />
          <div className="flex items-center justify-between">
            <select
              value={writing.folderId ?? ''}
              onChange={(e) => save(e.target.value || null)}
              className="rounded-md border border-border bg-bg-primary px-2 py-1.5 text-sm"
            >
              <option value="">بدون پوشه</option>
              {(foldersQuery.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => save(writing.folderId)}
              disabled={saving || !dirty}
              className="rounded-md bg-accent text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'}
            </button>
          </div>
          <p className="text-xs text-text-secondary">
            {toPersianDigits(String(writing.wordCount))} کلمه — آخرین به‌روزرسانی:{' '}
            {formatDate(writing.updatedAt)}
          </p>
        </div>

        {versionsQuery.data && versionsQuery.data.length > 0 && (
          <div className="rounded-card border border-border bg-bg-secondary p-4">
            <h2 className="flex items-center gap-2 text-sm font-medium mb-3">
              <History size={14} />
              نسخه‌های پیشین (از جلسهٔ تمرین)
            </h2>
            <ul className="space-y-1 text-xs text-text-secondary">
              {versionsQuery.data.map((v) => (
                <li key={v.id} className="flex justify-between">
                  <span>
                    نسخهٔ {toPersianDigits(String(v.versionNumber))} —{' '}
                    {v.saveTrigger}
                  </span>
                  <span>
                    {toPersianDigits(String(v.wordCount))} کلمه ·{' '}
                    {formatDate(v.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Link2Back() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push('/writings')}
      className="text-sm text-accent hover:underline"
    >
      بازگشت به نوشته‌های من
    </button>
  );
}
