'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Dices,
  RefreshCw,
  Settings,
  Shield,
  Pencil,
  ExternalLink,
  PenTool,
  Clock,
  Target,
  Sparkles,
  BookOpen,
  Loader2,
  ChevronLeft,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits, translateCategory } from '@/lib/utils/persian';
import { toast } from 'sonner';

// ── Bank definitions ──
const BANKS: { type: string; label: string }[] = [
  { type: 'CHARACTER', label: 'شخصیت' },
  { type: 'PLACE', label: 'مکان' },
  { type: 'OPENING_LINE', label: 'جمله‌ی آغازین' },
  { type: 'NEWS', label: 'خبر' },
  { type: 'STYLE_PARAGRAPH', label: 'پاراگراف سبکی' },
  { type: 'REFERENCE_STORY', label: 'داستان مرجع' },
  { type: 'WHAT_IF', label: 'اگر…چه؟' },
  { type: 'EMOTION', label: 'واژگان احساسی' },
  { type: 'OBJECT', label: 'شیء' },
  { type: 'WORD', label: 'کلمه' },
  { type: 'IMAGE', label: 'تصویر' },
  { type: 'STRUCTURE_PHRASE', label: 'عبارت ساختاری' },
  { type: 'CUTUP_TEXT', label: 'متن بریده' },
];

interface ExerciseCatalogItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  bankSourceType?: string | null;
  durationSeconds: number;
  wordTargetMin: number;
  wordTargetMax: number;
  baseXp: number;
}

// Maps a raw bank row to { title, content, hint } using standard fields
function describeItem(type: string, r: Record<string, unknown>) {
  const s = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v : undefined;
  const num = (v: unknown): string | undefined =>
    typeof v === 'number' ? String(v) : undefined;
  switch (type) {
    case 'CHARACTER':
      return {
        title: s(r.name),
        content: s(r.background),
        hint: [s(r.occupation), s(r.temperament), s(r.ageRange)].filter(Boolean).join(' · ') || undefined,
      };
    case 'PLACE': {
      const senses = Array.isArray(r.suggestedSenses) ? (r.suggestedSenses as string[]) : [];
      return {
        title: s(r.name),
        content: s(r.description),
        hint: [s(r.type), senses.length ? `حواس: ${senses.join('، ')}` : null].filter(Boolean).join(' · ') || undefined,
      };
    }
    case 'OPENING_LINE':
      return { title: 'جمله‌ی آغازین', content: s(r.text), hint: [s(r.genre), s(r.mood)].filter(Boolean).join(' · ') || undefined };
    case 'NEWS':
      return {
        title: s(r.title),
        content: s(r.summary) ?? s(r.fullText),
        hint: s(r.sourceName) ? `منبع: ${r.sourceName}` : undefined,
      };
    case 'STYLE_PARAGRAPH':
      return {
        title: [s(r.author), s(r.work), num(r.year)].filter(Boolean).join('، ') || 'نمونه‌ی سبکی',
        content: s(r.originalText),
        hint: s(r.styleFeature) ? `ویژگی سبکی: ${r.styleFeature}` : undefined,
      };
    case 'REFERENCE_STORY':
      return { title: s(r.title), content: s(r.text), hint: [s(r.author), s(r.genre)].filter(Boolean).join(' · ') || undefined };
    case 'IMAGE':
      return { title: s(r.topic) || 'تصویر', content: s(r.description), hint: s(r.photographer) ? `عکاس: ${r.photographer}` : undefined };
    case 'OBJECT':
      return { title: s(r.name), content: s(r.description), hint: s(r.category) ? `دسته: ${r.category}` : undefined };
    case 'EMOTION':
      return { title: s(r.word), content: s(r.showSample), hint: s(r.emotion) ? `احساس: ${r.emotion}` : undefined };
    case 'WHAT_IF':
      return { title: 'ایده اگر … چه؟', content: s(r.question), hint: s(r.target) ? `هدف: ${r.target}` : undefined };
    case 'STRUCTURE_PHRASE':
      return { title: 'عبارت ساختاری', content: s(r.text), hint: s(r.stage) ? `مرحله: ${r.stage}` : undefined };
    case 'WORD':
      return { title: s(r.text), content: s(r.pos) ? `نقش: ${r.pos}` : undefined, hint: num(r.frequency) ? `بسامد: ${r.frequency}` : undefined };
    case 'CUTUP_TEXT':
      return { title: 'متن بریده', content: s(r.text), hint: s(r.source) ? `منبع: ${r.source}` : undefined };
    default:
      return {
        title: s(r.title) ?? s(r.name) ?? s(r.text),
        content: s(r.text) ?? s(r.contentText),
      };
  }
}

