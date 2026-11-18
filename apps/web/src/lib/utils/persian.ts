import { format } from 'date-fns-jalali';

// Spec F.8 — Persian calendar helpers.

/**
 * The three calendar systems the user can pick in Settings → روز/تقویم.
 * DECISION: `persian` (Jalali / شمسی) is the system default, per spec — every
 * date on the site renders Jalali unless the user opts into another system.
 *
 *   - persian   → Jalali, via date-fns-jalali (e.g. ۱۴۰۵/۸/۱۳)
 *   - qamari    → Qamari/Hijri lunar, via Intl (`fa-u-ca-islamic-civil`)
 *   - gregorian → Gregorian/میلادی, via Intl (`en-GB`)
 */
export type CalendarFormat = 'persian' | 'qamari' | 'gregorian';

export const CALENDAR_FORMATS: CalendarFormat[] = ['persian', 'qamari', 'gregorian'];

export const CALENDAR_LABELS: Record<CalendarFormat, string> = {
  persian: 'شمسی (جلالی)',
  qamari: 'قمری (هجری قمری)',
  gregorian: 'میلادی',
};

export const DEFAULT_CALENDAR: CalendarFormat = 'persian';

/** Convert Latin digits in a string or number to Persian digits. */
export function toPersianDigits(input: string | number): string {
  const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(input).replace(/[0-9]/g, (d) => faDigits[Number(d)]);
}

/**
 * Format a date in the selected calendar, always with Persian digits.
 *
 * DECISION: this is THE single date-display helper. Every UI date goes through
 * it so the calendar preference is honored everywhere. `withTime` appends a
 * `HH:mm` clock time (the clock stays 24h Latin-locale-independent).
 */
export function formatDate(
  date: Date | string,
  cal: CalendarFormat = DEFAULT_CALENDAR,
  withTime = false,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';

  let out: string;
  if (cal === 'qamari') {
    // Intl gives Persian digits for free under the `fa` locale.
    out = d.toLocaleDateString('fa-u-ca-islamic-civil', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } else if (cal === 'gregorian') {
    // en-GB → "2026-11-04"; we Persian-digit it below so the UI stays uniform.
    out = d.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } else {
    // persian (Jalali) — date-fns-jalali outputs Latin digits; convert.
    out = format(d, withTime ? 'yyyy/MM/dd HH:mm' : 'yyyy/MM/dd');
  }
  out = toPersianDigits(out);

  if (withTime && cal !== 'persian') {
    const time = d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    out = `${out} ${toPersianDigits(time)}`;
  }
  return out;
}

/** نقش‌های کاربری به فارسی روان و رسمی */
export const ROLE_LABELS: Record<string, string> = {
  NOVICE: 'نوآموز',
  CRAFTSPERSON: 'کاربلد',
  CREATIVE: 'خلاق',
  PROFESSIONAL: 'حرفه‌ای',
  MENTOR: 'مربی',
  EDITOR: 'ویراستار',
  ADMIN: 'مدیر ارشد',
};

/** دسته‌بندی‌های تمرین به فارسی روان */
export const CATEGORY_LABELS: Record<string, string> = {
  BASIC: 'پایه‌ای',
  STRUCTURE: 'ساختار و پیرنگ',
  STYLE: 'سبک‌شناسی و لحن',
  ADVANCED: 'پیشرفته',
  IDEA: 'ایده‌پردازی و جرقه',
  CONSTRAINT: 'محدودیت و چالش',
  HABIT: 'عادت‌سازی و پیوستگی',
  SCENE: 'صحنه‌پردازی و فضا',
};

/** وضعیت‌های جلسات تمرین به فارسی */
export const SESSION_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'در حال نوشتن',
  SUBMITTED: 'ارسال و تکمیل‌شده',
  COMPLETED: 'تکمیل‌شده',
  ABANDONED: 'رهاشده',
  SUSPENDED: 'معلق',
};

/** ترجمه امن نقش کاربری */
export function translateRole(role?: string | null): string {
  if (!role) return '';
  return ROLE_LABELS[role] ?? role;
}

