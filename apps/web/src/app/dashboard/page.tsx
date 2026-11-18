'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { TodayCard } from '@/components/dashboard/TodayCard';
import { XPBar } from '@/components/dashboard/XPBar';
import { StreakWidget } from '@/components/dashboard/StreakWidget';
import { BadgeShelf } from '@/components/dashboard/BadgeShelf';
import { RecentWritings } from '@/components/dashboard/RecentWritings';
import { MissionsList } from '@/components/dashboard/MissionsList';
import { SkillRadar } from '@/components/dashboard/SkillRadar';
import { SeriesList } from '@/components/dashboard/SeriesList';
import { StaircaseLadder } from '@/components/dashboard/StaircaseLadder';
import { UnfinishedSessions } from '@/components/dashboard/UnfinishedSessions';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';
import type { User, BadgeItem, Session } from '@/lib/types';

// DECISION: this dashboard derives its stats client-side:
//   - level / displayName / role / xpTotal / currentStreak / bestStreak ← GET /users/me
//   - sessionsToday / wordsToday / minutesToday ← GET /sessions (filter by today)
//   - badges                      ← GET /gamification/badges
// MissionsList (spec I.10) queries GET /gamification/quests/today and
// SkillRadar (spec F.5, CRAFTSPERSON+) queries GET /gamification/skills —
// both endpoints exist in the API (quests module).
//
// DECISION: SkillRadar is gated on me.role ∈ {CRAFTSPERSON, MENTOR, ADMIN}
// (spec line 2385); when the gate fails MissionsList renders full-width.

// DECISION: replicate the API's levelFromXp (spec E.5) on the client so the
// XP bar can show progress toward the next level without an extra endpoint.
//
// API formula: level = floor((-80 + sqrt(6400 + 80*(100+xp))) / 40) + 1, xp≥100
// Inverse (total XP needed to first reach level n, n ≥ 2):
//   xp = 20(n-1)² + 80(n-1) − 100
// Verified against the closed form: xp=100→level 2, xp=280→level 3, xp=560→level 4.
function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return 20 * n * n + 80 * n - 100;
}

// DECISION: standalone interface (not `extends Session`) because the API's
// session shape differs from the base Session (startedAt vs createdAt,
// submission nested object, exercise as { titleFa } only).
interface SessionWithSubmission {
  id: string;
  status: string;
  startedAt: string;
  wordCount: number | null;
  activeTimeSeconds: number | null;
  exercise?: { title?: string; titleFa?: string } | null;
  exerciseType?: { id?: string; title?: string; slug?: string; category?: string } | null;
  submission?: { wordCount: number; durationSeconds: number; submittedAt: string } | null;
}

interface MeResponse extends User {
  settingsJson?: Record<string, unknown>;
  updatedAt?: string;
}

export default function DashboardPage() {
  const token = useAuthStore((s) => s.token);

  const { data: me } = useQuery({
    queryKey: ['me'],
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await api.get<MeResponse>('/users/me');
      return res;
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions'],
    enabled: Boolean(token),
    staleTime: 60 * 1000,
    queryFn: () => api.get<SessionWithSubmission[]>('/sessions'),
  });

  const { data: badges = [] } = useQuery({
    queryKey: ['badges'],
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<BadgeItem[]>('/gamification/badges'),
  });

  // Derive today's stats client-side.
  const todayStr = new Date().toDateString();
  const todaySessions = sessions.filter(
    (s) => s.status === 'COMPLETED' && new Date(s.startedAt).toDateString() === todayStr,
  );
  const wordsToday = todaySessions.reduce(
    (sum, s) => sum + (s.submission?.wordCount ?? s.wordCount ?? 0),
    0,
  );
  const minutesToday = Math.round(
    todaySessions.reduce((sum, s) => sum + (s.submission?.durationSeconds ?? s.activeTimeSeconds ?? 0), 0) / 60,
  );

  // Recent writings: last 5 COMPLETED sessions.
  const recentWritings = sessions
    .filter((s) => s.status === 'COMPLETED')
    .slice(0, 5);

  // Unfinished & abandoned sessions for resume
  const unfinishedSessions = sessions.filter(
    (s) => s.status === 'IN_PROGRESS' || s.status === 'ABANDONED' || s.status === 'SUSPENDED',
  );

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">
            سلام{me ? `، ${me.displayName}` : ''} 👋
          </h1>
          <Link
            href="/dashboard/new"
            className="flex items-center gap-1.5 bg-accent text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus size={16} />
            جلسه جدید
          </Link>
        </div>

        {/* Unfinished / Abandoned sessions banner */}
        <UnfinishedSessions sessions={unfinishedSessions} />

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TodayCard
            sessionsToday={todaySessions.length}
            wordsToday={wordsToday}
            minutesToday={minutesToday}
          />
          <StreakWidget
            currentStreak={me?.currentStreak ?? 0}
            bestStreak={me?.bestStreak ?? 0}
          />
          <div className="bg-bg-secondary border border-border rounded-card p-4 flex flex-col justify-center">
            <p className="text-sm text-text-secondary mb-1">مجموع جلسات</p>
            <p className="text-2xl font-bold">
              {toPersianDigits(String(sessions.filter((s) => s.status === 'COMPLETED').length))}
            </p>
          </div>
        </div>

        {/* XP bar */}
        {me && (
          <XPBar
            level={me.level}
            xpCurrent={(me.xpTotal ?? 0) - xpForLevel(me.level)}
            xpTarget={xpForLevel(me.level + 1) - xpForLevel(me.level)}
          />
        )}

        {/* Missions + Skills */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MissionsList />
          {(me?.role === 'CRAFTSPERSON' ||
            me?.role === 'MENTOR' ||
            me?.role === 'ADMIN') && (
            <SkillRadar />
          )}
        </div>

        {/* Series + Staircase */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SeriesList />
          <StaircaseLadder />
        </div>

        {/* Badges + Recent */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BadgeShelf badges={badges} />
          <RecentWritings sessions={recentWritings} />
        </div>
      </div>
    </AppShell>
  );
}
