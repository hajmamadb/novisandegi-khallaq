'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, FolderPlus, Tag, FolderOpen } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';

interface Writing {
  id: string;
  title: string;
  wordCount: number;
  tags: string[];
  status: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  folder: { name: string } | null;
}

interface Folder {
  id: string;
  name: string;
}

/**
 * `/writings` — list of the user's writings with folder + tag filters and a
 * create form (title / body / tags / folder). Detail & editing live in
 * `/writings/[id]`.
 */
export default function WritingsPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [folderFilter, setFolderFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [contentText, setContentText] = useState('');
  const [tags, setTags] = useState('');
  const [folderId, setFolderId] = useState('');
  const [saving, setSaving] = useState(false);

  const listQuery = useQuery({
    queryKey: ['writings', folderFilter, tagFilter],
    enabled: Boolean(token),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (folderFilter) params.set('folderId', folderFilter);
      if (tagFilter) params.set('tag', tagFilter);
      const qs = params.toString();
      return api.get<Writing[]>(`/writings${qs ? `?${qs}` : ''}`);
    },
  });

  const foldersQuery = useQuery({
    queryKey: ['writings-folders'],
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Folder[]>('/writings/folders'),
  });

  const items = listQuery.data ?? [];
  const folders = foldersQuery.data ?? [];

  // All distinct tags across the user's writings (client-side: Prisma 5.14
  // has no String[] "has" filter, so the API filters in-app too).
  const allTags = Array.from(new Set(items.flatMap((w) => w.tags))).sort();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['writings'] });
    queryClient.invalidateQueries({ queryKey: ['writings-folders'] });
  };

  const create = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post('/writings', {
        title: title.trim(),
        contentText,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        folderId: folderId || undefined,
      });
      setTitle('');
      setContentText('');
      setTags('');
      setFolderId('');
      setShowNew(false);
      refresh();
    } catch {
      // toast handled by caller-less flow: surface minimal error
      alert('خطا در ذخیره‌ی نوشته');
    } finally {
      setSaving(false);
    }
  };

  const createFolder = async () => {
    const name = prompt('نام پوشه جدید:');
    if (!name?.trim()) return;
    try {
      await api.post('/writings/folders', { name: name.trim() });
      refresh();
    } catch {
      alert('خطا در ساخت پوشه');
    }
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">نوشته‌های من</h1>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="flex items-center gap-1 rounded-md bg-accent text-white px-3 py-1.5 text-sm"
          >
            <Plus size={14} />
            نوشتهٔ جدید
          </button>
        </div>

        {showNew && (
          <div className="rounded-card border border-border bg-bg-secondary p-4 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان"
              className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
            />
            <textarea
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              placeholder="متن نوشته (اختیاری در این لحظه؛ بعداً ویرایش می‌شود)"
              rows={4}
              className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
              dir="rtl"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="برچسب‌ها (با ویرگول جدا کنید)"
                className="rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
              />
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
              >
                <option value="">بدون پوشه</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={create}
                disabled={saving}
                className="rounded-md bg-accent text-white px-4 py-2 text-sm disabled:opacity-50"
              >
                {saving ? 'در حال ذخیره…' : 'ذخیره'}
              </button>
              <button
                onClick={() => setShowNew(false)}
                className="rounded-md border border-border px-4 py-2 text-sm text-text-secondary"
              >
                انصراف
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            className="rounded-md border border-border bg-bg-primary px-2 py-1 text-sm"
          >
            <option value="">همهٔ پوشه‌ها</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-md border border-border bg-bg-primary px-2 py-1 text-sm"
          >
            <option value="">همهٔ برچسب‌ها</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={createFolder}
            className="flex items-center gap-1 text-text-secondary hover:text-text-primary"
          >
            <FolderPlus size={14} />
            پوشهٔ جدید
          </button>
        </div>

        {listQuery.isLoading ? (
          <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-text-secondary">هنوز نوشته‌ای ثبت نشده</p>
        ) : (
          <ul className="space-y-2">
            {items.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/writings/${w.id}`}
                  className="block rounded-card border border-border bg-bg-secondary p-4 hover:border-accent/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium truncate">
                      {w.title}
                    </span>
                    <span className="text-xs text-text-secondary shrink-0">
                      {toPersianDigits(String(w.wordCount))} کلمه
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-text-secondary">
                    {w.folder && (
                      <span className="flex items-center gap-1">
                        <FolderOpen size={12} />
                        {w.folder.name}
                      </span>
                    )}
                    {w.tags.map((t) => (
                      <span
                        key={t}
                        className="flex items-center gap-1 rounded-full bg-bg-primary px-2 py-0.5"
                      >
                        <Tag size={10} />
                        {t}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
