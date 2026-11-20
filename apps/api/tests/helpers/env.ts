/**
 * Test environment bootstrap — MUST be imported before any app module
 * (env.ts validates process.env at import time).
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '4100';
process.env.MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/ats_test_placeholder';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef0123456789abcdef';
process.env.CORS_ORIGINS = '';
process.env.COOKIE_SECURE = 'false';
process.env.COOKIE_CROSS_SITE = 'false';
process.env.ATS_SKIP_BOOTSTRAP = 'true';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.SUPER_ADMIN_EMAIL = 'admin@test.local';
process.env.SUPER_ADMIN_PASSWORD = 'SuperAdmin#2026!x';

export {};
process.env.MONGOMS_DOWNLOAD_DIR = "/tmp/ats-mongod-binaries";
