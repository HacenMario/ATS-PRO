/**
 * Visual QA harness (v1.3): boots nothing — expects dev API :4000 + web :3000.
 * Logs in through the UI, walks the key pages at phone size (375×812) and
 * desktop, light + dark, and saves screenshots to /tmp/render.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/render';
mkdirSync(OUT, { recursive: true });

const ADMIN = { email: 'admin@ats.local', password: 'Admin#Local2026!' };
const API = 'http://localhost:4000';
const WEB = 'http://localhost:3000';

async function waitReady(url, label, tries = 90) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not ready: ${url}`);
}

const consoleErrors = [];

async function seed() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(ADMIN),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status} ${await login.text()}`);
  const { accessToken } = await login.json();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, 'X-Requested-With': 'XMLHttpRequest' };

  const wsRes = await fetch(`${API}/api/workshops`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ name: 'ورشة الفحص البصري', description: 'ورشة تجريبية لاختبار الواجهة', contactPhone: '0555000000', contactEmail: 'ws@local.test', address: 'المنشية' }),
  });
  let workshopId = null;
  if (wsRes.ok) workshopId = (await wsRes.json())?.workshop?.id ?? null;
  else console.log('[seed] workshops:', wsRes.status, (await wsRes.text()).slice(0, 160));

  let seededTaskId = null;
  if (workshopId) {
    const t = await fetch(`${API}/api/tasks`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ workshopId, title: 'معاينة خط الإنتاج الثاني', description: 'مهمة تجريبية للفحص البصري لصفحة التفاصيل والتعليقات.', publish: false, priority: 'high', location: 'القسم 3', safetyNotes: 'نظارة واقية إلزامية' }),
    });
    if (t.ok) { seededTaskId = (await t.json())?.task?.id ?? null; console.log('[seed] task:', seededTaskId); }
    else console.log('[seed] tasks:', t.status, (await t.text()).slice(0, 160));
  }
  globalThis.__seededTaskId = seededTaskId;
}

const browser = await chromium.launch();
try {
  await waitReady(`${API}/api/meta`, 'api');
  await waitReady(WEB, 'web');
  await seed();

  // ---------- phone (375×812) ----------
  const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ar' });
  const page = await phone.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e).slice(0, 200)));

  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/01-login-mobile.png` });

  await page.fill('input[type="email"], input[name="email"]', ADMIN.email);
  await page.fill('input[type="password"]', ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${OUT}/02-dashboard-mobile.png`, fullPage: true });

  await page.goto(`${WEB}/tasks`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/03-tasks-mobile.png` });

  // language dropdown open — must float ABOVE everything
  await page.click('button[aria-label*="اللغة"], button[aria-label*="Language"], button[aria-label*="langue"]').catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/04-dropdown-mobile.png` });
  await page.keyboard.press('Escape');

  await page.goto(`${WEB}/reports`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/05-reports-mobile.png`, fullPage: true });

  // dark mode
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/06-reports-mobile-dark.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });

  // task detail (draft task from seed) with comments card
  if (globalThis.__seededTaskId) {
    await page.goto(`${WEB}/tasks/${globalThis.__seededTaskId}`, { waitUntil: 'networkidle' });
    // post a comment through the composer so the thread shows content
    await page.fill('textarea', 'ملاحظة تجريبية من الفحص البصري — الترتيب ممتاز.');
    await page.click('button:has-text("نشر التعليق")').catch(() => {});
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUT}/07-task-detail-mobile.png`, fullPage: true });
  }

  await phone.close();

  // ---------- desktop (1280×800) ----------
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
  const dpage = await desktop.newPage();
  dpage.on('pageerror', (e) => consoleErrors.push('pageerror(d): ' + String(e).slice(0, 200)));
  await dpage.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  await dpage.fill('input[type="email"], input[name="email"]', ADMIN.email);
  await dpage.fill('input[type="password"]', ADMIN.password);
  await dpage.click('button[type="submit"]');
  await dpage.waitForURL('**/dashboard', { timeout: 30000 }).catch(() => {});
  await dpage.waitForLoadState('networkidle');
  await dpage.screenshot({ path: `${OUT}/08-dashboard-desktop.png` });
  await dpage.goto(`${WEB}/reports`, { waitUntil: 'networkidle' });
  await dpage.screenshot({ path: `${OUT}/09-reports-desktop.png`, fullPage: true });
  await desktop.close();

  console.log('SCREENSHOTS DONE');
} finally {
  await browser.close();
}
console.log(consoleErrors.length ? 'CONSOLE ERRORS:\n' + consoleErrors.slice(0, 12).join('\n') : 'NO CONSOLE ERRORS');
process.exit(0);
