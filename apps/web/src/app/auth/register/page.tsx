'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/stores/auth-store';
import { ApiError } from '@/lib/api/client';

interface RegisterForm {
  email: string;
  password: string;
  displayName: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const [busy, setBusy] = useState(false);
  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>();

  const onSubmit = async (data: RegisterForm) => {
    setBusy(true);
    try {
      await register(data.email, data.password, data.displayName);
      router.push('/dashboard');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'خطا در ثبت‌نام، دوباره امتحان کن';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm bg-bg-secondary border border-border rounded-card shadow-card p-6 space-y-4"
        noValidate
      >
        <h1 className="text-xl font-bold">ثبت‌نام در کارگاه</h1>

        <div className="space-y-1">
          <label htmlFor="displayName" className="text-sm text-text-secondary">
            نام نمایشی
          </label>
          <input
            id="displayName"
            type="text"
            className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
            {...field('displayName', {
              required: 'نام نمایشی الزامی است',
              minLength: { value: 2, message: 'حداقل ۲ حرف' },
            })}
          />
          {errors.displayName && (
            <p className="text-xs text-danger">{errors.displayName.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm text-text-secondary">
            ایمیل
          </label>
          <input
            id="email"
            type="email"
            dir="ltr"
            className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
            {...field('email', {
              required: 'ایمیل الزامی است',
              pattern: {
                value: /^\S+@\S+\.\S+$/,
                message: 'ایمیل معتبر نیست',
              },
            })}
          />
          {errors.email && (
            <p className="text-xs text-danger">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-text-secondary">
            رمز عبور
          </label>
          <input
            id="password"
            type="password"
            dir="ltr"
            className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
            {...field('password', {
              required: 'رمز عبور الزامی است',
              minLength: { value: 8, message: 'حداقل ۸ حرف' },
            })}
          />
          {errors.password && (
            <p className="text-xs text-danger">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent text-white py-2 text-sm font-medium disabled:opacity-60"
        >
          {busy ? 'در حال ثبت‌نام…' : 'ثبت‌نام'}
        </button>
      </form>
    </main>
  );
}
