'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';

interface Project {
  id: string;
  title: string;
  type: string;
  description: string | null;
  targetWords: number;
  wordCountTotal: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: { chapters: number };
}

const TYPE_LABELS: Record<string, string> = {
  STORY: 'داستان کوتاه',
  NOVEL: 'رمان',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  IN_PROGRESS: 'در حال کار',
  COMPLETE: 'تکمیل‌شده',
};

/**
 * `/projects` — list the user's projects (story/novel) with a create form.
 * Chapter management lives in `/projects/[id]`.
 */
export default function ProjectsPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('STORY');
  const [description, setDescription] = useState('');
  const [targetWords, setTargetWords] = useState('5000');
  const [saving, setSaving] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    enabled: Boolean(token),
    staleTime: 60 * 1000,
    queryFn: () => api.get<Project[]>('/projects'),
  });

  const create = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post('/projects', {
        title: title.trim(),
        type,
        description: description.trim() || undefined,
        targetWords: Number(targetWords) || 5000,
      });
      setTitle('');
      setDescription('');
      setTargetWords('5000');
      setShowNew(false);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    } catch {
      alert('خطا در ساخت پروژه');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">پروژه‌ها</h1>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="flex items-center gap-1 rounded-md bg-accent text-white px-3 py-1.5 text-sm"
          >
            <Plus size={14} />
            پروژهٔ جدید
          </button>
        </div>

        {showNew && (
          <div className="rounded-card border border-border bg-bg-secondary p-4 space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان پروژه"
              className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
              >
                <option value="STORY">داستان کوتاه</option>
                <option value="NOVEL">رمان</option>
              </select>
              <input
                value={targetWords}
                onChange={(e) => setTargetWords(e.target.value)}
                type="number"
                min={100}
                placeholder="هدف کلمه"
                className="rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
              />
            </div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="توضیح (اختیاری)"
              className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={create}
                disabled={saving}
                className="rounded-md bg-accent text-white px-4 py-2 text-sm disabled:opacity-50"
              >
                {saving ? 'در حال ساخت…' : 'ساخت'}
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

        {isLoading ? (
          <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-text-secondary">هنوز پروژه‌ای ثبت نشده</p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => {
              const pct =
                p.targetWords > 0
                  ? Math.min(100, Math.round((p.wordCountTotal / p.targetWords) * 100))
                  : 0;
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="block rounded-card border border-border bg-bg-secondary p-4 hover:border-accent/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium truncate">{p.title}</span>
                      <span className="text-xs text-text-secondary shrink-0">
                        {TYPE_LABELS[p.type] ?? p.type}
                      </span>
                    </div>
                    {p.description && (
                      <p className="text-xs text-text-secondary mt-1 line-clamp-1">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full bg-bg-primary overflow-hidden">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-text-secondary mt-1">
                        <span>
                          {toPersianDigits(String(p.wordCountTotal))} از{' '}
                          {toPersianDigits(String(p.targetWords))} کلمه
                        </span>
                        <span>
                          {toPersianDigits(String(p._count.chapters))} فصل ·{' '}
                          {STATUS_LABELS[p.status] ?? p.status}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
