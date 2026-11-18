'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Newspaper,
  MessageSquare,
  Ghost,
  Plus,
  Star,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';
import { useCalendar } from '@/lib/calendar/calendar-provider';

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  category: string;
  publishedAt: string;
}

interface FeedbackItem {
  id: string;
  targetKind: string;
  targetId: string;
  content: string;
  rating: number | null;
  createdAt: string;
  author: { id: string; displayName: string };
  reviewer: { id: string; displayName: string };
}

interface CorpseChain {
  id: string;
  status: string;
  round: number;
  maxRounds: number;
  createdAt: string;
  _count?: { segments: number };
  segments?: {
    id: string;
    segmentText: string;
    round: number;
    author: { id: string; displayName: string };
  }[];
}

const TARGET_KIND_LABELS: Record<string, string> = {
  SUBMISSION: 'اثر تحویل‌شده',
  WRITING: 'نوشته',
  PROJECT: 'پروژه',
};

/**
 * `/community` — three sections backed by the real community controller:
 * 1. News feed (public GET /community/news; the per-user no-repeat
 *    GET /community/news/today is used when logged in).
 * 2. Peer feedback (GET/POST /community/feedback) — list + a review form.
 * 3. Exquisite corpse (جسد نفیس): open chains, start a chain, open a chain
 *    and append a segment (POST /community/corpse/:id/add).
 */
