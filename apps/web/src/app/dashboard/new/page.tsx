'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';

interface ExerciseType {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  durationSeconds: number;
  wordTargetMin: number;
  wordTargetMax: number;
  baseXp: number;
  iconAsset: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  BASIC: 'پایه‌ای',
  STRUCTURE: 'ساختار و پیرنگ',
  STYLE: 'سبک‌شناسی',
  ADVANCED: 'پیشرفته',
  IDEA: 'ایده‌پردازی',
  CONSTRAINT: 'محدودیت و قید',
  HABIT: 'عادت‌سازی',
  SCENE: 'صحنه‌پردازی',
};

interface CreateSessionResponse {
  session: { id: string };
  promptSnapshot: Record<string, unknown>;
}

export default function NewSessionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ['exercises'],
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<ExerciseType[]>('/exercises'),
  });

  const handleStart = async () => {
    if (!selectedId) return;
    setCreating(true);
    try {
      const res = await api.post<CreateSessionResponse>('/sessions', {
        exerciseTypeId: selectedId,
      });
      // Invalidate session list so the dashboard updates.
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      router.push(`/practice/${res.session.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'خطا در ساخت جلسه',
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <h1 className="text-xl font-bold">جلسه جدید</h1>
        <p className="text-sm text-text-secondary">
          یک تمرین انتخاب کن و شروع کن
        </p>

        {isLoading ? (
          <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {exercises.map((ex) => (
              <button
                key={ex.id}
                onClick={() => setSelectedId(ex.id)}
                className={`text-right rounded-card border p-4 transition-all ${
                  selectedId === ex.id
                    ? 'border-accent bg-accent/5 ring-1 ring-accent'
                    : 'border-border bg-bg-secondary hover:border-accent/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{ex.title}</span>
                  <span className="text-xs text-text-secondary bg-bg-primary rounded-full px-2 py-0.5">
                    {CATEGORY_LABELS[ex.category] ?? ex.category}
                  </span>
                </div>
                <p className="text-xs text-text-secondary line-clamp-2 mb-2">
                  {ex.description}
                </p>
                <div className="flex gap-3 text-xs text-text-secondary">
                  <span>{toPersianDigits(String(ex.wordTargetMin))}–{toPersianDigits(String(ex.wordTargetMax))} کلمه</span>
                  <span>{toPersianDigits(String(Math.round(ex.durationSeconds / 60)))} دقیقه</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {exercises.length === 0 && !isLoading && (
          <p className="text-sm text-text-secondary">هنوز تمرینی ثبت نشده</p>
        )}

        <div className="pt-2">
          <button
            onClick={handleStart}
            disabled={!selectedId || creating}
            className="bg-accent text-white rounded-md px-6 py-2.5 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {creating ? 'در حال شروع…' : 'شروع تمرین'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
