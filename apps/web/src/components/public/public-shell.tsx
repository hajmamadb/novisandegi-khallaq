'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useEffect, useState } from 'react';

const NAV = [
  { href: '/', label: 'خانه' },
  { href: '/about', label: 'درباره' },
  { href: '/exercises', label: 'تمرین‌ها' },
  { href: '/blog', label: 'وبلاگ' },
  { href: '/pricing', label: 'طرح‌ها' },
] as const;

export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-bg-primary">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold">
            کارگاه
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map(({ href, label }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-1.5 rounded-md text-sm ${
                    active ? 'bg-accent text-white' : 'text-text-primary hover:bg-bg-secondary'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            {mounted && token ? (
              <Link
                href="/dashboard"
                className="mr-2 px-3 py-1.5 rounded-md text-sm bg-accent text-white hover:opacity-90"
              >
                داشبورد
              </Link>
            ) : (
              <div className="mr-2 flex gap-1">
                <Link
                  href="/auth/login"
                  className="px-3 py-1.5 rounded-md text-sm text-text-primary hover:bg-bg-secondary"
                >
                  ورود
                </Link>
                <Link
                  href="/auth/register"
                  className="px-3 py-1.5 rounded-md text-sm bg-accent text-white hover:opacity-90"
                >
                  ثبت‌نام
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">{children}</main>
      <footer className="border-t border-border bg-bg-secondary py-6 mt-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row justify-between gap-4 text-sm text-text-secondary">
          <div>
            <span className="font-semibold text-text-primary">کارگاه</span> — کارنویس خلاق
          </div>
          <nav className="flex gap-4">
            <Link href="/terms" className="hover:text-text-primary">قوانین</Link>
            <Link href="/privacy" className="hover:text-text-primary">حریم خصوصی</Link>
            <Link href="/pricing" className="hover:text-text-primary">طرح‌ها</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
