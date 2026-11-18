// @ts-check
import withPWAInit from '@ducanh2912/next-pwa';

/**
 * PWA service-worker config (Workbox via next-pwa).
 * Strategy:
 *  - Precache the Next.js app shell (build-manifest entries).
 *  - Runtime-cache API GET responses with stale-while-revalidate
 *    (tolerates stale data, always revalidates in background).
 *  - Never intercept authenticated POST/PUT/PATCH/DELETE — those must
 *    reach the server to stay consistent. The offline queue (Task 5)
 *    handles write buffering client-side.
 *  - Exclude /api/v1/* from SW interception so the Next.js rewrites
 *    proxy (which strips /api/v1) works cleanly through the browser.
 */
const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
  workboxOptions: {
    skipWaiting: true,
    navigateFallback: '/offline',
    navigateFallbackDenylist: [/^\/api\//],
    runtimeCaching: [
      {
        // API GET responses — stale-while-revalidate for offline reading.
        urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'api-cache',
          expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // Static images — cache-first with size cap.
        urlPattern: ({ request }) => request.destination === 'image',
        handler: 'CacheFirst',
        options: {
          cacheName: 'images-cache',
          expiration: { maxEntries: 300, maxAgeSeconds: 604800 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // Fonts — cache-first, long-lived.
        urlPattern: ({ request }) =>
          request.destination === 'font' ||
          request.url.includes('.woff2') ||
          request.url.includes('.woff'),
        handler: 'CacheFirst',
        options: {
          cacheName: 'fonts-cache',
          expiration: { maxEntries: 20, maxAgeSeconds: 2592000 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // DECISION: typedRoutes disabled — it causes over-strict Link href checks
  // with dynamically-computed routes (nav arrays, template strings) that are
  // valid at runtime. The feature is experimental and not spec-required.
  async rewrites() {
    // Spec F.1 — proxy /api/* and /uploads/* to the NestJS API.
    // NEXT_PUBLIC_API_URL is read at build time; in dev it defaults to 3001.
    // DECISION: the web client calls `/api/v1/*` but the NestJS controllers
    // register routes with NO global prefix (e.g. `exercises`, `users/me`).
    // So we strip the `/api` segment: `/api/v1/exercises` → `{api}/exercises`.
    // The `/v1` segment is dropped too (no versioning in the phase-1 API).
    const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return [
      { source: '/api/v1/:path*', destination: `${api}/:path*` },
      { source: '/uploads/:path*', destination: `${api}/uploads/:path*` },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default withPWA(nextConfig);
