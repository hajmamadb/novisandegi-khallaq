'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2, Clock, Type, Award, ArrowRight, BookOpen } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import {
  toPersianDigits,
  translateSkill,
  translateRubricKey,
  translateCategory,
  translateRole,
} from '@/lib/utils/persian';
import { PublicShell } from '@/components/public/public-shell';
import { toast } from 'sonner';

interface ExerciseDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  accessLevel: string;
  durationSeconds: number;
  wordTargetMin: number;
  wordTargetMax: number;
  baseXp: number;
  difficultyBase: number;
  iconAsset?: string;
  rubricJson: Record<string, unknown>;
  skillWeightsJson: Record<string, number>;
  bankSourceType?: string;
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

const BANK_TYPE_LABELS: Record<string, string> = {
  CHARACTER: 'شخصیت',
  PLACE: 'مکان',
  OPENING_LINE: 'خط آغاز',
  STYLE_PARAGRAPH: 'پاراگراف سبکی',
  REFERENCE_STORY: 'داستان مرجع',
  IMAGE_ASSET: 'تصویر',
  OBJECT_ITEM: 'اشیاء',
  EMOTION_LEXICON: 'واژگان احساسی',
  WHAT_IF_QUESTION: 'ایده‌های چه می‌شود اگر',
  STRUCTURE_PHRASE: 'عبارت ساختاری',
  NEWS: 'سوژه‌های خبری روز',
};
  WORD: 'واژه',
  CUTUP_TEXT: 'متن کات-آپ',
  AMBIENT_AUDIO: 'صوت محیطی',
  STRUCTURE_TEMPLATE: 'قالب ساختار',
};

