'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/stores/auth-store';
import { ApiError } from '@/lib/api/client';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setBusy(true);
    try {
      await login(data.email, data.password);
      router.push('/dashboard');
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'خطا در ورود، دوباره امتحان کن';
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
        <h1 className="text-xl font-bold">ورود به کارگاه</h1>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm text-text-secondary">
            ایمیل
          </label>
          <input
            id="email"
            type="email"
            dir="ltr"
            className="w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm"
            {...register('email', {
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
            {...register('password', {
              required: 'رمز عبور الزامی است',
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
          {busy ? 'در حال ورود…' : 'ورود'}
        </button>
      </form>
    </main>
  );
}
