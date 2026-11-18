'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { useCalendar } from '@/lib/calendar/calendar-provider';
import { PublicShell } from '@/components/public/public-shell';

interface BlogPost {
  id: string;
  slug: string;
  titleFa: string;
  excerptFa: string;
  publishedAt: string;
}

export default function BlogPage() {
  const { formatDate } = useCalendar();
  const { data, isLoading } = useQuery({
    queryKey: ['public-blog'],
    queryFn: () => api.get<BlogPost[]>('/blog'),
    retry: false,
  });

  const posts = data ?? [];

  return (
    <PublicShell>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-3">وبلاگ آموزشی</h1>
        <p className="text-text-secondary max-w-xl mx-auto">
          راهنماها، نکات، و مقالات برای نویسنده‌های در حال رشد.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-text-secondary">در حال بارگذاری…</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          هنوز محتوایی منتشر نشده است. به‌زودی!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="bg-bg-secondary border border-border rounded-xl p-5 hover:border-accent transition-colors"
            >
              <h2 className="font-bold mb-2">{post.titleFa}</h2>
              <p className="text-sm text-text-secondary mb-3">{post.excerptFa}</p>
              <time className="text-xs text-text-secondary">
                {formatDate(post.publishedAt)}
              </time>
            </Link>
          ))}
        </div>
      )}
    </PublicShell>
  );
}
