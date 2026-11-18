import type { Metadata, Viewport } from 'next';
import { ReactQueryProvider } from '@/lib/react-query-provider';
import { ToasterProvider } from '@/lib/toaster-provider';
import { CalendarProvider } from '@/lib/calendar/calendar-provider';
import { PwaRegister } from '@/lib/pwa/PwaRegister';
import './globals.css';

// Spec F.2 — RTL Persian shell. Fonts are self-hosted (globals.css @font-face),
// so no next/font/google here (would need network at build time).
export const metadata: Metadata = {
  title: { default: 'کارگاه — کارنویس خلاق', template: '%s | کارگاه' },
  description: 'کارگاه — کارنویس خلاق با انتخاب تصادفی، گیمیفیکیشن و ثبت کامل رویدادها',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'کارگاه',
  },
};

export const viewport: Viewport = {
  themeColor: '#6B7F5E',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <PwaRegister />
        <ReactQueryProvider>
          <CalendarProvider>
            <ToasterProvider>{children}</ToasterProvider>
          </CalendarProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
