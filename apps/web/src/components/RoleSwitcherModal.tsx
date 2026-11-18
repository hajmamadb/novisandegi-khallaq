'use client';

import { useState } from 'react';
import { UserCheck, ShieldAlert, X, ChevronLeft, Loader2, ArrowRightLeft } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth-store';
import { toPersianDigits } from '@/lib/utils/persian';
import { toast } from 'sonner';

export interface TestAccount {
  name: string;
  role: string;
  roleLabel: string;
  level: number;
  email: string;
  desc: string;
  color: string;
}

export const TEST_ACCOUNTS: TestAccount[] = [
  {
    name: 'سارا رادمنش',
    role: 'NOVICE',
    roleLabel: 'نوآموز',
    level: 1,
    email: 'novice@kargah.dev',
    desc: 'دسترسی به تمرین‌های مقدماتی و آزاد، رابط ساده',
    color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20',
  },
  {
    name: 'علی کریمی',
    role: 'CRAFTSPERSON',
    roleLabel: 'کاربلد',
    level: 3,
    email: 'craftsperson@kargah.dev',
    desc: 'مشاهده رادار مهارت‌ها، تمرین‌های پیشرفته‌تر',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  {
    name: 'مریم تهرانی',
    role: 'CREATIVE',
    roleLabel: 'خلاق',
    level: 5,
    email: 'creative@kargah.dev',
    desc: 'دسترسی به تمام دسته‌بندی‌های تمرین و چالش‌ها',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  {
    name: 'استاد شفیعی',
    role: 'MENTOR',
    roleLabel: 'مربی',
    level: 7,
    email: 'mentor@kargah.dev',
    desc: 'امکان مشاهده بخش منتورشیپ و بازخورد به نویسندگان',
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  },
  {
    name: 'پروانه پارسا',
    role: 'EDITOR',
    roleLabel: 'ویراستار',
    level: 8,
    email: 'editor@kargah.dev',
    desc: 'دسترسی به بازبینی، ویرایش و مدیریت متن‌ها',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  {
    name: 'دکتر محمد بختیاری',
    role: 'ADMIN',
    roleLabel: 'مدیر کل',
    level: 10,
    email: 'hajmamad.b@gmail.com',
    desc: 'دسترسی کامل به پنل مدیریت، تاییدها و پایگاه‌های داده',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  },
];

const TEST_PASSWORD = 'Test1234!@';
const ADMIN_PASSWORD = '433700bM!@mb';

export function RoleSwitcherModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const login = useAuthStore((s) => s.login);
  const currentUser = useAuthStore((s) => s.user);
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSwitch = async (account: TestAccount) => {
    if (currentUser?.email === account.email) {
      toast.info(`در حال حاضر در حساب «${account.name}» هستید.`);
      onClose();
      return;
    }

    setLoadingEmail(account.email);
    try {
      const password = account.role === 'ADMIN' ? ADMIN_PASSWORD : TEST_PASSWORD;
      await login(account.email, password);
      // Store flag if impersonating a non-admin test account
      if (account.role !== 'ADMIN') {
        localStorage.setItem('kargah_impersonating', account.name);
      } else {
        localStorage.removeItem('kargah_impersonating');
      }
      toast.success(`هویت فعال به «${account.name}» (${account.roleLabel}) تغییر یافت.`);
      onClose();
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در ورود به حساب کاربری انتخاب‌شده.';
      toast.error(msg);
      console.error('Role switch error:', err);
    } finally {
      setLoadingEmail(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-bg-secondary border border-border rounded-xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-accent" />
            <h2 className="text-base font-bold text-text-primary">
              بررسی سامانه در نقش سایر کاربران (تغییر سطح)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed">
          برای بررسی ظاهر، دسترسی‌ها و منوهای کارگاه در سطوح مختلف، کاربر مورد نظر را انتخاب کنید تا سامانه دقیقاً از دید او نمایش داده شود.
        </p>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {TEST_ACCOUNTS.map((acc) => {
            const isCurrent = currentUser?.email === acc.email;
            const isLoading = loadingEmail === acc.email;

            return (
              <button
                key={acc.email}
                onClick={() => handleSwitch(acc)}
                disabled={loadingEmail !== null}
                className={`w-full text-right p-3 rounded-lg border transition-all flex items-center justify-between gap-3 ${
                  isCurrent
                    ? 'border-accent bg-accent/5 ring-1 ring-accent'
                    : 'border-border bg-bg-primary hover:border-accent/50 hover:bg-bg-secondary'
                }`}
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-text-primary truncate">
                      {acc.name}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${acc.color}`}>
                      {acc.roleLabel} (سطح {toPersianDigits(acc.level)})
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] bg-accent text-white px-1.5 py-0.2 rounded font-medium">
                        فعال
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-1">{acc.desc}</p>
                </div>

                <div className="shrink-0 text-text-secondary">
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-accent" />
                  ) : (
                    <ChevronLeft className="w-4 h-4" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