export default function ExerciseDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [starting, setStarting] = useState(false);

  const { data: exercise, isLoading, error } = useQuery({
    queryKey: ['exercise-detail', slug],
    queryFn: () => api.get<ExerciseDetail>(`/exercises/${slug}`),
    retry: false,
  });

  // Hydrate auth store from localStorage token on first mount.
  useEffect(() => {
    if (user) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((me) => setUser(me))
      .catch(() => {});
  }, []);

  const handleStart = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    if (!exercise) return;
    setStarting(true);
    try {
      const res = await api.post<{ session: { id: string } }>('/sessions', {
        exerciseTypeId: exercise.id,
      });
      router.push(`/practice/${res.session.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status !== 401) {
          toast.error('شروع تمرین ناموفق بود. دوباره تلاش کنید.');
        }
      } else {
        toast.error('خطای غیرمنتظره‌ای رخ داد.');
      }
    } finally {
      setStarting(false);
    }
  };

  if (isLoading) {
    return (
      <PublicShell>
        <div className="flex items-center justify-center py-24 text-text-secondary">
          <Loader2 className="w-6 h-6 animate-spin ml-2" />
          <span>در حال بارگذاری…</span>
        </div>
      </PublicShell>
    );
  }

  if (error || !exercise) {
    return (
      <PublicShell>
        <div className="text-center py-24">
          <h1 className="text-2xl font-bold mb-3">تمرین یافت نشد</h1>
          <p className="text-text-secondary mb-6">
            این تمرین وجود ندارد یا غیرفعال شده است.
          </p>
          <Link
            href="/exercises"
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90"
          >
            <ArrowRight className="w-4 h-4" />
            بازگشت به کتابخانه
          </Link>
        </div>
      </PublicShell>
    );
  }

  const skills = Object.entries(exercise.skillWeightsJson ?? {});

  return (
    <PublicShell>
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Back link */}
        <Link
          href="/exercises"
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-foreground transition-colors"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          بازگشت به کتابخانه‌ی تمرین‌ها
        </Link>

        {/* Header */}
        <div className="space-y-4">
          {exercise.iconAsset && (
            <img
              src={exercise.iconAsset}
              alt=""
              className="w-16 h-16 rounded-xl object-cover"
            />
          )}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="rounded-full bg-accent/10 text-accent px-3 py-1 text-xs font-medium">
                {CATEGORY_LABELS[exercise.category] ?? exercise.category}
              </span>
              <span className="text-xs text-text-secondary">
                {LEVEL_LABELS[exercise.accessLevel] ?? exercise.accessLevel}
              </span>
            </div>
            <h1 className="text-3xl font-bold">{exercise.title}</h1>
          </div>
        </div>

        {/* Description */}
        <div className="rounded-xl border border-border bg-bg-secondary p-6 space-y-3">
          <h2 className="text-sm font-bold text-text-secondary">راهنما</h2>
          <p className="text-base leading-relaxed whitespace-pre-line">{exercise.description}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-bg-secondary p-4 text-center">
            <Clock className="w-5 h-5 mx-auto mb-2 text-accent" />
            <p className="text-xs text-text-secondary">مدت زمان</p>
            <p className="mt-1 font-bold">
              ≈ {toPersianDigits(Math.ceil(exercise.durationSeconds / 60))} دقیقه
            </p>
          </div>
          <div className="rounded-xl border border-border bg-bg-secondary p-4 text-center">
            <Type className="w-5 h-5 mx-auto mb-2 text-accent" />
            <p className="text-xs text-text-secondary">هدف واژه</p>
            <p className="mt-1 font-bold">
              {toPersianDigits(exercise.wordTargetMin)}–{toPersianDigits(exercise.wordTargetMax)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-bg-secondary p-4 text-center">
            <Award className="w-5 h-5 mx-auto mb-2 text-accent" />
            <p className="text-xs text-text-secondary">امتیاز پایه</p>
            <p className="mt-1 font-bold">{toPersianDigits(exercise.baseXp)}</p>
          </div>
          <div className="rounded-xl border border-border bg-bg-secondary p-4 text-center">
            <BookOpen className="w-5 h-5 mx-auto mb-2 text-accent" />
            <p className="text-xs text-text-secondary">ماده‌ی اصلی</p>
            <p className="mt-1 font-bold text-sm">
              {exercise.bankSourceType
                ? BANK_TYPE_LABELS[exercise.bankSourceType] ?? exercise.bankSourceType
                : '—'}
            </p>
          </div>
        </div>

        {/* Skill weights */}
        {skills.length > 0 && (
          <div className="rounded-xl border border-border bg-bg-secondary p-6">
            <h2 className="text-sm font-bold text-text-secondary mb-4">مهارت‌های تمرین‌شده</h2>
            <div className="space-y-3">
              {skills.map(([skill, weight]) => (
                <div key={skill} className="flex items-center gap-3">
                  <span className="text-sm w-36 shrink-0">{translateSkill(skill)}</span>
                  <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full"
                      style={{ width: `${Math.min(weight * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-text-secondary w-10 text-left">
                    {toPersianDigits(Math.round(weight * 100))}٪
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rubric (if present) */}
        {Object.keys(exercise.rubricJson ?? {}).length > 0 && (
          <div className="rounded-xl border border-border bg-bg-secondary p-6">
            <h2 className="text-sm font-bold text-text-secondary mb-4">معیارهای ارزیابی</h2>
            <ul className="space-y-2 text-sm">
              {Object.entries(exercise.rubricJson).map(([key, val]) => (
                <li key={key} className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  <span>
                    <span className="font-medium">{translateRubricKey(key)}</span>
                    {typeof val === 'string' ? `: ${val}` : ' '}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA */}
        <div className="text-center pt-4">
          <button
            onClick={handleStart}
            disabled={starting}
            className="inline-flex items-center gap-2 px-8 py-4 bg-accent text-white rounded-xl font-bold text-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {starting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                در حال شروع…
              </>
            ) : (
              <>
                شروع تمرین
                <ArrowRight className="w-5 h-5 rotate-180" />
              </>
            )}
          </button>
          <p className="mt-3 text-xs text-text-secondary">
            برای شروع تمرین، باید وارد حساب کاربری شوید.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
