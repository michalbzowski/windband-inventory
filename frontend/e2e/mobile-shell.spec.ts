import { test, expect, type Route } from '@playwright/test';

// Mobile shell: dolna szyna nawigacyjna musi być widoczna ZAWSZE, niezależnie
// od przewinięcia treści (żądanie właściciela 2026-10-19). Model: .app = 100dvh,
// .content scrolluje wewnętrznie, tabs jako ostatnie dziecko = przyklejone na dół.
test.use({ viewport: { width: 390, height: 844 } });

const BAND = { bandId: 1, name: 'Orkiestra', role: 'ADMIN' };
const MANY = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1, bandId: 1, name: `Flet numer ${i + 1}`, type: 'INSTRUMENT', lifecycleStatus: 'IN_STOCK',
  warehouse: 'MAIN', serialNumber: `SN-${i}`, description: null, notes: null, attributes: [],
  assignedMemberId: null, assignedMemberName: null, nextServiceDate: null,
}));

async function ok(route: Route, data: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
}

async function openEkwipunekLongList(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem('wi.session', JSON.stringify({
      accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
      user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
    }));
  });
  await page.route('**/api/v1/me/bands', (r) => ok(r, [BAND]));
  await page.route('**/api/inventory/**', (r) => ok(r, []));
  await page.route(/\/api\/inventory\/items(\?.*)?$/, (r) => ok(r, MANY));
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Nawigacja główna' });
  await nav.getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await expect(page.getByRole('heading', { name: 'Ekwipunek' })).toBeVisible();
}

test('dolna nawigacja sticky: po głębokim scrollu wciąż w widoku i klikalna', async ({ page }) => {
  await openEkwipunekLongList(page);

  const content = page.locator('.content');
  const scrollable = await content.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(scrollable, 'lista musi być dłuższa niż viewport (test sensowny)').toBeGreaterThan(200);

  await content.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(50);

  const nav = page.getByRole('navigation', { name: 'Nawigacja główna' });
  await expect(nav).toBeVisible();
  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  // szyna przyklejona do dolnej krawędzi okna (safe-area=0 w teście)
  expect(box!.y).toBeGreaterThanOrEqual(844 - 110);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 2);

  // przełączanie zakładek bez żadnego scrollowania strony
  await nav.getByRole('button', { name: /Pulpit/ }).click();
  await expect(page.getByRole('heading', { name: /Orkiestra/ })).toBeVisible();
});

test('nawigacja nie zasłania ostatniej pozycji listy (content ma margines na szynę)', async ({ page }) => {
  await openEkwipunekLongList(page);
  await page.locator('.content').evaluate((el) => { el.scrollTop = el.scrollHeight; });

  const last = page.getByRole('button', { name: /Flet numer 24/ });
  await expect(last).toBeVisible();
  const box = await last.boundingBox();
  const nav = await page.getByRole('navigation', { name: 'Nawigacja główna' }).boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y + 2);
});
