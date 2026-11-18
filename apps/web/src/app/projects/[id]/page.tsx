'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, Trash2, Plus, Pencil, Save, X } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';

interface Chapter {
  id: string;
  title: string;
  contentText: string;
  wordCount: number;
  displayOrder: number;
  createdAt: string;
}

interface Project {
  id: string;
  title: string;
  type: string;
  description: string;
  targetWords: number;
  wordCountTotal: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  chapters: Chapter[];
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
 * `/projects/[id]` — a single project: edit title/description/status, and
 * manage its chapters (add / inline-edit / delete).
 */
export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    enabled: Boolean(token) && Boolean(id),
    staleTime: 30 * 1000,
    queryFn: () => api.get<Project>(`/projects/${id}`),
  });

  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const t = title ?? project?.title ?? '';
  const d = description ?? project?.description ?? '';
  const st = status ?? project?.status ?? 'DRAFT';
  const dirty = title !== null || description !== null || status !== null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['project', id] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  const saveProject = async () => {
    setSaving(true);
    try {
      await api.patch(`/projects/${id}`, {
        title: t.trim(),
        description: d,
        status: st as Project['status'],
      });
      setTitle(null);
      setDescription(null);
      setStatus(null);
      refresh();
    } catch {
      alert('خطا در ذخیره‌ی پروژه');
    } finally {
      setSaving(false);
    }
  };

  const removeProject = async () => {
    if (!confirm('این پروژه و همهٔ فصل‌هایش برای همیشه حذف شود؟')) return;
    try {
      await api.delete(`/projects/${id}`);
      router.push('/projects');
    } catch {
      alert('خطا در حذف پروژه');
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
      </AppShell>
    );
  }

  if (error || !project) {
    return (
      <AppShell>
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">پروژه پیدا نشد</p>
          <BackLink href="/projects" label="بازگشت به پروژه‌ها" />
        </div>
      </AppShell>
    );
  }

  const pct =
    project.targetWords > 0
      ? Math.min(100, Math.round((project.wordCountTotal / project.targetWords) * 100))
      : 0;

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <BackLink href="/projects" label="بازگشت به پروژه‌ها" />
          <button
            onClick={removeProject}
            className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300"
          >
            <Trash2 size={14} />
            حذف پروژه
          </button>
        </div>

        <div className="rounded-card border border-border bg-bg-secondary p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-secondary">
              {TYPE_LABELS[project.type] ?? project.type}
            </span>
            <span className="text-xs text-text-secondary">
              {toPersianDigits(String(project.wordCountTotal))} از{' '}
              {toPersianDigits(String(project.targetWords))} کلمه ({toPersianDigits(String(pct))}٪)
            </span>
          </div>
          <input
            value={t}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-base font-medium"
          />
          <textarea
            value={d}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="توضیح (اختیاری)"
            className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
          />
          <div className="flex items-center justify-between">
            <select
              value={st}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-md border border-border bg-bg-primary px-2 py-1.5 text-sm"
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              onClick={saveProject}
              disabled={saving || !dirty}
              className="flex items-center gap-1 rounded-md bg-accent text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? 'در حال ذخیره…' : 'ذخیره'}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium">
            فصل‌ها{' '}
            <span className="text-text-secondary text-xs">
              ({toPersianDigits(String(project.chapters.length))})
            </span>
          </h2>

          {project.chapters.length === 0 && (
            <p className="text-sm text-text-secondary">هنوز فصلی ثبت نشده</p>
          )}

          {project.chapters.map((ch) => (
            <ChapterCard
              key={ch.id}
              chapter={ch}
              projectId={project.id}
              onSaved={refresh}
            />
          ))}

          <AddChapterForm projectId={project.id} onSaved={refresh} />
        </div>
      </div>
    </AppShell>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
    >
      <ArrowRight size={14} />
      {label}
    </button>
  );
}

function ChapterCard({
  chapter,
  projectId,
  onSaved,
}: {
  chapter: Chapter;
  projectId: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.contentText);
  const [saving, setSaving] = useState(false);

  const dirty = title !== chapter.title || content !== chapter.contentText;

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/projects/${projectId}/chapters/${chapter.id}`, {
        title: title.trim() || chapter.title,
        contentText: content,
      });
      setEditing(false);
      onSaved();
    } catch {
      alert('خطا در ذخیره‌ی فصل');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('این فصل حذف شود؟')) return;
    try {
      await api.delete(`/projects/${projectId}/chapters/${chapter.id}`);
      onSaved();
    } catch {
      alert('خطا در حذف فصل');
    }
  };

  if (editing) {
    return (
      <div className="rounded-card border border-accent/40 bg-bg-secondary p-3 space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="عنوان فصل"
          className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm font-medium"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          dir="rtl"
          className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm leading-7"
        />
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1 rounded-md bg-accent text-white px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <Save size={12} />
            {saving ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setTitle(chapter.title);
              setContent(chapter.contentText);
            }}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary"
          >
            <X size={12} />
            انصراف
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-bg-secondary p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{chapter.title}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {toPersianDigits(String(chapter.wordCount))} کلمه
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
          >
            <Pencil size={12} />
            ویرایش
          </button>
          <button
            onClick={remove}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {chapter.contentText && (
        <p className="text-xs text-text-secondary mt-2 line-clamp-2" dir="rtl">
          {chapter.contentText}
        </p>
      )}
    </div>
  );
}

function AddChapterForm({
  projectId,
  onSaved,
}: {
  projectId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/chapters`, {
        title: title.trim(),
        contentText: content,
      });
      setTitle('');
      setContent('');
      setOpen(false);
      onSaved();
    } catch {
      alert('خطا در افزودن فصل');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-sm text-text-secondary hover:text-text-primary w-full"
      >
        <Plus size={14} />
        افزودن فصل
      </button>
    );
  }

  return (
    <div className="rounded-card border border-border bg-bg-secondary p-3 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="عنوان فصل"
        className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        dir="rtl"
        placeholder="متن فصل (اختیاری)"
        className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm leading-7"
      />
      <div className="flex gap-2">
        <button
          onClick={add}
          disabled={saving}
          className="rounded-md bg-accent text-white px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {saving ? 'در حال افزودن…' : 'افزودن'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary"
        >
          انصراف
        </button>
      </div>
    </div>
  );
}