interface DrawResult {
  item: Record<string, unknown>;
  selectionLogId: string;
  cyclePosition?: string;
}

export default function BanksPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const canBrowse =
    user?.role === 'ADMIN' || user?.role === 'MENTOR' || user?.role === 'EDITOR';

  const [bankType, setBankType] = useState('PLACE');
  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingExerciseId, setStartingExerciseId] = useState<string | null>(null);

  // Fetch full exercise catalog
  const exercisesQuery = useQuery({
    queryKey: ['public-exercises'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<ExerciseCatalogItem[]>('/exercises'),
  });

  const draw = async () => {
    setDrawing(true);
    setError(null);
    try {
      const res = await api.post<DrawResult>(`/banks/${bankType}/draw`, {});
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ['banks', bankType] });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) setError('این بانک هنوز سوژه‌ای ندارد.');
        else if (e.status === 501) setError('این بانک هنوز در دسترس نیست.');
        else setError('خطا در انتخاب از بانک.');
      } else {
        setError('خطا در انتخاب از بانک.');
      }
      setResult(null);
    } finally {
      setDrawing(false);
    }
  };

  // Automatically draw a random item when entering or changing bank type
  useEffect(() => {
    draw();
  }, [bankType]);

  const browseQuery = useQuery({
    queryKey: ['banks', bankType],
    enabled: Boolean(token) && canBrowse,
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Record<string, unknown>[]>(`/banks/${bankType}`),
  });

  const current = BANKS.find((b) => b.type === bankType)!;
  const drawn = result ? describeItem(bankType, result.item) : null;

  // Filter exercises relevant to the active bank item
  const matchingExercises = useMemo(() => {
    const all = exercisesQuery.data ?? [];
    // 1. Direct match: exercises built for this bankSourceType
    const directMatches = all.filter((ex) => ex.bankSourceType === bankType);
    if (directMatches.length > 0) return directMatches;

    // 2. Thematic fallback if no exercise directly points to this bankType
    const categoryMap: Record<string, string[]> = {
      PLACE: ['SCENE', 'BASIC'],
      CHARACTER: ['CHARACTER', 'DIALOGUE', 'BASIC'],
      NEWS: ['JOURNALISM', 'STYLE', 'BASIC'],
      OPENING_LINE: ['BASIC', 'HABIT', 'IDEA'],
      WHAT_IF: ['IDEA', 'STRUCTURE', 'BASIC'],
      EMOTION: ['BASIC', 'STYLE'],
      OBJECT: ['SCENE', 'BASIC'],
      WORD: ['BASIC', 'CONSTRAINT'],
      CUTUP_TEXT: ['CONSTRAINT', 'IDEA'],
      STYLE_PARAGRAPH: ['STYLE', 'BASIC'],
      REFERENCE_STORY: ['STRUCTURE', 'BASIC'],
    };
    const targetCats = categoryMap[bankType] || ['BASIC'];
    return all.filter((ex) => targetCats.includes(ex.category)).slice(0, 4);
  }, [exercisesQuery.data, bankType]);

  // Start exercise with the exact selected bank item
  const handleStartPractice = async (exerciseId: string) => {
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    if (!activeToken) {
      toast.info('برای شروع تمرین ابتدا وارد حساب کاربری خود شوید.');
      router.push('/auth/login');
      return;
    }

    setStartingExerciseId(exerciseId);
    try {
      const payload: Record<string, unknown> = {
        exerciseTypeId: exerciseId,
      };
      if (result?.item?.id) {
        payload.sourceItemId = result.item.id;
        payload.sourceItemType = bankType;
      }

      const res = await api.post<{ session: { id: string } }>('/sessions', payload);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success(`جلسه تمرین با سوژه «${drawn?.title ?? current.label}» آماده شد!`);
      router.push(`/practice/${res.session.id}`);
    } catch (err) {
      toast.error('در ایجاد تمرین خطایی رخ داد. دوباره تلاش کنید.');
    } finally {
      setStartingExerciseId(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Admin Quick Action Banner */}
        {user?.role === 'ADMIN' && (
          <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-accent font-bold text-sm">
                <Shield size={18} />
                <span>دسترسی مدیریت کل به بانک‌های محتوا</span>
              </div>
              <p className="text-xs text-text-secondary">
                شما می‌توانید آیتم‌های تمام بانک‌ها را مشاهده، ویرایش، حذف، اضافه یا غیرفعال کنید.
              </p>
            </div>
            <Link
              href="/admin/banks"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm shrink-0"
            >
              <Settings size={14} />
              <span>پنل مدیریت و ویرایش بانک‌ها</span>
            </Link>
          </div>
        )}

        {/* Page Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-text-primary">بانک‌های ایده و سوژه‌سازی</h1>
          <p className="text-xs text-text-secondary leading-relaxed">
            بانک مورد نظرت را انتخاب کن. در بدو ورود یک سوژه تصادفی برایت ظاهر می‌شود. می‌توانید سوژه‌های دیگر را امتحان کرده و بلافاصله تمرین متناسب با آن را شروع کنید.
          </p>
        </div>

        {/* Bank Type Pills */}
        <div className="flex flex-wrap gap-2">
          {BANKS.map((b) => (
            <button
              key={b.type}
              onClick={() => {
                setBankType(b.type);
                setResult(null);
                setError(null);
              }}
              className={`px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all ${
                bankType === b.type
                  ? 'border-accent bg-accent text-white shadow-sm'
                  : 'border-border bg-bg-secondary text-text-secondary hover:text-text-primary hover:border-accent/40'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Drawn Item Card */}
        <div className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              <span className="text-sm font-bold text-text-primary">
                سوژه تصادفی از بانک «{current.label}»
              </span>
            </div>
            <button
              onClick={draw}
              disabled={drawing}
              className="flex items-center gap-1.5 rounded-lg bg-accent text-white px-3.5 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
              title="سوژه دیگری از این بانک برایم بیاور"
            >
              {drawing ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Dices size={15} />
              )}
              <span>{drawing ? 'در حال چرخش…' : 'یک سوژه دیگر (انتخاب تصادفی)'}</span>
            </button>
          </div>

          {error && (
            <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg text-xs text-danger">
              {error}
            </div>
          )}

          {drawing && !drawn && (
            <div className="flex items-center justify-center py-10 gap-2 text-xs text-text-secondary">
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
              <span>در حال قرعه‌کشی سوژه مناسب…</span>
            </div>
          )}

          {drawn && (
            <div className="rounded-lg border border-accent/20 bg-bg-primary p-4 space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-1.5 h-full bg-accent" />
              {drawn.title && (
                <h3 className="text-lg font-bold text-text-primary pr-2">
                  {drawn.title}
                </h3>
              )}
              {drawn.content && (
                <p className="text-sm text-text-primary leading-relaxed pr-2 whitespace-pre-wrap" dir="rtl">
                  {drawn.content}
                </p>
              )}
              {drawn.hint && (
                <div className="text-xs text-text-secondary bg-bg-secondary/70 p-2.5 rounded-md border border-border/60 pr-2">
                  <span className="font-semibold text-accent ml-1">مشخصات و راهنما:</span>
                  <span>{drawn.hint}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Relevant exercises for this specific item ── */}
          {drawn && (
            <div className="pt-4 border-t border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-accent" />
                  <h4 className="text-sm font-bold text-text-primary">
                    با این سوژه ({drawn.title ?? current.label}) چه تمرینی می‌توانید انجام دهید؟
                  </h4>
                </div>
                <span className="text-xs text-text-secondary">
                  {toPersianDigits(matchingExercises.length)} تمرین متناسب
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {matchingExercises.map((ex) => {
                  const isStartingThis = startingExerciseId === ex.id;
                  return (
                    <div
                      key={ex.id}
                      className="rounded-lg border border-border bg-bg-primary p-3.5 flex flex-col justify-between gap-3 hover:border-accent/50 transition-all group"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="font-bold text-sm text-text-primary group-hover:text-accent transition-colors">
                            {ex.title}
                          </h5>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-bg-secondary text-text-secondary border border-border shrink-0">
                            {translateCategory(ex.category)}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                          {ex.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-text-secondary">
                        <div className="flex items-center gap-2.5">
                          <span className="flex items-center gap-1">
                            <Clock size={12} className="text-accent" />
                            {toPersianDigits(Math.ceil(ex.durationSeconds / 60))} دقیقه
                          </span>
                          <span className="flex items-center gap-1">
                            <Target size={12} className="text-accent" />
                            {toPersianDigits(ex.wordTargetMin)}–{toPersianDigits(ex.wordTargetMax)} کلمه
                          </span>
                        </div>

                        <button
                          onClick={() => handleStartPractice(ex.id)}
                          disabled={isStartingThis || startingExerciseId !== null}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
                        >
                          {isStartingThis ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              <span>در حال شروع…</span>
                            </>
                          ) : (
                            <>
                              <PenTool size={13} />
                              <span>شروع این تمرین با این سوژه</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Browse list for privileged roles */}
        {canBrowse && (
          <div className="rounded-xl border border-border bg-bg-secondary p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h2 className="text-sm font-bold text-text-primary">
                فهرست کامل سوژه‌های {current.label}{' '}
                <span className="text-text-secondary text-xs font-normal">
                  ({browseQuery.data ? toPersianDigits(String(browseQuery.data.length)) : '…'} سوژه ثبت‌شده)
                </span>
              </h2>
              {user?.role === 'ADMIN' && (
                <Link
                  href="/admin/banks"
                  className="flex items-center gap-1 text-xs text-accent hover:underline font-medium"
                >
                  <span>مدیریت، ویرایش و حذف در پنل</span>
                  <ExternalLink size={12} />
                </Link>
              )}
            </div>
            {browseQuery.isLoading ? (
              <p className="text-xs text-text-secondary py-4 text-center">در حال بارگذاری لیست سوژه‌ها…</p>
            ) : !browseQuery.data || browseQuery.data.length === 0 ? (
              <p className="text-xs text-text-secondary py-4 text-center">سوژه‌ای در این بانک یافت نشد.</p>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {browseQuery.data.map((r) => {
                  const d = describeItem(bankType, r);
                  const isCurrentSelected = result?.item?.id === r.id;
                  return (
                    <li
                      key={String(r.id)}
                      className={`rounded-lg border p-3 flex items-start justify-between gap-3 transition-colors ${
                        isCurrentSelected
                          ? 'border-accent bg-accent/5 ring-1 ring-accent'
                          : 'border-border bg-bg-primary hover:border-accent/40'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-text-primary">
                            {d.title ?? 'بدون عنوان'}
                          </p>
                          {isCurrentSelected && (
                            <span className="text-[10px] bg-accent text-white px-1.5 py-0.2 rounded font-medium">
                              انتخاب‌شده فعلی
                            </span>
                          )}
                        </div>
                        {d.content && (
                          <p className="text-xs text-text-secondary mt-1 line-clamp-2 leading-relaxed" dir="rtl">
                            {d.content}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Select this item as active */}
                        <button
                          onClick={() => {
                            setResult({ item: r, selectionLogId: '' });
                            toast.info(`سوژه «${d.title ?? current.label}» انتخاب شد. تمرین مورد نظر را از بالا انتخاب کنید.`);
                            window.scrollTo({ top: 120, behavior: 'smooth' });
                          }}
                          className="px-2.5 py-1 text-xs rounded border border-border text-text-secondary hover:text-accent hover:border-accent transition-colors"
                        >
                          انتخاب این سوژه
                        </button>

                        {user?.role === 'ADMIN' && (
                          <Link
                            href="/admin/banks"
                            className="p-1.5 rounded-md text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
                            title="ویرایش یا غیرفعال‌سازی در پنل مدیریت"
                          >
                            <Pencil size={14} />
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