/** ترجمه امن دسته‌بندی تمرین */
export function translateCategory(cat?: string | null): string {
  if (!cat) return '';
  return CATEGORY_LABELS[cat] ?? cat;
}

/** ترجمه امن وضعیت جلسه */
export function translateSessionStatus(status?: string | null): string {
  if (!status) return '';
  return SESSION_STATUS_LABELS[status] ?? status;
}

/** نام مهارت‌ها به فارسی روان */
export const SKILL_LABELS: Record<string, string> = {
  fluidity: 'روانی قلم',
  voice: 'صدای نویسنده',
  description: 'تصویرسازی و توصیف',
  imagery: 'تصویر ذهنی',
  opening: 'آغاز و سرآغاز',
  flow: 'جریان متن',
  character: 'شخصیت‌پردازی',
  plot: 'پیرنگ و داستان',
  brevity: 'ایجاز و اختصار',
  style: 'سبک نگارش',
  imitation: 'محاکات و الگوبرداری',
  economy: 'اقتصاد کلام',
  show: 'نشان دادن به جای گفتن',
  dialogue: 'دیالوگ‌نویسی',
  subtext: 'زیرمتن و لایه‌های پنهان',
  structure: 'ساختار روایت',
  editing: 'ویرایش و بازنویسی',
  habit: 'پیوستگی و عادت',
  ideation: 'ایده‌پردازی',
  pacing: 'ریتم و آهنگ',
  atmosphere: 'فضا و اتمسفر',
  tension: 'کشش و تنش',
  surprise: 'غافلگیری',
  symbolism: 'نمادپردازی',
  emotion: 'بار حسی و عاطفی',
  observation: 'دقت در مشاهده',
  craft: 'صنعتگری کلمات',
  creativity: 'خلاقیت بیانی',
  language: 'توانمندی زبانی',
  vocabulary: 'غنای واژگان',
  precision: 'دقت تعابیر',
  scene: 'صحنه‌پردازی',
  planning: 'طرح‌ریزی',
  revision: 'بازبینی',
  metacognition: 'خودآگاهی نویسنده',
  curiosity: 'کنجکاوی',
  courage: 'شجاعت در نوشتن',
  focus: 'تمرکز',
  logic: 'منطق روایی',
  comparison: 'تشبیه و مقایسه',
  analysis: 'تحلیل',
  discovery: 'کشف شهودی',
  play: 'بازی با کلمات',
  adaptation: 'اقتباس',
  adaptability: 'انعطاف‌پذیری',
  collaboration: 'همکاری',
  consistency: 'هماهنگی و یکدستی',
  constraint: 'رعایت قیدها',
  growth: 'رشد و تعمیق',
  immediacy: 'حضور و ملموس بودن',
  immersion: 'غوطه‌وری مخاطب',
  irony: 'طنز و کنایه',
  productivity: 'بازده و تداوم',
  subversion: 'ساختارشکنی',
};

/** ترجمه امن مهارت‌ها */
export function translateSkill(skill?: string | null): string {
  if (!skill) return '';
  return SKILL_LABELS[skill.toLowerCase()] ?? skill;
}

/** ترجمه معیارهای ارزیابی */
export const RUBRIC_LABELS: Record<string, string> = {
  dialogue: 'گفت‌وگونویسی و دیالوگ',
  character: 'پرداخت شخصیت',
  conflict: 'کشمکش و تصادم',
  pacing: 'ریتم متن',
  sensory: 'جزئیات حسی',
  brevity: 'ایجاز و پرهیز از زوائد',
  style: 'لحن و سبک',
  structure: 'چیدمان و ساختار',
  originality: 'نوآوری و اصالت',
  lead: 'تیتر و لید',
  facts: 'امانت‌داری در واقعیت‌ها',
};

export function translateRubricKey(key?: string | null): string {
  if (!key) return '';
  return RUBRIC_LABELS[key.toLowerCase()] ?? key;
}



