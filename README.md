# کارگاه (KarGah) — پلتفرم تمرین و پرورش نویسندگی خلاق

کارگاه یک سامانه‌ی تمرینِ روزمره برای نویسندگان فارسی‌زبان است: بانک تمرین‌های متنوع (۳۱ ماژول تمرین)، پایش اصالت‌نویسی (Integrity)، گیمیفیکیشن (XP، استریک، نشان، کвест و چالش)، بانک‌های محتوا (شخصیت، مکان، جملۀ آغازین، واژه، خبر، …) و پروژه‌نویسی چند فصلی — همه با تمرکز بر زبان فارسی و تقویم جلالی.

## ساختار پروژه

پروژه به‌صورت **monorepo** با pnpm workspaces است:

```
├── apps/
│   ├── api/        # NestJS 10 + Prisma + PostgreSQL  (port 12588)
│   ├── web/        # Next.js 14 (App Router) + Tailwind + PWA  (port 12587)
│   └── nlp/        # FastAPI — سرویس پردازش زبان فارسی  (port 12589)
├── packages/
│   ├── shared-types/     # تایپ‌های مشترک بین api و web
│   └── shared-config/    # کانفیگ مشترک
├── nginx/kargah.conf     # کانفیگ nginx برای reverse proxy
├── docker-compose.yml    # postgres + api + web + nlp
├── .github/workflows/    # CI (تست/تایپ‌چک/بیلد) و CI/CD (تصویر + دیپلوی)
├── کل طرح.md             # سند مادر پروژه (معماری و تصمیمات)
└── package.json          # اسکریپت‌های سطح monorepo
```

### apps/api — NestJS

- ۲۰ ماژول: `auth`, `users`, `exercises`, `sessions`, `history`, `integrity`, `gamification`, `news`, `projects`, `writings`, `community`, `mentorship`, `messages`, `notifications`, `blog`, `banks`, `events`, `admin`, `admin-approvals`, `admin-banks`, `admin-settings`
- Prisma با ۵۹ مدل (کاربر، جلسه‌ی تمرین، ارسال، لاگ رویداد، لیدجر XP، نشان، کوست، چالش، کیف جوهر، بررسی اصالت، پست بلاگ، پروژه/فصل، نویسندگی، منتورشیپ، پیام، …)
- آمارسنجی/حافظه‌ی کاربر: `XPLedger`, `UserStats`, `UserSkill`, `StreakDay`
- اصالت‌نویسی (Integrity): تشخیص پاست، سرعت تایپ غیرانسانی، هم‌پوشانی واژگان، self-similarity و bank-similarity با آستانه‌های پیکرباز
- لاگ رویداد با هش IP/UA (AsyncLocalStorage request-context) و `beforeJson/afterJson` در AuditLog
- تست: ۲۲۵ تست واحد/e2e (Jest)

### apps/web — Next.js 14

- App Router، RTL، Tailwind، React Query، TipTap (ویرایشگر)
- PWA با `@ducanh2912/next-pwa` (offline queue با `idb`)
- تقویم مرکزی جلالی (فرض: جلالی، انتخابی: قمری/میلادی) — ۱۴ نقطه مصرف‌کننده
- صفحات: `exercises` (کارت‌ها با دکمه‌ی «انجام می‌دهم»)، `practice` (با خوشه‌ای + Force-Directed cluster)، `dashboard` (Missions + SkillRadar)، `banks`, `history`, `projects`, `writings`, `community`, `mentorship`, `messages`, `notifications`, `admin/*` (users, banks, badges, anomalies, logs)

### apps/nlp — FastAPI

۹ اندپوینت (علاوه بر `/health`):

| اندپوینت | کاربرد |
|---|---|
| `POST /vocabulary-stats` | آمار واژگان متن |
| `POST /similarity` | cosine شباهت دو متن (واژگان) |
| `POST /extract-adjectives-adverbs` | استخراج صفت/قالب‌های صفتی و قید |
| `POST /normalize` | نرمال‌سازی متن |
| `POST /tokenize` | تکه‌کنندگی فارسی |
| `POST /pos-tag` | برچسب‌گذاری POS (fallback سرتنج‌شناختی) |
| `POST /validate-sentence` | اعتبارسنجی جمله |
| `POST /lipogram-check` | بررسی لیپوگرام (واژه‌ی ممنوع) |

> **توجه:** `hazm`/`parsivar` در محیط توسعه نصب‌نشده‌اند؛ هر دو مسیر از fallback خالص Python (تکه‌کنندگی رنج U+0600–06FF + پرتکراری کلمه) استفاده می‌کنند. قرارداد JSON یکسان است و در صورت نصب hazm، کلاینت Nest بدون تغییر کار می‌کند.

## پشته‌ی تکنولوژی

| لایه | فناوری |
|---|---|
| بک‌اند | NestJS 10, TypeScript 5, Prisma 5.14, PostgreSQL 15, BullMQ (queues), JWT |
| فرانت | Next.js 14, React 18, Tailwind, React Query 5, TipTap, next-pwa |
| NLP | FastAPI, Pydantic 2, uvicorn |
| داده | PostgreSQL 15 (Prisma), پیکربندی با `.env` |
| زیرساخت | Docker (compose), nginx, GitHub Actions (CI + CI/CD) |

## نصب و راه‌اندازی

### پیش‌نیازها

- Node.js 20+
- pnpm 9 (`corepack enable`)
- Python 3.11+
- PostgreSQL 15 (محلی یا docker)

### راه‌اندازی سریع

