import Link from 'next/link';
import { PenLine, Users, Sparkles, BookOpen } from 'lucide-react';
import { PublicShell } from '@/components/public/public-shell';

// DECISION: landing page for unauthenticated visitors. Authenticated users
// are still redirected to /dashboard via the client-side guard in AppShell.
export default function LandingPage() {
  return (
    <PublicShell>
      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="text-3xl md:text-4xl font-bold mb-4">
          تمرین روزانه‌ی نویسندگی خلاق
        </h1>
        <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-8">
          کارگاه، کارنویس شماست. هر روز یک تمرین تصادفی، بازخورد هوشمند، و جامعه‌ای از
          نویسندگان برای رشد مستمر.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            href="/auth/register"
            className="px-6 py-3 bg-accent text-white rounded-lg text-base font-medium hover:opacity-90"
          >
            شروع رایگان
          </Link>
          <Link
            href="/exercises"
            className="px-6 py-3 border border-border rounded-lg text-base text-text-primary hover:bg-bg-secondary"
          >
            تمرین‌ها
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 py-8">
        <FeatureCard
          icon={<PenLine size={24} className="text-accent" />}
          title="۲۱ تمرین متنوع"
          desc="از صبح‌نوشتن تا جسد نفیس — هر روز یک چالش جدید برای قلم‌تان."
        />
        <FeatureCard
          icon={<Sparkles size={24} className="text-accent" />}
          title="گیمیفیکیشن"
          desc="امتیاز، نشان، سطح‌بندی و چالش‌های هفتگی برای حفظ انگیزه."
        />
        <FeatureCard
          icon={<Users size={24} className="text-accent" />}
          title="جامعه‌ی نویسندگان"
          desc="گروه‌ها، بازخورد همتایان، منتورشیپ و تمرین‌های گروهی."
        />
      </section>

      {/* How it works */}
      <section className="py-8">
        <h2 className="text-xl font-bold text-center mb-6">چگونه کار می‌کند؟</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StepCard num="۱" title="ورود و انتخاب تمرین" desc="ثبت‌نام کنید و از کتابخانه‌ی تمرین‌ها یکی را انتخاب کنید." />
          <StepCard num="۲" title="نوشتن با زمان‌بندی" desc="در محیط متمرکز بنویسید؛ پیشرفت لحظه‌به‌لحظه ثبت می‌شود." />
          <StepCard num="۳" title="ارسال و بازخورد" desc="متن را ارسال کنید؛ امتیاز بگیرید و از جامعه بازخورد بگیرید." />
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-12 bg-bg-secondary rounded-xl mt-8">
        <BookOpen size={32} className="mx-auto text-accent mb-3" />
        <h2 className="text-xl font-bold mb-2">آماده‌ی نوشتن هستید؟</h2>
        <p className="text-text-secondary mb-4">همین امروز اولین تمرین‌تان را شروع کنید.</p>
        <Link
          href="/auth/register"
          className="inline-block px-6 py-3 bg-accent text-white rounded-lg font-medium hover:opacity-90"
        >
          ثبت‌نام رایگان
        </Link>
      </section>
    </PublicShell>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-5">
      <div className="mb-3">{icon}</div>
      <h3 className="font-bold mb-1">{title}</h3>
      <p className="text-sm text-text-secondary">{desc}</p>
    </div>
  );
}

function StepCard({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="text-center p-4">
      <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-bold mx-auto mb-3">
        {num}
      </div>
      <h3 className="font-bold mb-1">{title}</h3>
      <p className="text-sm text-text-secondary">{desc}</p>
    </div>
  );
}
