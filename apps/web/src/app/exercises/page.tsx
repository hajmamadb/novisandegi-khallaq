'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';
import { PublicShell } from '@/components/public/public-shell';
import { toast } from 'sonner';

interface ExerciseType {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  accessLevel: string;
  durationSeconds: number;
  wordTargetMin: number;
  wordTargetMax: number;
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

const CATEGORY_ORDER: string[] = [
  'BASIC',
  'STRUCTURE',
  'STYLE',
  'ADVANCED',
  'IDEA',
  'CONSTRAINT',
  'HABIT',
  'SCENE',
];

const LEVEL_LABELS: Record<string, string> = {
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

export default function PublicExercisesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['public-exercises'],
    queryFn: () => api.get<ExerciseType[]>('/exercises'),
  });
  const [startingId, setStartingId] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();
  const queryClient = useQueryClient();

  // Hydrate auth store from localStorage token on first mount.
  // The zustand store only reads the token at module init (SSR-safe), so
  // after a client-side navigation or a hard refresh the user may be null
  // even though a valid token exists.
  useEffect(() => {
    if (user) return; // already hydrated
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((me) => setUser(me))
      .catch(() => {});
  }, []);

  const exercises = data ?? [];

  // Group by category, preserving CATEGORY_ORDER.
  const grouped = new Map<string, ExerciseType[]>();
  for (const ex of exercises) {
    const list = grouped.get(ex.category) ?? [];
    list.push(ex);
    grouped.set(ex.category, list);
  }
  const categories = CATEGORY_ORDER.filter((c) => grouped.has(c));
  // Append any unexpected categories at the end.
  // DECISION: Array.from() avoids `for…of` over Map.keys() so the page
  // compiles under the project's ES5-ish TS target (no downlevelIteration).
  for (const c of Array.from(grouped.keys())) {
    if (!categories.includes(c)) categories.push(c);
  }

  const handleStart = async (exerciseTypeId: string) => {
    // Check for a token even if user state hasn't hydrated yet —
    // the API client reads the token directly from localStorage.
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    setStartingId(exerciseTypeId);
    try {
      const res = await api.post<{ session: { id: string } }>('/sessions', {
        exerciseTypeId,
      });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      router.push(`/practice/${res.session.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        // The api client already clears the token and redirects to /auth/login
        // on 401, so we only toast for non-auth failures.
        if (err.status !== 401) {
          toast.error('دریافت تمرین ناموفق بود. دوباره تلاش کنید.');
        }
      } else {
        toast.error('خطای غیرمنتظره‌ای رخ داد.');
      }
    } finally {
      setStartingId(null);
    }
  };

  return (
    <PublicShell>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-3">کتابخانه‌ی تمرین‌ها</h1>
        <p className="text-text-secondary max-w-xl mx-auto">
          {toPersianDigits(exercises.length)} تمرین طراحی‌شده برای رشد قلم شما.
          هر تمرین یک زاویه‌ی تازه از نوشتن است.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-text-secondary">در حال بارگذاری…</div>
      ) : (
        <div className="space-y-8">
          {categories.map((cat) => {
            const catExercises = grouped.get(cat) ?? [];
            return (
              <section key={cat}>
                <h2 className="text-lg font-bold mb-4">
                  {CATEGORY_LABELS[cat] ?? cat}
                  <span className="text-sm text-text-secondary mr-2 font-normal">
                    ({toPersianDigits(catExercises.length)} تمرین)
                  </span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {catExercises.map((ex) => (
                    <div
                      key={ex.id}
                      className="bg-bg-secondary border border-border rounded-xl p-4 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold">{ex.title}</h3>
                        <span className="text-xs text-text-secondary">
                          {LEVEL_LABELS[ex.accessLevel] ?? ex.accessLevel}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary mb-3">{ex.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-3 text-xs text-text-secondary">
                          <span>
                            {toPersianDigits(ex.wordTargetMin)}–{toPersianDigits(ex.wordTargetMax)} کلمه
                          </span>
                          <span>≈ {toPersianDigits(Math.ceil(ex.durationSeconds / 60))} دقیقه</span>
                        </div>
                        <button
                          onClick={() => handleStart(ex.id)}
                          disabled={startingId !== null}
                          className="shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg bg-accent text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                          {startingId === ex.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>در حال شروع…</span>
                            </>
                          ) : (
                            <span>این رو انجام میدم</span>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="text-center mt-10">
        <Link
          href={user || (typeof window !== 'undefined' && localStorage.getItem('token')) ? '/dashboard' : '/auth/register'}
          className="inline-block px-6 py-3 bg-accent text-white rounded-lg font-medium hover:opacity-90"
        >
          {user || (typeof window !== 'undefined' && localStorage.getItem('token')) ? 'رفتن به داشبورد' : 'شروع تمرین رایگان'}
        </Link>
      </div>
    </PublicShell>
  );
}
