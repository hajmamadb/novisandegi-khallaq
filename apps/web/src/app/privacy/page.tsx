import { PublicShell } from '@/components/public/public-shell';

export const metadata = { title: 'حریم خصوصی — کارگاه' };

export default function PrivacyPage() {
  return (
    <PublicShell>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">سیاست حریم خصوصی</h1>
        <section className="prose prose-invert max-w-none space-y-4 text-text-secondary">
          <p>آخرین به‌روزرسانی: نوامبر ۱۴۰۴</p>

          <h2 className="text-xl font-bold text-text-primary">۱. چه داده‌هایی جمع می‌کنیم</h2>
          <ul className="list-disc pr-5 space-y-1">
            <li>اطلاعات حساب: نام، ایمیل</li>
            <li>محتوای نوشته‌ها و تمرین‌ها</li>
            <li>آمار استفاده: تعداد کلمه، زمان نوشتن، سطوح</li>
            <li>فعالیت در جامعه (گروه‌ها، بازخورد)</li>
          </ul>

          <h2 className="text-xl font-bold text-text-primary">۲. چگونه از داده‌ها استفاده می‌کنیم</h2>
          <p>
            داده‌ها فقط برای ارائهٔ سرویس، بهبود تجربهٔ کاربری، و نمایش آمار شخصی
            شما استفاده می‌شود. دادهٔ شما را به شخص ثالث نمی‌فروشیم.
          </p>

          <h2 className="text-xl font-bold text-text-primary">۳. اشتراک‌گذاری</h2>
          <p>
            داده‌های شما در موارد زیر قابل‌مشاهده‌اند:
          </p>
          <ul className="list-disc pr-5 space-y-1">
            <li>محتوایی که خودتان عمومی کرده‌اید (نوشته‌ها در جامعه)</li>
            <li>نام نمایشی در گروه‌ها و بازخورد</li>
          </ul>

          <h2 className="text-xl font-bold text-text-primary">۴. امنیت</h2>
          <p>
            داده‌ها با رمزنگاری در انتقال (HTTPS) و ذخیره‌سازی امن نگهداری می‌شوند.
            ما تلاش می‌کنیم از دسترسی غیرمجاز جلوگیری کنیم، اما هیچ سیستمی
            ۱۰۰٪ امن نیست.
          </p>

          <h2 className="text-xl font-bold text-text-primary">۵. حذف حساب و داده‌ها</h2>
          <p>
            در هر لحظه می‌توانید حساب خود را از بخش تنظیمات حذف کنید. با حذف حساب،
            تمام داده‌های شما در مهلت ۳۰ روز از سامانه حذف می‌شوند.
          </p>

          <h2 className="text-xl font-bold text-text-primary">۶. کوکی‌ها</h2>
          <p>
            ما فقط از کوکی‌های ضروری برای حفظ نشست کاربری استفاده می‌کنیم.
            کوکی ردیابی تبلیغاتی نداریم.
          </p>

          <h2 className="text-xl font-bold text-text-primary">۷. تماس</h2>
          <p>
            برای سؤالات حریم خصوصی: <span dir="ltr">privacy@kargah.ir</span>
          </p>
        </section>
      </div>
    </PublicShell>
  );
}
