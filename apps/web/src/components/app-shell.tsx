'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  PenLine,
  History,
  Settings,
  Shield,
  LogOut,
  BookOpen,
  FolderOpen,
  Banknote,
  Users,
  GraduationCap,
  MessageSquare,
  Bell,
  ArrowRightLeft,
} from 'lucide-react';
import { toPersianDigits, translateRole } from '@/lib/utils/persian';
import { useAuthStore } from '@/lib/stores/auth-store';
import { api } from '@/lib/api/client';
import type { User } from '@/lib/types';
import { RoleSwitcherModal } from '@/components/RoleSwitcherModal';
import { toast } from 'sonner';

// Spec F.5 — app shell: right-hand sidebar (RTL) + topbar + content area.
// DECISION: hrefs typed as `as const` for Next.js typedRoutes compatibility.
const NAV = [
  { href: '/dashboard', label: 'داشبورد', icon: LayoutDashboard },
  { href: '/exercises', label: 'تمرین‌ها', icon: BookOpen },
  { href: '/writings', label: 'نوشته‌های من', icon: PenLine },
  { href: '/projects', label: 'پروژه‌ها', icon: FolderOpen },
  { href: '/banks', label: 'بانک‌ها', icon: Banknote },
  { href: '/community', label: 'جامعه', icon: Users },
  { href: '/mentorship', label: 'منتورشیپ', icon: GraduationCap },
  { href: '/messages', label: 'پیام‌ها', icon: MessageSquare },
  { href: '/history', label: 'تاریخچه', icon: History },
  { href: '/settings', label: 'تنظیمات', icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const setUser = useAuthStore((s) => s.setUser);

  // DECISION: mounted gate — the store reads localStorage on init (client-only).
  // Before hydration the server renders with token=null; if we used the store's
  // client-side token immediately, the first client render would diverge from
  // server HTML → React hydration error.  We gate all token-dependent rendering
  // behind `mounted` so the first client paint matches the server output, then
  // the store's real value takes effect on the second render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // DECISION: after login the store keeps a minimal user; hydrate the full
  // profile (level, role, settings) once on shell mount via GET /users/me.
  useQuery({
    queryKey: ['me'],
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const me = await api.get<User>('/users/me');
      setUser(me);
      return me;
    },
  });

  // Unread-notification badge for the topbar (silent on failure).
  const unreadQuery = useQuery({
    queryKey: ['notifications-unread'],
    enabled: Boolean(token),
    staleTime: 30 * 1000,
    retry: false,
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
  });
  const unreadCount = unreadQuery.data?.count ?? 0;

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const login = useAuthStore((s) => s.login);

  const isImpersonating =
    mounted &&
    typeof window !== 'undefined' &&
    Boolean(localStorage.getItem('kargah_impersonating'));

  const returnToAdmin = async () => {
    try {
      await login('hajmamad.b@gmail.com', '433700bM!@mb');
      localStorage.removeItem('kargah_impersonating');
      toast.success('به حساب مدیریت (دکتر محمد بختیاری) بازگشتید.');
      window.location.href = '/dashboard';
    } catch {
      toast.error('خطا در بازگشت به حساب مدیریت.');
    }
  };

  const isAdmin = mounted && user?.role === 'ADMIN';
  const nav = [
    ...NAV,
    ...(isAdmin ? [{ href: '/admin' as const, label: 'مدیریت', icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Impersonation Banner when active */}
      {mounted && isImpersonating && (
        <div className="bg-amber-500 text-amber-950 px-4 py-2 text-xs font-medium flex items-center justify-between border-b border-amber-600/30 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-900 animate-ping" />
            <span>
              شما در حال بررسی سامانه در نقش <strong>{user?.displayName}</strong> ({translateRole(user?.role)}) هستید.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRoleModalOpen(true)}
              className="bg-amber-600/30 hover:bg-amber-600/40 text-amber-950 px-2.5 py-1 rounded text-xs transition-colors"
            >
              تغییر به نقش دیگر
            </button>
            <button
              onClick={returnToAdmin}
              className="bg-amber-950 hover:bg-black text-white px-3 py-1 rounded text-xs transition-colors font-bold shadow-sm"
            >
              بازگشت به حساب مدیریت
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex">
        {/* Sidebar (right side in RTL) */}
        <aside className="hidden md:flex w-56 shrink-0 flex-col border-l border-border bg-bg-secondary p-4 gap-1">
          <Link href="/dashboard" className="text-lg font-bold px-2 mb-4">
            کارگاه
          </Link>
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  active
                    ? 'bg-accent text-white'
                    : 'text-text-primary hover:bg-bg-primary'
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}

          <div className="mt-auto space-y-2 pt-4 border-t border-border/50">
            {/* دکمه اختصاصی جعل عنوان / بررسی نقش‌ها برای مدیر */}
            {mounted && (isAdmin || isImpersonating) && (
              <button
                onClick={() => setRoleModalOpen(true)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-xs font-semibold bg-accent/10 text-accent hover:bg-accent hover:text-white border border-accent/20 transition-all shadow-sm group"
                title="مشاهده سامانه با سطوح مختلف کاربری"
              >
                <div className="flex items-center gap-2">
                  <ArrowRightLeft size={14} className="group-hover:rotate-180 transition-transform duration-300" />
                  <span>جعل عنوان (بررسی نقش‌ها)</span>
                </div>
              </button>
            )}

            <div>
              <p className="px-3 text-xs text-text-secondary">
                {user?.displayName ?? '…'}
                {user ? ` — سطح ${toPersianDigits(String(user.level))}` : ''}
              </p>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary"
              >
                <LogOut size={16} />
                خروج
              </button>
            </div>
          </div>
        </aside>

        {/* Main column: topbar + content */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 border-b border-border bg-bg-primary flex items-center justify-between px-4">
            {/* Mobile nav */}
            <nav className="md:hidden flex items-center gap-1">
              {nav.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    title={label}
                    className={`p-2 rounded-md ${active ? 'bg-accent text-white' : 'text-text-secondary'}`}
                  >
                    <Icon size={16} />
                  </Link>
                );
              })}
              {mounted && (isAdmin || isImpersonating) && (
                <button
                  onClick={() => setRoleModalOpen(true)}
                  title="جعل عنوان"
                  className="p-2 rounded-md text-accent bg-accent/10"
                >
                  <ArrowRightLeft size={16} />
                </button>
              )}
              <button onClick={logout} title="خروج" className="p-2 rounded-md text-text-secondary">
                <LogOut size={16} />
              </button>
            </nav>
            <div className="hidden md:flex items-center gap-3 text-sm text-text-secondary">
              <span>
                {mounted
                  ? user?.displayName ?? (token ? '' : 'وارد نشده‌ای')
                  : '…'}
              </span>
              {mounted && (isAdmin || isImpersonating) && (
                <button
                  onClick={() => setRoleModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-accent/10 text-accent hover:bg-accent hover:text-white transition-colors"
                >
                  <ArrowRightLeft size={12} />
                  <span>تغییر نقش</span>
                </button>
              )}
            </div>
            <Link
              href="/notifications"
              title="اعلان‌ها"
              className="relative p-2 rounded-md text-text-secondary hover:bg-bg-primary"
            >
              <Bell size={16} />
              {mounted && unreadCount > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] leading-4 text-center">
                  {toPersianDigits(String(unreadCount > 99 ? '۹۹+' : unreadCount))}
                </span>
              )}
            </Link>
          </header>
          <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">{children}</main>
        </div>
      </div>

      {/* Role Switcher Modal */}
      {mounted && (
        <RoleSwitcherModal
          isOpen={roleModalOpen}
          onClose={() => setRoleModalOpen(false)}
        />
      )}
    </div>
  );
}
