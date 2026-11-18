import { WifiOff } from 'lucide-react';
import Link from 'next/link';

export const metadata = { title: 'آفلاین' };

export default function OfflinePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ fontFamily: 'inherit' }}
    >
      <WifiOff className="h-12 w-12 text-text-secondary" />
      <h1 className="text-2xl font-bold">اتصال برقرار نیست</h1>
      <p className="text-text-secondary max-w-md">
        به‌نظرس می‌رسد شما آفلاین هستید. لطفاً اتصال اینترنت خود را بررسی کنید
        و دوباره تلاش کنید.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-accent px-6 py-3 text-white font-medium hover:opacity-90 transition-opacity"
      >
        بازگشت به صفحه اصلی
      </Link>
    </div>
  );
}