```bash
# 1. کپی تنظیمات
cp .env.example .env          # مقادیر پیش‌فرض توسعه؛ برای تولید تغییر دهید

# 2. نصب وابستگی‌ها + مایگریشن + seed (در یک دستور)
pnpm setup
# معادل: pnpm install && pnpm --filter api prisma migrate dev && pnpm --filter api prisma db seed

# 3. راه‌اندازی هم‌زمان api + web + nlp
pnpm dev
# web  → http://localhost:12587
# api  → http://localhost:12588
# nlp  → http://localhost:12589
```

### اسکریپت‌های monorepo

| اسکریپت | توضیح |
|---|---|
| `pnpm dev` | api + web + nlp هم‌زمان (concurrently) |
| `pnpm dev:api` / `pnpm dev:web` / `pnpm dev:nlp` | هر سرویس به‌تنهایی |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:seed` | seed اولیه (idempotent) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:reset` | `prisma migrate reset --force` |
| `pnpm build` | بیلد api + web |
| `pnpm test` | تست api + web |

### راه‌اندازی با Docker

```bash
docker compose up -d --build
# postgres : 12590 (مقیض از 5432 داخلی)
# api      : 12588
# web      : 12587 (از طریق nginx)
# nlp      : 12589
```

### متغیرهای محیطی

تمام متغیرها در `.env.example` مستند شده‌اند. مهم‌ترین‌ها:

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `DATABASE_URL` | `postgresql://kargah:kargah_dev_pass@localhost:5432/kargah` | اتصال به دیتابیس |
| `JWT_SECRET` | — | راز JWT (حداقل ۳۲ کاراکتر) |
| `API_PORT` / `WEB_PORT` | `12588` / `12587` | پورت سرویس‌ها |
| `NLP_SERVICE_URL` | `http://localhost:12589` | آدرس سرویس NLP |
| `UPLOAD_DIR` / `UPLOAD_PUBLIC_URL` | `./uploads` | مسیر آپلود و URL عمومی |
| `CORS_ORIGIN` | `http://localhost:12587` | مبدأ مجاز CORS |
| `XP_DAILY_SOFT_CAP` / `XP_DAILY_HARD_CAP` | `600` / `1000` | سقف XP روزانه |
| `STREAK_FREEZE_MAX` | `2` | حداکثر یخ‌زدگی استریک |
| `REROLL_DAILY_LIMIT` | `2` | مجوز رِرول روزانه |
| `PASTE_THRESHOLD` | `0.20` | آستانه‌ی تشخیص پاست |
| `TYPING_SPEED_MAX` | `12` | حداکثر سرعت تایپ (کلمه/ثانیه) |
| `VOCAB_UNIQUE_MIN` | `0.30` | حداقل تنوع واژگان |
| `KNOWN_WORD_MIN` | `0.60` | حداقل واژه‌ی شناخته‌شده |
| `SELF_SIMILARITY_MAX` | `0.90` | حداکثر self-similarity |
| `BANK_SIMILARITY_MAX` | `0.80` | حداکثر شباهت به بانک |
| `NEWS_FEEDS` | — | آدرس فیدهای RSS (فید پیش‌فرض‌ها را جایگزین کنید) |

## تست

```bash
pnpm test                      # api + web
pnpm --filter api test:cov     # با پوشش
pnpm --filter api test:e2e     # تست e2e (نیاز به دیتابیس)
```

## CI/CD

دو workflow در `.github/workflows/`:

- **`ci.yml`** — روی هر push/PR به `main`/`master`: تایپ‌چک، lint، بیلد با PostgreSQL throwaway (برای `prisma generate`).
- **`ci-cd.yml`** — سه مرحله:
  1. **CI**: typecheck + lint + build (api/web/nlp) با postgres service
  2. **Build images**: روی تگ‌های `v*` و push به `main` — ساخت سه تصویر Docker
  3. **Deploy**: تگ `v*` → production، `main` → staging؛ تصویرها به registry با `REGISTRY` / `REGISTRY_USER` / `REGISTRY_PASSWORD` منتشر می‌شوند

## معماری کلیدی

- **اصل تفکیک نقش‌ها**: `scientific-writer` روی داده‌ی خام دست نمی‌زند؛ `data-analyst` بدون اجرای کد عدد وارد نتایج نمی‌کند.
- **Integrity pipeline**: ارسال تمرین → اعتبارسنجی سبک سمت کلاینت → pipeline سمت سرور (Integrity) با آستانه‌های پیکرباز → ثبت در `IntegrityCheck` و `AnomalyFlag` → کوی `RecommendationQueue`.
- **گیمیفیکیشن**: هر رویداد → `EventLog` → پردازش `XP`/`Streak`/`Badge`/`Quest` در `gamification` → لیدجر `XPLedger` و آمار `UserStats`/`UserSkill`/`StreakDay`.
- **نوسازی داده**: seed idempotent، رویدادها با هش IP/UA، `beforeJson/afterJson` در `AuditLog` برای ۴ نقطه‌ی حساس.

## مستندات

- [`کل طرح.md`](کل%20طرح.md) — سند مادر پروژه (معماری، فازها، تصمیمات)
- [`apps/api/README.md`](apps/api/README.md) — جزئیات NestJS
- [`apps/web/README.md`](apps/web/README.md) — جزئیات Next.js
- `apps/api/prisma/schema.prisma` — ۵۹ مدل دیتابیس
- `.env.example` — تمام متغیرهای محیطی

## لایسنس

لایسنس در `package.json` ثبت نشده است؛ در صورت نیاز برای انتشار عمومی، لایسنس انتخابی را به ریشه‌ی ریپازیتوری اضافه کنید.
