import { PublicShell } from '@/components/public/public-shell';

export const metadata = { title: 'درباره کارگاه' };

export default function AboutPage() {
  return (
    <PublicShell>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">درباره کارگاه</h1>

        <section className="prose prose-invert max-w-none space-y-4 text-text-primary">
          <p className="text-lg">
            کارگاه یک پلتفرم تمرین روزانه‌ی نویسندگی خلاق برای فارسی‌زبانان است. باور ما
            ساده است: نوشتن ماستری است که با تمرین منظم ساخته می‌شود — نه با استعداد ذاتی.
          </p>

          <h2 className="text-xl font-bold pt-4">چرا کارگاه؟</h2>
          <ul className="list-disc pr-5 space-y-2 text-text-secondary">
            <li>
              <strong className="text-text-primary">تمرین، نه تکرار:</strong> هر روز یک تمرین
              متفاوت از ۲۱ تمرین طراحی‌شده — از صبح‌نوشتن تا جسد نفیس.
            </li>
            <li>
              <strong className="text-text-primary">بازخورد فوری:</strong> تحلیل خودکار متن،
              امتیازدهی شفاف، و پیشنهاد بهبود بر اساس رُبریک.
            </li>
            <li>
              <strong className="text-text-primary">جامعه:</strong> گروه‌ها، بازخورد همتایان،
              منتورشیپ، و تمرین‌های گروهی.
            </li>
            <li>
              <strong className="text-text-primary">پیشرفت قابل‌اندازه‌گیری:</strong> سطح‌بندی،
              امتیاز، نشان، و آمار شخصی.
            </li>
          </ul>

          <h2 className="text-xl font-bold pt-4">چطور کار می‌کند؟</h2>
          <ol className="list-decimal pr-5 space-y-2 text-text-secondary">
            <li>ثبت‌نام رایگان</li>
            <li>انتخاب تمرین از کتابخانه (یا تمرین پیشنهادی روز)</li>
            <li>نوشتن در محیط متمرکز با زمان‌بندی</li>
            <li>ارسال و دریافت بازخورد خودکار</li>
            <li>ادامه در جامعه و پروژه‌های بلندمدت</li>
          </ol>

          <h2 className="text-xl font-bold pt-4">برای چه کسانی؟</h2>
          <p className="text-text-secondary">
            کارگاه برای همه سطوح طراحی شده: از نویسنده‌ی تازه‌کار تا نویسنده‌ی حرفه‌ای.
            تمرین‌ها بر اساس سطح (نوآموز → کاربلد → خلاق → حرفه‌ای) دسته‌بندی شده‌اند و
            با پیشرفت شما، دسترسی به تمرین‌های پیشرفته‌تر باز می‌شود.
          </p>

          <h2 className="text-xl font-bold pt-4">فرهنگ ما</h2>
          <p className="text-text-secondary">
            اینجا قضاوت نمی‌کنند. هر نوشته ارزش دارد. تمرین یعنی امتحان کردن، شکستن،
            و دوباره نوشتن. ما ابزار و جامعه را فراهم می‌کنیم؛ قلم با شماست.
          </p>
        </section>
      </div>
    </PublicShell>
  );
}
