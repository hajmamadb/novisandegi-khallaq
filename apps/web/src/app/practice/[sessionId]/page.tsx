'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Save, Send, X, Loader2, ExternalLink, Sparkles, BookOpen } from 'lucide-react';
import { TiptapEditor } from '@/components/practice/TiptapEditor';
import { ClusterCanvas } from '@/components/practice/ClusterCanvas';
import { SeriesProgress } from '@/components/practice/SeriesProgress';
import { api, ApiError } from '@/lib/api/client';
import { useEditorStore } from '@/lib/stores/editor-store';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits, translateCategory } from '@/lib/utils/persian';
import { enqueueEntry } from '@/lib/offline/outbox-db';
import { useOutboxCount } from '@/lib/offline/use-outbox';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PromptSnapshot {
  sourceItemTitle?: string;
  sourceItemContent?: string;
  sourceItemHint?: string;
  sourceName?: string;
  sourceUrl?: string;
  [key: string]: unknown;
}

interface SessionDetail {
  id: string;
  status: string;
  startedAt: string;
  rerollCount: number;
  promptSnapshotJson: PromptSnapshot;
  exerciseType: {
    id: string;
    slug: string;
    title: string;
    description: string;
    wordTargetMin: number;
    wordTargetMax: number;
    durationSeconds: number;
  } | null;
  drafts: { id: string; contentText: string; versionNumber: number }[];
  submission: { wordCount: number } | null;
}

interface RerollResponse {
  session: { promptSnapshotJson: PromptSnapshot };
  sourceItem: { title?: string; content?: string; [key: string]: unknown };
}

interface SubmitResponse {
  submission: { wordCount: number; xpAwarded: number };
  xpResult: { finalXp: number; breakdown?: Record<string, number> };
  newBadges: { slug: string; titleFa: string }[];
  warning: string | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PracticePage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const sessionId = params.sessionId;

  // Editor store
  const store = useEditorStore();
  const { setContent, onKeystroke, onPaste, onTick, markSaved, reset } = store;