export default function CommunityPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { formatDate } = useCalendar();

  // ── News ──
  const newsQuery = useQuery({
    queryKey: ['community-news', Boolean(token)],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // DECISION: logged-in users get the per-user no-repeat daily page;
      // anonymous visitors get the plain approved feed.
      if (token) {
        const res = await api.get<{ items: NewsItem[]; date: string }>(
          '/community/news/today',
        );
        return res.items;
      }
      return api.get<NewsItem[]>('/community/news');
    },
  });

  // ── Feedback ──
  const feedbackQuery = useQuery({
    queryKey: ['community-feedback'],
    enabled: Boolean(token),
    staleTime: 2 * 60 * 1000,
    queryFn: () => api.get<FeedbackItem[]>('/community/feedback'),
  });

  const [fbContent, setFbContent] = useState('');
  const [fbAuthor, setFbAuthor] = useState('');
  const [fbKind, setFbKind] = useState<'SUBMISSION' | 'WRITING' | 'PROJECT'>('WRITING');
  const [fbTarget, setFbTarget] = useState('');
  const [fbRating, setFbRating] = useState(0);
  const [fbSaving, setFbSaving] = useState(false);

  const sendFeedback = async () => {
    if (!fbContent.trim() || !fbAuthor.trim() || !fbTarget.trim()) return;
    setFbSaving(true);
    try {
      await api.post('/community/feedback', {
        authorId: fbAuthor.trim(),
        targetKind: fbKind,
        targetId: fbTarget.trim(),
        content: fbContent.trim(),
        rating: fbRating > 0 ? fbRating : undefined,
      });
      setFbContent('');
      setFbAuthor('');
      setFbTarget('');
      setFbRating(0);
      feedbackQuery.refetch();
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        alert('بازخورد نامعتبر است (احتمالاً بازخورد برای اثر خودت)');
      } else {
        alert('خطا در ثبت بازخورد');
      }
    } finally {
      setFbSaving(false);
    }
  };

  // ── Exquisite corpse ──
  const corpseQuery = useQuery({
    queryKey: ['corpse-open'],
    enabled: Boolean(token),
    staleTime: 60 * 1000,
    queryFn: () => api.get<CorpseChain[]>('/community/corpse'),
  });

  const [openChainId, setOpenChainId] = useState<string | null>(null);

  const chainQuery = useQuery({
    queryKey: ['corpse-chain', openChainId],
    enabled: Boolean(token) && Boolean(openChainId),
    staleTime: 30 * 1000,
    queryFn: () => api.get<CorpseChain>(`/community/corpse/${openChainId}`),
  });

  const [segmentText, setSegmentText] = useState('');
  const [adding, setAdding] = useState(false);

  const startChain = async () => {
    try {
      await api.post('/community/corpse/start', {});
      corpseQuery.refetch();
    } catch {
      alert('خطا در شروع زنجیره');
    }
  };

  const addSegment = async () => {
    if (!openChainId || !segmentText.trim()) return;
    setAdding(true);
    try {
      await api.post(`/community/corpse/${openChainId}/add`, {
        segmentText: segmentText.trim(),
      });
      setSegmentText('');
      chainQuery.refetch();
      corpseQuery.refetch();
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        alert('این زنجیره دیگر باز نیست یا قبلاً در آن مشارکت کرده‌ای');
      } else {
        alert('خطا در افزودن قطعه');
      }
    } finally {
      setAdding(false);
    }
  };

  const fmt = (iso: string) => formatDate(iso);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">جامعه</h1>
          <p className="text-sm text-text-secondary">
            اخبار نویسندگی، بازخورد همتایان، و نوشتن جمعی (جسد نفیس).
          </p>
        </div>

        {/* ── News ── */}
        <section className="rounded-card border border-border bg-bg-secondary p-4 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Newspaper size={14} />
            اخبار نویسندگی
          </h2>
          {newsQuery.isLoading ? (
            <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
          ) : !newsQuery.data || newsQuery.data.length === 0 ? (
            <p className="text-sm text-text-secondary">خبری ثبت نشده</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {newsQuery.data.map((n) => (
                <li
                  key={n.id}
                  className="rounded-md border border-border bg-bg-primary p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{n.title}</p>
                    <span className="text-[11px] text-text-secondary shrink-0">
                      {fmt(n.publishedAt)}
                    </span>
                  </div>
                  {n.summary && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                      {n.summary}
                    </p>
                  )}
                  <p className="text-[11px] text-text-secondary mt-2">
                    {n.sourceName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Feedback (authed) ── */}
        {token && (
          <section className="rounded-card border border-border bg-bg-secondary p-4 space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare size={14} />
              بازخورد همتایان
            </h2>

            {feedbackQuery.isLoading ? (
              <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
            ) : (feedbackQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary">
                هنوز بازخوردی رد و بدل نشده
              </p>
            ) : (
              <ul className="space-y-2 max-h-60 overflow-y-auto">
                {(feedbackQuery.data ?? []).map((f) => (
                  <li
                    key={f.id}
                    className="rounded-md border border-border bg-bg-primary p-3"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                      <span>
                        {f.reviewer.displayName} → {f.author.displayName}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-[11px]">
                          {TARGET_KIND_LABELS[f.targetKind] ?? f.targetKind}
                        </span>
                        {f.rating && (
                          <span className="flex items-center gap-0.5 text-amber-400">
                            <Star size={10} fill="currentColor" />
                            {toPersianDigits(String(f.rating))}
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="text-sm mt-2" dir="rtl">
                      {f.content}
                    </p>
                    <p className="text-[11px] text-text-secondary mt-2">
                      {fmt(f.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs text-text-secondary">ثبت بازخورد جدید</p>
              <div className="flex gap-2">
                <input
                  value={fbAuthor}
                  onChange={(e) => setFbAuthor(e.target.value)}
                  placeholder="شناسهٔ نویسنده"
                  className="w-1/3 rounded-md border border-border bg-bg-primary px-3 py-2 text-xs"
                />
                <input
                  value={fbTarget}
                  onChange={(e) => setFbTarget(e.target.value)}
                  placeholder="شناسهٔ اثر"
                  className="w-1/3 rounded-md border border-border bg-bg-primary px-3 py-2 text-xs"
                />
                <select
                  value={fbKind}
                  onChange={(e) => setFbKind(e.target.value as typeof fbKind)}
                  className="w-1/3 rounded-md border border-border bg-bg-primary px-2 py-2 text-xs"
                >
                  <option value="WRITING">نوشته</option>
                  <option value="SUBMISSION">اثر تحویل‌شده</option>
                  <option value="PROJECT">پروژه</option>
                </select>
              </div>
              <textarea
                value={fbContent}
                onChange={(e) => setFbContent(e.target.value)}
                rows={2}
                placeholder="متن بازخورد"
                className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      onClick={() => setFbRating(r === fbRating ? 0 : r)}
                      className="text-lg leading-none"
                      aria-label={`امتیاز ${r}`}
                    >
                      <Star
                        size={16}
                        className={
                          r <= fbRating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-text-secondary'
                        }
                      />
                    </button>
                  ))}
                </div>
                <button
                  onClick={sendFeedback}
                  disabled={fbSaving}
                  className="rounded-md bg-accent text-white px-4 py-1.5 text-sm disabled:opacity-50"
                >
                  {fbSaving ? 'در حال ثبت…' : 'ثبت بازخورد'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Exquisite corpse (authed) ── */}
        {token && (
          <section className="rounded-card border border-border bg-bg-secondary p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <Ghost size={14} />
                جسد نفیس (نوشتن جمعی)
              </h2>
              <button
                onClick={startChain}
                className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:border-accent hover:text-accent"
              >
                <Plus size={12} />
                زنجیره‌ی جدید
              </button>
            </div>

            <p className="text-xs text-text-secondary">
              هر نویسنده یک قطعه می‌نویسد و زنجیره به نفر بعدی می‌رسد؛ تا{' '}
              {toPersianDigits('5')} قطعه باز می‌ماند.
            </p>

            {!token || corpseQuery.isLoading ? (
              <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
            ) : (corpseQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary">
                زنجیره‌ی بازیابی نیست — اولین را شروع کن
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(corpseQuery.data ?? []).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setOpenChainId(c.id)}
                    className={`px-3 py-1.5 rounded-full border text-xs ${
                      openChainId === c.id
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    زنجیره {toPersianDigits(String((c._count?.segments ?? 0) + 1))}
                    <span className="mr-1 opacity-60">
                      ({toPersianDigits(String(c.round))}/
                      {toPersianDigits(String(c.maxRounds))})
                    </span>
                  </button>
                ))}
              </div>
            )}

            {openChainId && (
              <div className="border-t border-border pt-3 space-y-3">
                {chainQuery.isLoading ? (
                  <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
                ) : chainQuery.data ? (
                  <>
                    <ul className="space-y-2">
                      {(chainQuery.data.segments ?? []).map((s) => (
                        <li
                          key={s.id}
                          className="rounded-md border border-border bg-bg-primary p-3"
                        >
                          <p className="text-xs text-text-secondary mb-1">
                            قطعه‌ی {toPersianDigits(String(s.round))} —{' '}
                            {s.author.displayName}
                          </p>
                          <p className="text-sm" dir="rtl">
                            {s.segmentText}
                          </p>
                        </li>
                      ))}
                    </ul>
                    {chainQuery.data.status === 'OPEN' &&
                      user &&
                      !chainQuery.data.segments?.some(
                        (s) => s.author.id === user.id as string,
                      ) && (
                        <div className="flex gap-2">
                          <textarea
                            value={segmentText}
                            onChange={(e) => setSegmentText(e.target.value)}
                            rows={2}
                            placeholder="قطعه‌ی تو"
                            className="flex-1 rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
                          />
                          <button
                            onClick={addSegment}
                            disabled={adding || !segmentText.trim()}
                            className="self-end rounded-md bg-accent text-white px-4 py-2 text-sm disabled:opacity-50"
                          >
                            {adding ? 'در حال افزودن…' : 'افزودن'}
                          </button>
                        </div>
                      )}
                    {chainQuery.data.status !== 'OPEN' && (
                      <p className="text-xs text-text-secondary">
                        این زنجیره بسته است
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-text-secondary">
                    زنجیره پیدا نشد
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
