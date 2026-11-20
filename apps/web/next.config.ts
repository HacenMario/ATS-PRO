import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The API is a separate Railway service consumed directly by the browser
  // (cookies/Bearer). Nothing from the app server needs to be transpiled.
  transpilePackages: ['@ats/shared', '@ats/i18n'],
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), notifications=(self)',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