  // Local UI state
  const [submitting, setSubmitting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [abandonModalOpen, setAbandonModalOpen] = useState(false);
  const [rerolling, setRerolling] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'queued'>('idle');
  const outboxCount = useOutboxCount();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keystrokeThrottle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch session detail
  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    enabled: Boolean(token) && Boolean(sessionId),
    staleTime: 0, // always fresh — the session is the live object
    queryFn: () => api.get<SessionDetail>(`/sessions/${sessionId}`),
  });

  // Initialize editor store on mount / when session loads
  useEffect(() => {
    if (session) {
      reset(session.id);
      const latestDraft =
        session.drafts.length > 0
          ? session.drafts[session.drafts.length - 1].contentText
          : '';
      if (latestDraft) {
        setContent(latestDraft);
        markSaved();
      }
    }
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 30-second activity tick (spec F.7 — activeTime tracking)
  useEffect(() => {
    const interval = setInterval(() => {
      // Only tick if the tab is visible and the user was recently active
      if (document.visibilityState === 'visible') {
        onTick();
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [onTick]);

  // -------------------------------------------------------------------
  // Autosave (10s debounce)
  // -------------------------------------------------------------------

  const saveDraft = useCallback(
    async (text: string, trigger: 'AUTO' | 'MANUAL' = 'AUTO') => {
      if (!sessionId) return;
      setSaveState('saving');
      try {
        await api.post(`/sessions/${sessionId}/drafts`, {
          contentText: text,
          saveTrigger: trigger,
        });
        setSaveState('saved');
        markSaved();
      } catch {
        // Offline (or transient failure): buffer the draft in the IndexedDB
        // outbox so the writer's in-progress text survives the outage. The
        // flush controller delivers it when the network returns.
        try {
          await enqueueEntry({
            id: `draft-${sessionId}-${Date.now()}`,
            method: 'POST',
            path: `/sessions/${sessionId}/drafts`,
            body: { contentText: text, saveTrigger: trigger },
            createdAt: Date.now(),
            attempts: 0,
            nextRetryAt: null,
          });
          setSaveState('queued');
          markSaved();
        } catch {
          // Even the outbox failed (e.g. storage full) — keep text in memory.
          setSaveState('idle');
        }
      }
    },
    [sessionId, markSaved],
  );

  const handleChange = useCallback(
    (text: string, _html: string) => {
      setContent(text);
      onKeystroke();

      // Debounce the keystroke counter for the API (throttle to 1/sec).
      if (!keystrokeThrottle.current) {
        keystrokeThrottle.current = setTimeout(() => {
          keystrokeThrottle.current = null;
        }, 1000);
      }

      // Debounce the autosave (10s).
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveDraft(text);
      }, 60_000);
    },
    [setContent, onKeystroke, saveDraft],
  );

  // Flush any pending save on unmount. Route through saveDraft so an
  // offline final save lands in the outbox instead of being dropped.
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        // Fire-and-forget final save.
        if (store.content) {
          saveDraft(store.content, 'MANUAL').catch(() => {});
        }
      }
    };
  }, [sessionId, store.content, saveDraft]);

  // -------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------

  const handleSave = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await saveDraft(store.content);
  };

  const handleSubmit = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      const res = await api.post<SubmitResponse>(`/sessions/${sessionId}/submit`, {
        contentText: store.content,
        clientStats: {
          wordCount: store.wordCount,
          durationSeconds: Math.round((Date.now() - store.startTime) / 1000),
          activeTimeSeconds: store.activeTimeSeconds,
          totalKeystrokes: store.keystrokes,
          pasteEvents: store.pastes.length,
          pasteCharCount: store.pastes.reduce((s, p) => s + p.charCount, 0),
        },
      });

      if (res.warning) {
        toast.warning('متن کوتاه‌تر از حد هدف است');
      }
      const xp = res.xpResult?.finalXp ?? res.submission?.xpAwarded ?? 0;
      toast.success(`تمرین ثبت شد! ${toPersianDigits(String(xp))} امتیاز کسب کردی 🎉`);
      if (res.newBadges?.length) {
        toast.success(`نشان جدید: ${res.newBadges.map((b) => b.titleFa).join('، ')}`);
      }
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در ارسال');
      setSubmitting(false);
    }
  };

  const handleAbandon = () => {
    setAbandonModalOpen(true);
  };

  const confirmAbandon = async () => {
    if (!sessionId) return;
    setAbandoning(true);
    try {
      await api.post(`/sessions/${sessionId}/abandon`);
      setAbandonModalOpen(false);
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'خطا در رهاسازی جلسه');
      setAbandoning(false);
    }
  };

  const handleReroll = async () => {
    if (!sessionId) return;
    setRerolling(true);
    try {
      const res = await api.post<RerollResponse>(`/sessions/${sessionId}/reroll`);
      // Update the prompt snapshot locally.
      const newSnapshot = res.session.promptSnapshotJson;
      const newTitle =
        newSnapshot.sourceItemTitle ?? res.sourceItem.title ?? 'تمرین جدید';
      const newContent =
        newSnapshot.sourceItemContent ?? res.sourceItem.content ?? '';
      // Re-fetch the session to get the updated snapshot.
      router.refresh();
      toast.success('تمرین جدید: ' + newTitle);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message === 'REROLL_LIMIT_REACHED'
            ? 'حداکثر تعداد تغییر تمرین امروز را استفاده کردی'
            : err.message
          : 'خطا',
      );
    } finally {
      setRerolling(false);
    }
  };

  // -------------------------------------------------------------------
  // Clustering web (force-directed) — only for clustering exercises
  // -------------------------------------------------------------------

  const slug = session?.exerciseType?.slug;
  const isClustering = Boolean(slug?.startsWith('clustering'));

  // DECISION: hub is read client-side from the prompt snapshot.
  //  - bank-driven clustering exercises (emotion/place/object/synonym/antonym)
  //    carry the hub word in sourceItemTitle (set by promptFieldsForItem).
  //  - the bank-less `clustering` exercise builds the hub from the writer's
  //    first typed word; until one exists we fall back to the title.
  const snap = session?.promptSnapshotJson;
  const typedHub = store.content.trim().split(/\s+/)[0] || '';
  const hubWord =
    isClustering && slug === 'clustering'
      ? typedHub || snap?.sourceItemTitle || 'کلمه‌ات'
      : snap?.sourceItemTitle || snap?.sourceItemContent?.trim().split(/\s+/)[0] || '';

  const { data: clusterData } = useQuery({
    queryKey: ['cluster', slug],
    enabled: isClustering && Boolean(token),
    staleTime: 5 * 60_000, // the catalog rarely changes
    queryFn: () => api.get<{ minHubWords: number; candidates: { text: string; pos?: string | null }[] }>(`/exercises/${slug}/cluster`),
  });

  const handleCopyCluster = useCallback(
    (clusterText: string) => {
      // DECISION: appending to the draft (no separate log); the text flows
      // through the normal submit. Prepend a newline so it starts a fresh
      // line inside the Tiptap document.
      const next = store.content ? `${store.content}\n\n${clusterText}` : clusterText;
      setContent(next);
      onKeystroke();
      saveDraft(next, 'MANUAL');
      toast.success('خوشه به پیش‌نویس اضافه شد');
    },
    [store.content, setContent, onKeystroke, saveDraft],
  );

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-text-secondary">جلسه یافت نشد</p>
        <button onClick={() => router.push('/dashboard')} className="text-accent text-sm">
          بازگشت به داشبورد
        </button>
      </div>
    );
  }

  const snapshot = session.promptSnapshotJson;
  const promptTitle = snapshot.sourceItemTitle ?? session.exerciseType?.title ?? 'تمرین';
  const promptContent = snapshot.sourceItemContent ?? session.exerciseType?.description ?? '';
  const wordTargetMin = session.exerciseType?.wordTargetMin ?? 0;
  const wordTargetMax = session.exerciseType?.wordTargetMax ?? 0;
  const elapsed = store.startTime
    ? Math.floor((Date.now() - store.startTime) / 60000)
    : 0;

  return (
    // Spec F.7 — full-screen writing environment, no app shell.
    <div className="min-h-screen flex flex-col bg-bg-primary">
      {/* Top bar */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleAbandon}
            disabled={abandoning}
            title="رها کردن"
            className="p-2 rounded-md text-text-secondary hover:bg-bg-secondary disabled:opacity-40"
          >
            {abandoning ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
          </button>
          <h1 className="text-sm font-medium truncate max-w-[300px]">{promptTitle}</h1>
        </div>
        <div className="flex items-center gap-4 text-xs text-text-secondary">
          <span>
            {toPersianDigits(String(store.wordCount))} کلمه
          </span>
          <span>
            {toPersianDigits(String(elapsed))} دقیقه
          </span>
          <span>
            هدف: {toPersianDigits(String(wordTargetMin))}–{toPersianDigits(String(wordTargetMax))}
          </span>
          {saveState === 'saving' && <span>در حال ذخیره…</span>}
          {saveState === 'saved' && <span className="text-success">ذخیره شد ✓</span>}
          {saveState === 'queued' && (
            <span className="text-warning" title="آفلاین است؛ هنگام اتصال ذخیره می‌شود">
              در صف آفلاین ⏳
            </span>
          )}
          {outboxCount > 0 && (
            <span
              className="text-warning"
              title="عملیات در انتظار همگام‌سازی — با برقراری اتصال ارسال می‌شوند"
            >
              {toPersianDigits(String(outboxCount))} در انتظار همگام‌سازی
            </span>
          )}
        </div>
      </header>

      {/* Main: 70/30 split (editor / exercise card) */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Editor (70%) */}
        <main className="flex-1 lg:w-[70%] overflow-y-auto">
          <TiptapEditor
            key={session.id + '-' + session.rerollCount}
            initialContent={
              session.drafts.length > 0
                ? session.drafts[session.drafts.length - 1].contentText
                : ''
            }
            placeholder="اینجا شروع کن…"
            onChange={handleChange}
            onPaste={onPaste}
            editable={session.status !== 'SUBMITTED'}
          />
        </main>

        {/* Exercise card (30%) */}
        <aside className="lg:w-[30%] border-t lg:border-t-0 lg:border-l border-border bg-bg-secondary p-4 space-y-4 overflow-y-auto">
          {/* سوژه اصلی و تیتر / محتوا */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-accent bg-accent/10 px-2.5 py-0.5 rounded-full">
                {session.exerciseType?.title ?? 'تمرین'}
              </span>
              {session.exerciseType?.category && (
                <span className="text-[11px] text-text-secondary">
                  دسته‌بندی: {translateCategory(session.exerciseType.category)}
                </span>
              )}
            </div>

            {promptTitle && promptTitle !== session.exerciseType?.title && (
              <h2 className="text-base font-bold text-text-primary leading-snug">
                {promptTitle}
              </h2>
            )}

            <div className="bg-bg-primary border border-border rounded-lg p-3.5 space-y-2">
              <h3 className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                <span>سوژه و متن تمرین</span>
              </h3>
              <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                {promptContent}
              </p>

              {/* منبع خبر در صورت وجود */}
              {(snapshot.sourceName || snapshot.sourceUrl) && (
                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                  <span className="text-text-secondary">
                    منبع: <strong>{snapshot.sourceName || 'رسانه خبری'}</strong>
                  </span>
                  {snapshot.sourceUrl && (
                    <a
                      href={snapshot.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline flex items-center gap-1"
                    >
                      <span>مشاهده اصل خبر</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* راهنمای نویسندگی و تکنیک‌های هدایت قلم */}
            {snapshot.sourceItemHint && (
              <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-accent font-bold text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>راهنمای نویسندگی و پرورش ایده</span>
                </div>
                <div className="text-xs text-text-primary whitespace-pre-line leading-relaxed pr-1">
                  {snapshot.sourceItemHint}
                </div>
              </div>
            )}

            {/* توضیحات تکمیلی تیپ تمرین */}
            {session.exerciseType?.description && session.exerciseType.description !== promptContent && (
              <div className="text-xs text-text-secondary bg-bg-secondary p-2.5 rounded border border-border/60">
                <span className="font-semibold block mb-1">هدف تمرین:</span>
                {session.exerciseType.description}
              </div>
            )}
          </div>

          {/* Series progress bar — spec F.5.2 «اگر سری‌محور: نوار پیشرفت سری» */}
          <SeriesProgress slug={slug ?? ''} />

          {/* Clustering web — force-directed word canvas (spec G.10) */}
          {isClustering && hubWord && clusterData && (
            <div className="border-t border-border pt-4">
              <h2 className="text-sm font-bold mb-2">🕸️ خوشه کلمات</h2>
              <p className="text-xs text-text-secondary mb-3">
                روی کلمات بزن تا به خوشه اضافه شوند؛ بعد کپی کن.
              </p>
              <ClusterCanvas
                hubWord={hubWord}
                candidates={clusterData.candidates}
                minHubWords={clusterData.minHubWords}
                onCopyCluster={handleCopyCluster}
              />
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-2">
            <button
              onClick={handleReroll}
              disabled={rerolling || session.status === 'SUBMITTED'}
              className="flex items-center gap-2 w-full text-sm text-text-secondary hover:text-accent disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={14} className={rerolling ? 'animate-spin' : ''} />
              تمرین دیگر
            </button>
          </div>

          <div className="border-t border-border pt-4 space-y-2">
            <button
              onClick={handleSave}
              disabled={saveState === 'saving'}
              className="flex items-center gap-2 w-full text-sm text-text-secondary hover:text-accent disabled:opacity-40 transition-colors"
            >
              <Save size={14} />
              ذخیره
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || session.status === 'SUBMITTED'}
              className="flex items-center gap-2 w-full bg-accent text-white rounded-md px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              ارسال
            </button>
          </div>
        </aside>
      </div>

      <ConfirmModal
        isOpen={abandonModalOpen}
        onClose={() => setAbandonModalOpen(false)}
        onConfirm={confirmAbandon}
        title="رها کردن تمرین"
        description="آیا مطمئن هستی؟ این جلسه به عنوان رهاشده ثبت می‌شود. البته پیش‌نویس شما در سیستم محفوظ است و می‌توانید بعداً از طریق داشبورد ادامه دهید."
        confirmText="بله، رها کن"
        cancelText="ادامه نوشتن"
        variant="warning"
        isLoading={abandoning}
      />
    </div>
  );
}
