'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';
import { useCalendar } from '@/lib/calendar/calendar-provider';

interface AnomalyRow {
  id: string;
  userId: string;
  anomalyType: string;
  severity: string;
  evidenceJson: Record<string, unknown>;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: string;
  user: { id: string; email: string; displayName: string };
}

interface AnomaliesResponse {
  anomalies: AnomalyRow[];
  total: number;
  page: number;
  limit: number;
}

const TYPE_LABELS: Record<string, string> = {
  PASTE_ABUSE: 'کپی-پیست زیاد',
  TYPING_SPEED: 'سرعت تایپ غیرعادی',
  VOCABULARY_LOW: 'دایره واژگان پایین',
  LANGUAGE_MISMATCH: 'ناهماهنگی زبان',
  SIMILARITY_BANK: 'شباهت با بانک محتوا',
  SELF_REPEAT: 'تکرار از خود',
  SUSPICIOUS_TIME: 'زمان مشکوک',
  VOTE_MANIPULATION: 'دستکاری رأی',
  VOLUME_SPIKE: 'شکاف حجمی',
};

const SEVERITY_STYLES: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

const SEVERITY_LABELS: Record<string, string> = {
  LOW: 'کم',
  MEDIUM: 'متوسط',
  HIGH: 'زیاد',
  CRITICAL: 'بحرانی',
};

export default function AdminAnomaliesPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { formatDate } = useCalendar();
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState('');
  const [resolved, setResolved] = useState('');
  const [anomalyType, setAnomalyType] = useState('');
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-anomalies', page, severity, resolved, anomalyType],
    queryFn: () =>
      api.get<AnomaliesResponse>(
        `/admin/anomalies?page=${page}&limit=${limit}${severity ? `&severity=${severity}` : ''}${resolved ? `&resolved=${resolved}` : ''}${anomalyType ? `&anomalyType=${anomalyType}` : ''}`,
      ),
    enabled: user?.role === 'ADMIN',
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/anomalies/${id}/resolve`, { note: resolveNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-anomalies'] });
      setResolveTarget(null);
      setResolveNote('');
    },
  });

  if (user?.role !== 'ADMIN') {
    return (
      <AppShell>
        <p className="text-center text-text-secondary">دسترسی مجاز نیست</p>
      </AppShell>
    );
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5" />
          <h1 className="text-lg font-bold">علائم ناهنجاری</h1>
          {data && (
            <span className="text-xs text-text-secondary">
              {toPersianDigits(data.total)} مورد
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
            className="rounded-card border border-border bg-bg-secondary py-2 px-3 text-sm"
          >
            <option value="">همه شدت‌ها</option>
            {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={resolved}
            onChange={(e) => { setResolved(e.target.value); setPage(1); }}
            className="rounded-card border border-border bg-bg-secondary py-2 px-3 text-sm"
          >
            <option value="">همه</option>
            <option value="false">باز</option>
            <option value="true">حل‌شده</option>
          </select>
          <select
            value={anomalyType}
            onChange={(e) => { setAnomalyType(e.target.value); setPage(1); }}
            className="rounded-card border border-border bg-bg-secondary py-2 px-3 text-sm"
          >
            <option value="">همه انواع</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-text-secondary">در حال بارگذاری…</p>
        ) : (
          <div className="space-y-3">
            {data?.anomalies.map((a) => (
              <div
                key={a.id}
                className={`rounded-card border p-4 ${
                  a.resolvedAt ? 'border-border/50 bg-bg-secondary/50' : 'border-border bg-bg-secondary'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[a.severity] ?? ''}`}>
                      {SEVERITY_LABELS[a.severity] ?? a.severity}
                    </span>
                    <span className="text-sm font-bold">
                      {TYPE_LABELS[a.anomalyType] ?? a.anomalyType}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {a.user.displayName} ({a.user.email})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.resolvedAt ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        حل‌شده
                      </span>
                    ) : (
                      <button
                        onClick={() => setResolveTarget(resolveTarget === a.id ? null : a.id)}
                        className="rounded-card border border-border px-2 py-1 text-xs hover:bg-bg-tertiary"
                      >
                        حل کردن
                      </button>
                    )}
                  </div>
                </div>

                {/* Evidence */}
                <div className="mt-2 rounded bg-bg-tertiary p-2 text-xs text-text-secondary" dir="ltr">
                  <pre className="whitespace-pre-wrap font-mono text-xs">
                    {JSON.stringify(a.evidenceJson, null, 2)}
                  </pre>
                </div>

                {/* Resolution note */}
                {a.resolvedAt && a.resolutionNote && (
                  <p className="mt-2 text-xs text-text-secondary">
                    یادداشت: {a.resolutionNote}
                  </p>
                )}

                {/* Resolve form */}
                {resolveTarget === a.id && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="یادداشت حل…"
                      value={resolveNote}
                      onChange={(e) => setResolveNote(e.target.value)}
                      className="flex-1 rounded-card border border-border bg-bg-secondary px-3 py-1.5 text-sm"
                    />
                    <button
                      onClick={() => resolveMutation.mutate(a.id)}
                      disabled={resolveMutation.isPending}
                      className="rounded-card bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                    >
                      {resolveMutation.isPending ? '…' : 'تأیید'}
                    </button>
                    <button
                      onClick={() => { setResolveTarget(null); setResolveNote(''); }}
                      className="rounded-card border border-border px-3 py-1.5 text-sm"
                    >
                      انصراف
                    </button>
                  </div>
                )}

                <p className="mt-2 text-xs text-text-secondary">
                  {formatDate(a.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-card border border-border px-3 py-1.5 text-sm disabled:opacity-40"
            >
              قبلی
            </button>
            <span className="text-sm text-text-secondary">
              صفحه {toPersianDigits(page)} از {toPersianDigits(totalPages)}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-card border border-border px-3 py-1.5 text-sm disabled:opacity-40"
            >
              بعدی
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
