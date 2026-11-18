'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { useCalendar } from '@/lib/calendar/calendar-provider';
import { PublicShell } from '@/components/public/public-shell';

interface BlogPostDetail {
  id: string;
  slug: string;
  titleFa: string;
  excerptFa: string;
  bodyMarkdown: string;
  publishedAt: string;
}

export default function BlogPostPage() {
  const { formatDate } = useCalendar();
  const { slug } = useParams<{ slug: string }>();
  const { data: post, isLoading } = useQuery({
    queryKey: ['public-blog', slug],
    queryFn: () => api.get<BlogPostDetail>(`/blog/${slug}`),
    retry: false,
  });

  return (
    <PublicShell>
      <article className="max-w-3xl mx-auto">
        {isLoading ? (
          <div className="text-center py-12 text-text-secondary">در حال بارگذاری…</div>
        ) : !post ? (
          <div className="text-center py-12">
            <p className="text-text-secondary mb-4">مقاله یافت نشد.</p>
            <Link href="/blog" className="text-accent hover:underline">
              بازگشت به وبلاگ
            </Link>
          </div>
        ) : (
          <>
            <Link href="/blog" className="text-sm text-accent hover:underline mb-4 inline-block">
              ← بازگشت به وبلاگ
            </Link>
            <h1 className="text-3xl font-bold mb-3">{post.titleFa}</h1>
            <time className="text-sm text-text-secondary block mb-6">
              {formatDate(post.publishedAt)}
            </time>
            {/* DECISION: bodyMarkdown rendered as paragraphs (no MD lib in deps) */}
            <div className="prose prose-invert max-w-none space-y-4 text-text-secondary">
              {post.bodyMarkdown.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </>
        )}
      </article>
    </PublicShell>
  );
}
