import { Check } from 'lucide-react';
import { PublicShell } from '@/components/public/public-shell';

export const metadata = { title: 'طرح‌ها و قیمت‌ها — کارگاه' };

// DECISION: display-only pricing page. No payment model in Phase 1.
// Prices are marked [داده‌ی فرضی] per AGENTS.md anti-fabrication rules.

const PLANS = [
  {
    name: 'رایگان',
    price: '۰ تومان',
    period: 'همیشه',
    features: [
      '۱۱ تمرین پایه',
      'بازخورد خودکار روزانه',
      'داشبورد و آمار شخصی',
      'دسترسی به جامعه',
    ],
    cta: 'شروع رایگان',
    href: '/auth/register',
    highlighted: false,
  },
  {
    name: 'پایه',
    price: '۹۹٬۰۰۰ تومان', // [داده‌ی فرضی — با داده‌ی واقعی جایگزین شود]
    period: 'ماهانه',
    features: [
      'همهٔ ۲۱ تمرین',
      'بازخورد هوشمند پیشرفته',
      'پروژه‌ها و فصل‌ها',
      'منتورشیپ',
      'آمار پیشرفت گسترده',
    ],
    cta: 'انتخاب پایه',
    href: '/auth/register',
    highlighted: true,
  },
  {
    name: 'حرفه‌ای',
    price: '۲۴۹٬۰۰۰ تومان', // [داده‌ی فرضی — با داده‌ی واقعی جایگزین شود]
    period: 'ماهانه',
    features: [
      'همهٔ امکانات پایه',
      'تمرین‌های اختصاصی',
      'بازخورد منتور زنده',
      'اولویت در جامعه',
      'خروجی PDF از نوشته‌ها',
    ],
    cta: 'انتخاب حرفه‌ای',
    href: '/auth/register',
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <PublicShell>
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-3">طرح‌ها و قیمت‌ها</h1>
        <p className="text-text-secondary max-w-xl mx-auto">
          با طرح رایگان شروع کنید و هر وقت که آماده بودید ارتقا دهید.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-xl border p-6 flex flex-col ${
              plan.highlighted
                ? 'border-accent bg-bg-secondary relative'
                : 'border-border bg-bg-primary'
            }`}
          >
            {plan.highlighted && (
              <span className="absolute -top-3 right-4 bg-accent text-white text-xs px-3 py-1 rounded-full">
                محبوب‌ترین
              </span>
            )}
            <h2 className="text-lg font-bold mb-1">{plan.name}</h2>
            <div className="mb-4">
              <span className="text-2xl font-bold">{plan.price}</span>
              <span className="text-sm text-text-secondary mr-2">{plan.period}</span>
            </div>
            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-text-secondary">
                  <Check size={16} className="text-accent shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={plan.href}
              className={`block text-center px-4 py-2.5 rounded-lg font-medium text-sm ${
                plan.highlighted
                  ? 'bg-accent text-white hover:opacity-90'
                  : 'border border-border text-text-primary hover:bg-bg-secondary'
              }`}
            >
              {plan.cta}
            </a>
          </div>
        ))}
      </div>

      <p className="text-xs text-text-secondary text-center mt-8">
        * قیمت‌ها فعلاً نمونه هستند و در نسخهٔ نهایی مشخص می‌شوند.
      </p>
    </PublicShell>
  );
}
