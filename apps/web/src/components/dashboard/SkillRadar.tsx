'use client';

import { useQuery } from '@tanstack/react-query';
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api/client';
import { toPersianDigits } from '@/lib/utils/persian';

/**
 * Spec F.5 (line 2385) — skill radar (CRAFTSPERSON+ only).
 *
 * GET /gamification/skills returns every skill row (xpTotal desc); the card
 * keeps the top 6 with xp > 0 and draws a recharts radar over them.
 *
 * DECISION: skillKey → Persian labels come from a local map (the API is
 * key-only by design). Unknown keys fall back to the raw key so a new
 * skill never breaks the chart.
 */
export interface SkillSummary {
  skillKey: string;
  xpTotal: number;
  level: number;
  sessionsCount: number;
}

const SKILL_LABELS_FA: Record<string, string> = {
  fluidity: 'روانی',
  voice: 'صدا',
  description: 'تصویرسازی',
  imagery: 'تصویر ذهنی',
  opening: 'آغاز',
  flow: 'جریان',
  character: 'شخصیت‌پردازی',
  plot: 'داستان',
  brevity: 'سراپا',
  style: 'سبک',
  imitation: 'محاکات',
  economy: 'اقتصاد کلام',
  show: 'نشان دادن',
  dialogue: 'دیالوگ',
  subtext: 'زیرمتن',
  structure: 'ساختار',
  editing: 'ویرایش',
  habit: 'عادت',
  ideation: 'ایده‌پردازی',
  pacing: 'ریتم',
  atmosphere: 'جو',
  tension: 'تنش',
  surprise: 'غافلگیری',
  symbolism: 'نماد',
  emotion: 'احساس',
  observation: 'مشاهده',
  craft: 'حِرفه‌ای‌گری',
  creativity: 'خلاقیت',
  language: 'زبان',
  vocabulary: 'واژگان',
  precision: 'دقت',
  scene: 'صحنه',
  planning: 'برنامه‌ریزی',
  revision: 'بازبینی',
  metacognition: 'خودآگاهی نوشتن',
  curiosity: 'کنجکاوی',
  courage: 'شجاعت',
  focus: 'تمرکز',
  logic: 'منطق',
  comparison: 'مقایسه',
  analysis: 'تحلیل',
  discovery: 'کشف',
  play: 'بازی',
  adaptation: 'تطبیق',
  adaptability: 'انعطاف',
  collaboration: 'همکاری',
  consistency: 'ثبات',
  constraint: 'قید و شرط',
  growth: 'رشد',
  immediacy: 'حضور',
  immersion: 'غوطه‌وری',
  irony: 'طنز',
  productivity: 'بازده',
  subversion: 'تلاطم',
};

function label(key: string): string {
  return SKILL_LABELS_FA[key] ?? key;
}

/** Spec F.5 — skill radar card. Empty state: «هنوز مهارت ثبت نشده». */
export function SkillRadar() {
  const { data: skills = [], isLoading } = useQuery({
    queryKey: ['skills'],
    staleTime: 60 * 1000,
    queryFn: () => api.get<SkillSummary[]>('/gamification/skills'),
  });

  // DECISION: top 6 with xp > 0 (client filters — the endpoint returns all).
  const top = skills.filter((s) => s.xpTotal > 0).slice(0, 6);
  // Radar shape: each axis value normalized to 0–10 against the max,
  // so the polygon is comparable across users.
  const max = top.length ? Math.max(...top.map((s) => s.xpTotal)) : 1;
  const data = top.map((s) => ({
    subject: label(s.skillKey),
    value: Math.round((s.xpTotal / max) * 10),
    xp: s.xpTotal,
  }));

  return (
    <div className="bg-bg-secondary border border-border rounded-card p-4">
      <h2 className="text-sm font-bold mb-3">رادار مهارت</h2>

      {isLoading ? (
        <p className="text-sm text-text-secondary">در حال بارگذاری…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-text-secondary">هنوز مهارت ثبت نشده.</p>
      ) : (
        <div dir="ltr" className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="70%">
              <PolarGrid stroke="var(--color-border)" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
              />
              <Radar
                dataKey="value"
                stroke="var(--color-accent)"
                fill="var(--color-accent)"
                fillOpacity={0.35}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!isLoading && data.length > 0 && (
        <p className="text-xs text-text-secondary mt-2">
          قوی‌ترین مهارت: {label(top[0].skillKey)} (
          {toPersianDigits(String(top[0].xpTotal))} امتیاز)
        </p>
      )}
    </div>
  );
}
