'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, Send } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';
import { useCalendar } from '@/lib/calendar/calendar-provider';

interface Thread {
  participant: {
    id: string;
    displayName: string;
    email: string;
    role: string;
  } | null;
  lastMessageAt: string | null;
  messageCount: number;
  unreadCount: number;
}

interface Message {
  id: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  sender: { id: string; displayName: string };
}

/**
 * `/messages` — two-pane inbox: the left (top on mobile) lists threads
 * (GET /messages/threads), the right shows the open conversation
 * (GET /messages/threads/:participantId — which also marks incoming
 * messages as read server-side) with a send box (POST /messages).
 */
export default function MessagesPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { formatDate } = useCalendar();

  const [activeId, setActiveId] = useState<string | null>(null);

  const threadsQuery = useQuery({
    queryKey: ['message-threads'],
    enabled: Boolean(token),
    staleTime: 30 * 1000,
    queryFn: () => api.get<Thread[]>('/messages/threads'),
  });

  const convQuery = useQuery({
    queryKey: ['message-conversation', activeId],
    enabled: Boolean(token) && Boolean(activeId),
    staleTime: 30 * 1000,
    queryFn: () => api.get<Message[]>(`/messages/threads/${activeId}`),
  });

  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['message-threads'] });
    if (activeId) {
      queryClient.invalidateQueries({
        queryKey: ['message-conversation', activeId],
      });
    }
  };

  const send = async () => {
    if (!activeId || !body.trim()) return;
    setSending(true);
    try {
      await api.post('/messages', {
        recipientId: activeId,
        body: body.trim(),
      });
      setBody('');
      refresh();
    } catch {
      alert('خطا در ارسال پیام');
    } finally {
      setSending(false);
    }
  };

  const fmt = (iso: string) => formatDate(iso, true);

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">پیام‌ها</h1>
          <p className="text-sm text-text-secondary">
            گفت‌وگو با سایر اعضای کارگاه.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          {/* ── Thread list ── */}
          <div className="rounded-card border border-border bg-bg-secondary p-3 md:col-span-1">
            <h2 className="text-sm font-medium mb-2 px-1">
              مکالمات{' '}
              <span className="text-text-secondary text-xs">
                ({threadsQuery.data ? toPersianDigits(String(threadsQuery.data.length)) : '…'})
              </span>
            </h2>
            {threadsQuery.isLoading ? (
              <p className="text-sm text-text-secondary px-1">
                در حال بارگذاری…
              </p>
            ) : (threadsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary px-1">
                هنوز مکالمه‌ای نداری
              </p>
            ) : (
              <ul className="space-y-1">
                {(threadsQuery.data ?? []).map((t) =>
                  t.participant ? (
                    <li key={t.participant.id}>
                      <button
                        onClick={() => setActiveId(t.participant!.id)}
                        className={`w-full text-right rounded-md px-3 py-2 flex items-center justify-between gap-2 ${
                          activeId === t.participant.id
                            ? 'bg-accent/10 text-accent'
                            : 'hover:bg-bg-primary text-text-secondary'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium truncate">
                            {t.participant.displayName}
                          </span>
                          <span className="block text-[11px] truncate">
                            {t.lastMessageAt ? fmt(t.lastMessageAt) : '—'}
                          </span>
                        </span>
                        {t.unreadCount > 0 && (
                          <span className="shrink-0 text-[11px] bg-accent text-white rounded-full px-1.5 py-0.5">
                            {toPersianDigits(String(t.unreadCount))}
                          </span>
                        )}
                      </button>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </div>

          {/* ── Conversation ── */}
          <div className="rounded-card border border-border bg-bg-secondary p-4 md:col-span-2 space-y-3">
            {!activeId ? (
              <div className="text-center py-12 text-text-secondary text-sm">
                یک مکالمه را انتخاب کن
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveId(null)}
                    className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary md:hidden"
                  >
                    <ArrowRight size={14} />
                    بازگشت
                  </button>
                  <h2 className="text-sm font-medium">
                    با {threadsQuery.data?.find((t) => t.participant?.id === activeId)?.participant?.displayName ?? '…'}
                  </h2>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {convQuery.isLoading ? (
                    <p className="text-sm text-text-secondary">
                      در حال بارگذاری…
                    </p>
                  ) : (convQuery.data ?? []).length === 0 ? (
                    <p className="text-sm text-text-secondary">
                      پیامی رد و بدل نشده
                    </p>
                  ) : (
                    (convQuery.data ?? []).map((m) => {
                      const mine = m.sender.id === user?.id;
                      return (
                        <div
                          key={m.id}
                          className={`flex ${mine ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-3 py-2 ${
                              mine
                                ? 'bg-accent/15 border border-accent/30'
                                : 'bg-bg-primary border border-border'
                            }`}
                          >
                            <p className="text-sm" dir="rtl">
                              {m.body}
                            </p>
                            <p className="text-[10px] text-text-secondary mt-1">
                              {fmt(m.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t border-border">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    placeholder="پیامت…"
                    className="flex-1 rounded-md border border-border bg-bg-primary px-3 py-2 text-sm resize-none"
                  />
                  <button
                    onClick={send}
                    disabled={sending || !body.trim()}
                    className="flex items-center gap-1 rounded-md bg-accent text-white px-4 py-2 text-sm disabled:opacity-50"
                  >
                    <Send size={14} />
                    ارسال
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
