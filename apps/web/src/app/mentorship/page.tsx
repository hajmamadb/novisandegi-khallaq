'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  GraduationCap,
  Check,
  X,
  Send,
  RefreshCw,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api, ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';
import { useCalendar } from '@/lib/calendar/calendar-provider';

interface MentorshipRequest {
  id: string;
  message: string;
  status: string;
  acceptedAt: string | null;
  createdAt: string;
  student: { id: string; displayName: string; email: string };
  mentor: { id: string; displayName: string; email: string };
}

interface Mentor {
  id: string;
  displayName: string;
  role: string;
  level: number;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'در انتظار',
  ACCEPTED: 'پذیرفته‌شده',
  DECLINED: 'ردشده',
};

/**
 * `/mentorship` — two directions:
 *  - as student: browse mentors (GET /mentorship/mentors), send a request
 *    (POST /mentorship/requests), see outgoing requests (?direction=out).
 *  - as mentor: incoming requests (?direction=in) with accept/decline.
 * DECISION: one page, tabbed by direction; accept/decline buttons render
 * only when the current user is the mentor of the request (the API enforces
 * it anyway).
 */
export default function MentorshipPage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { formatDate } = useCalendar();

  const [tab, setTab] = useState<'in' | 'out' | 'mentors'>(
    user?.role === 'MENTOR' || user?.role === 'EDITOR' || user?.role === 'PROFESSIONAL'
      ? 'in'
      : 'mentors',
  );

  const inQuery = useQuery({
    queryKey: ['mentorship', 'in'],
    enabled: Boolean(token) && tab === 'in',
    staleTime: 30 * 1000,
    queryFn: () =>
      api.get<MentorshipRequest[]>('/mentorship/requests?direction=in'),
  });

  const outQuery = useQuery({
    queryKey: ['mentorship', 'out'],
    enabled: Boolean(token) && tab === 'out',
    staleTime: 30 * 1000,
    queryFn: () =>
      api.get<MentorshipRequest[]>('/mentorship/requests?direction=out'),
  });

  const mentorsQuery = useQuery({
    queryKey: ['mentorship', 'mentors'],
    enabled: Boolean(token) && tab === 'mentors',
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Mentor[]>('/mentorship/mentors'),
  });

  const [mentorId, setMentorId] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['mentorship'] });
  };

  const sendRequest = async () => {
    if (!mentorId || !message.trim()) return;
    setSending(true);
    try {
      await api.post('/mentorship/requests', {
        mentorId,
        message: message.trim(),
      });
      setMentorId('');
      setMessage('');
      setTab('out');
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        alert('درخواست نامعتبر است (مثلاً درخواست به خودت)');
      } else {
        alert('خطا در ارسال درخواست');
      }
    } finally {
      setSending(false);
    }
  };

  const decide = async (id: string, action: 'accept' | 'decline') => {
    try {
      await api.post(`/mentorship/requests/${id}/${action}`, {});
      refresh();
    } catch {
      alert('خطا در تصمیم‌گیری درخواست');
    }
  };

  const fmt = (iso: string) => formatDate(iso);

  const isMentorRole =
    user?.role === 'MENTOR' || user?.role === 'EDITOR';

  const renderRequest = (r: MentorshipRequest, direction: 'in' | 'out') => {
    // direction 'in': I am the mentor → show student, accept/decline.
    // direction 'out': I am the student → show mentor, status only.
    const other = direction === 'in' ? r.student : r.mentor;
    const iAmMentor = direction === 'in' && user && r.mentor.id === user.id;
    return (
      <li
        key={r.id}
        className="rounded-md border border-border bg-bg-primary p-3 space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{other.displayName}</span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full border ${
              r.status === 'PENDING'
                ? 'border-amber-400/40 text-amber-400'
                : r.status === 'ACCEPTED'
                  ? 'border-emerald-400/40 text-emerald-400'
                  : 'border-red-400/40 text-red-400'
            }`}
          >
            {STATUS_LABELS[r.status] ?? r.status}
          </span>
        </div>
        <p className="text-xs text-text-secondary" dir="rtl">
          {r.message}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-secondary">
            {fmt(r.createdAt)}
            {r.acceptedAt && ` · پذیرفته: ${fmt(r.acceptedAt)}`}
          </span>
          {iAmMentor && r.status === 'PENDING' && (
            <div className="flex gap-2">
              <button
                onClick={() => decide(r.id, 'accept')}
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
              >
                <Check size={12} />
                پذیرش
              </button>
              <button
                onClick={() => decide(r.id, 'decline')}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
              >
                <X size={12} />
                رد
              </button>
            </div>
          )}
        </div>
      </li>
    );
  };

  const list = tab === 'in' ? inQuery : outQuery;

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">منتورشیپ</h1>
          <p className="text-sm text-text-secondary">
            {isMentorRole
              ? 'درخواست‌های دانش‌آموزان و فهرست منتورها.'
              : 'منتور انتخاب کن و درخواست همکاری بده.'}
          </p>
        </div>

        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setTab('mentors')}
            className={`px-3 py-1 rounded-full border ${
              tab === 'mentors'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-text-secondary'
            }`}
          >
            فهرست منتورها
          </button>
          <button
            onClick={() => setTab('out')}
            className={`px-3 py-1 rounded-full border ${
              tab === 'out'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-text-secondary'
            }`}
          >
            درخواست‌های من
          </button>
          {isMentorRole && (
            <button
              onClick={() => setTab('in')}
              className={`px-3 py-1 rounded-full border ${
                tab === 'in'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-text-secondary'
              }`}
            >
              دریافتی‌ها
            </button>
          )}
        </div>

        {/* ── Mentors + request form ── */}
        {tab === 'mentors' && (
          <div className="space-y-3">
            <div className="rounded-card border border-border bg-bg-secondary p-4 space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <GraduationCap size={14} />
                منتورهای در دسترس
              </h2>
              {mentorsQuery.isLoading ? (
                <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
              ) : (mentorsQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-text-secondary">
                  منتوری در دسترس نیست
                </p>
              ) : (
                <ul className="space-y-2">
                  {(mentorsQuery.data ?? []).map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between rounded-md border border-border bg-bg-primary p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{m.displayName}</p>
                        <p className="text-[11px] text-text-secondary">
                          سطح {toPersianDigits(String(m.level))} · {m.role}
                        </p>
                      </div>
                      <button
                        onClick={() => setMentorId(m.id)}
                        className={`text-xs px-3 py-1.5 rounded-md border ${
                          mentorId === m.id
                            ? 'border-accent text-accent'
                            : 'border-border text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {mentorId === m.id ? 'انتخاب‌شده' : 'درخواست'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {mentorId && (
              <div className="rounded-card border border-border bg-bg-secondary p-4 space-y-2">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="پیام به منتور: چرا از او منتورشیپ می‌خواهی؟"
                  className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
                />
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setMentorId('')}
                    className="text-xs text-text-secondary hover:text-text-primary"
                  >
                    انصراف
                  </button>
                  <button
                    onClick={sendRequest}
                    disabled={sending || !message.trim()}
                    className="flex items-center gap-1 rounded-md bg-accent text-white px-4 py-2 text-sm disabled:opacity-50"
                  >
                    <Send size={12} />
                    {sending ? 'در حال ارسال…' : 'ارسال درخواست'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Requests (in / out) ── */}
        {tab !== 'mentors' && (
          <div className="space-y-2">
            {list.isLoading ? (
              <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
            ) : (list.data ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary">درخواستی نیست</p>
            ) : (
              <ul className="space-y-2">
                {(list.data ?? []).map((r) =>
                  renderRequest(r, tab as 'in' | 'out'),
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
