# AGENTS.md — کارگاه (KarGah)

پلتفرم تمرین و پرورش نویسندگی خلاق برای فارسی‌زبان‌ها. Monorepo با pnpm workspaces:

| مسیر | سرویس | پورت |
|---|---|---|
| `apps/api` | NestJS 10 + Prisma + PostgreSQL | 12588 |
| `apps/web` | Next.js 14 (App Router) + Tailwind + PWA، RTL | 12587 |
| `apps/nlp` | FastAPI — پردازش زبان فارسی | 12589 |
| `packages/shared-types`، `packages/shared-config` | پکیج‌های مشترک | — |

- مستندات کامل: `README.md`
- سند مادر (منبع حقیقت معماری و تصمیمات): `کل طرح.md` (بخش‌های A تا F)

## زبان سشن
- متن‌های کاربرمحور (توضیحات، پلن‌ها، گزارش‌ها، خطوط پیشرفت) به **فارسی**.
- کد و نام فایل‌ها انگلیسی می‌مانند.
- هر کار UI (صفحه، کامپوننت، فرم، نمودار) → ابتدا اسکیل `vibefarsi` (RTL، اعداد فارسی، تقویم جلالی).

## کارهای بزرگ — اجرا اتوماتیک با ورک‌فلو و ساب‌ایجنت‌ها (قانون همیشگی)

هرگاه درخواستی جزو «کار بزرگ» باشد (تعریف پایین)، **مستقیم کد را شروع نکن** — پلای‌لاین را اجرا کن:

1. اسکیل **`auto-big-jobs`** را فراخوانی کن. تصمیم می‌گیرد: ورک‌فلو یا ایجنت واحد، واحد کار چیست، توپولوژی کدام (A: fan-out/fan-in، B: pipeline، C: حلقه‌ی gate، D: planner/executor).
2. اگر ورک‌فلو شد → اسکیل **`dynamic-workflows`** را بارگذاری کن و طبق نگاشت همان اجرا کن (ساب‌ایجنت‌ها، worktree، gate، گزارش).
3. اگر در سشن ابزار ساب‌تسک/ساب‌ایجنت در دسترس نبود → fan-out را **سریع‌تر به‌جای هم** در سشن انجام بده با همان انضباط (واحد به واحد، مالکیت، gate، fresh eyes، گزارش) و در گزارش صریحاً بنویس.

### محرک‌ها (triggers)
- **صریح** (حتی کار کوچک، همیشه پلای‌لاین اجرا می‌شود): «کار بزرگ»، «کار سنگین»، «تمام»، «کامل»، «هر فایل/ماژول/صفحه»، «کل پروژه»، «خودکار انجامش بده»، «برگردان (و ادامه بده)»، «با ورک‌فلو»، «با ساب‌ایجنت‌ها»، «پارالل»، «پخشش کن»، «ارکسترات کن» (+ معادل‌های انگلیسی: "with a workflow", "with subagents", "fan this out", "run it in parallel", "orchestrate").
- **خودکار** (حداقل ۲ مورد برقرار باشد → ورک‌فلو): واحدهای قابل‌شمارش ≥ ۴؛ stageهای ≥ ۲ که به هم فید می‌کنند؛ جواب = نتایج به‌ازای هر آیتم + ترکیب پایانی؛ لحن کاربر محدوده‌ی بزرگ را نشان می‌دهد.
- **دودان** → یک سؤال با سه گزینه (با ورک‌فلو / با یک ایجنت / همین‌طور انجامش بده). برای کار خیلی کوچک (یک فایل، یک تابع، جست‌وجوی سریع) سؤال نپرس؛ انجامش بده.

### واحدهای تجزیه (نقشه‌ی پروژه)
- `apps/api` — ۲۱ ماژول NestJS: auth, users, exercises, sessions, history, integrity, gamification, news, projects, writings, community, mentorship, messages, notifications, blog, banks, events, admin, admin-approvals, admin-banks, admin-settings (+ زیرساخت prisma و queue)
- `apps/api/prisma/schema.prisma` — ۵۷ مدل
- `apps/web` — صفحات: exercises, practice, dashboard, banks, history, projects, writings, community, mentorship, messages, notifications, admin/*؛ + ۱۴ نقطه‌ی مصرف‌کنندۀ تقویم جلالی (طبق README)
- `apps/nlp` — ۹ اندپوینت (vocabulary-stats, similarity, extract-adjectives-adverbs, normalize, tokenize, pos-tag, validate-sentence, lipogram-check)
- بخش‌های `کل طرح.md` — واحد کار برای پلن/پیاده‌سازی فازها

**مالکیت:** هر worker موازی فقط فایل‌هایی را مالک است که worker دیگر دست نمی‌زند. فایل‌های مشترک (`schema.prisma`، `package.json`، `packages/shared-*`، `app.module.ts`) متعلق به **مرحله‌ی ادغام** (سشن اصلی)‌اند، نه workerها.

### Gate (بررسی قطعی) — فقط توسط سشن اصلی، نه ساب‌ایجنت
| Gate | دستور |
|---|---|
| تست واحد (Jest) | `pnpm --filter api test` |
| بیلد api + typecheck | `pnpm --filter api build` |
| بیلد web + typecheck | `pnpm --filter web build` |
| سینتکس nlp | `python -m py_compile apps/nlp/app/main.py` |
| e2e (نیاز به DB) | `pnpm --filter api test:e2e` — پیش‌تر `docker compose up -d postgres` |

- **از `pnpm test` ریشه استفاده نکن** — پکیج `web` اسکریپت `test` ندارد و شکست می‌خورد.
- ترتیب معادل CI: `pnpm install --frozen-lockfile` → `pnpm --filter api exec prisma generate` → تست واحد → بیلد api → بیلد web → py_compile nlp.
- gate قرمز → `stderr` را به دور بعدی ببر. **round cap = حداکثر ۳** روی همه‌ی loopها.

### انضباط (خلاصه؛ جزئیات در اسکیل‌ها)
- کار تغییردهنده: ابتدا baseline commit، کار در **git worktree** (طبق `dynamic-workflows`)، merge از روی checkout اصلی فقط پس از سبز شدن تست‌ها.
- **Fresh eyes:** هر پلن/پیش‌نویس/یافته‌ای که کاربر بر اساس آن عمل می‌کند، از یک ساب‌ایجنت مستقل که فقط draft را دیده رد شود. بپرس «چه چیزی این را می‌شکند؟» نه «تأیید می‌کنی؟».
- **گزارش:** به‌محض فرود هر واحد، یک خط پیشرفت به کاربر. گزارش پایانی `WORKFLOW-REPORT.md` با دو بخش اجباری: `verified:` (دستورهای دقیقاً اجراشده که نتیجه را تصمیم گرفتند) و `notCovered:` (چه چیزی دیده نشد و چرا).
- poll نکن (نوتیفیکیشن اتمام خود می‌آید). مدل ساب‌ایجنت = مدل سشن؛ بدون درخواست کاربر عوض نکن.
- کار کوچک → ورک‌فلو نیست، مراسم نباشد: یک ایجنت یا همان‌جا انجام بده.
