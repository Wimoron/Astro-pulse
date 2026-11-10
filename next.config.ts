import type { NextConfig } from 'next';

const prod = process.env.NODE_ENV === 'production';
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const staticBuild = process.env.STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  ...(staticBuild ? { output: 'export' as const, trailingSlash: true } : {}),
  async headers() {
    if (staticBuild) return [];
    return [
      // The data routes are public, so the Android app (another origin) may call them.
      { source: '/api/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          ...(prod ? [{ key: 'Content-Security-Policy', value: csp }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
