import { PublicShell } from '@/components/public/public-shell';

export const metadata = { title: 'قوانین و شرایط استفاده — کارگاه' };

export default function TermsPage() {
  return (
    <PublicShell>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">قوانین و شرایط استفاده</h1>
        <section className="prose prose-invert max-w-none space-y-4 text-text-secondary">
          <p>آخرین به‌روزرسانی: نوامبر ۱۴۰۴</p>

          <h2 className="text-xl font-bold text-text-primary">۱. پذیرش شرایط</h2>
          <p>
            با ثبت‌نام یا استفاده از پلتفرم کارگاه، شما این شرایط را می‌پذیرید. در صورت
            عدم موافقت، از سامانه استفاده نکنید.
          </p>

          <h2 className="text-xl font-bold text-text-primary">۲. حساب کاربری</h2>
          <p>
            مسئول حفاظت از اطلاعات ورودی خود هستید. فعالیت‌های انجام‌شده با حساب شما،
            به‌عنوان فعالیت شما تلقی می‌شود. ثبت‌نام فقط برای افراد بالای ۱۳ سال مجاز است.
          </p>

          <h2 className="text-xl font-bold text-text-primary">۳. محتوا و مالکیت</h2>
          <p>
            نوشته‌هایی که در کارگاه تولید می‌کنید، مالکیت آن‌ها متعلق به شماست. شما به
            ما اجازهٔ نمایش نمونه‌ها در بخش جامعه (در صورت انتخاب عمومی) را می‌دهید.
            ما حق تغییر یا حذف محتوا را در موارد نقض قوانین داریم.
          </p>

          <h2 className="text-xl font-bold text-text-primary">۴. رفتار در جامعه</h2>
          <p>
            هرگونه رفتار توهین‌آمیز، آزاردهنده، یا نقض حریم خصوصی دیگران ممنوع است.
            نقض مکرر منجر به محدودسازی یا حذف حساب می‌شود.
          </p>

          <h2 className="text-xl font-bold text-text-primary">۵. محدودیت مسئولیت</h2>
          <p>
            کارگاه یک پلتفرم تمرین است و گارانتی خاصی برای پیشرفت یا پذیرش نوشته‌ها
            ارائه نمی‌دهد. خدمات به صورت «به همان حال» ارائه می‌شوند.
          </p>

          <h2 className="text-xl font-bold text-text-primary">۶. تغییر شرایط</h2>
          <p>
            ما ممکن است این شرایط را به‌روزرسانی کنیم. تغییرات مهم از طریق اعلان در
            سامانه اعلام می‌شود. ادامهٔ استفاده پس از تغییر، پذیرش محسوب می‌شود.
          </p>

          <h2 className="text-xl font-bold text-text-primary">۷. تماس</h2>
          <p>
            برای سؤالات در خصوص این شرایط: <span dir="ltr">support@kargah.ir</span>
          </p>
        </section>
      </div>
    </PublicShell>
  );
}
