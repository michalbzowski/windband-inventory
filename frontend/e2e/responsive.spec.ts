import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Strażnik responsywności po rearanżacji makiety (2026-10-18):
 *  1) fake'owy statusbar (9:41/5G/bateria) i home bar NIE renderują się
 *     na żadnym breakpoint;
 *  2) telefon 360 px — bez zmian: kolumna ≤390 px, zakładki na dole;
 *  3) tablet 834 px — kolumna szersza, bottom sheet = wyśrodkowany dialog;
 *  4) desktop 1440 px — okno ~1240 px, zakładki jako rząd pigułek pod
 *     appbarem, duże przyciski liczenia w jednym rzędzie;
 *  5) na wszystkich szerokościach — brak poziomego scrollbaru.
 */

const BANDS = [{ bandId: 1, name: 'Orkiestra', role: 'ADMIN' }];
const MEMBERS = [
  { memberId: 12, firstName: 'Anna', lastName: 'Nowak', active: true, expectedSet: [{ instrument: 'Flet', primary: true }] },
];
const ITEMS = [
  { id: 1, name: 'Flet', type: 'INSTRUMENT', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', serialNumber: 'FL-01', assignedMemberId: null, assignedMemberName: null },
  { id: 2, name: 'Tuba', type: 'INSTRUMENT', lifecycleStatus: 'ASSIGNED', warehouse: 'MAIN', serialNumber: null, assignedMemberId: 12, assignedMemberName: 'Anna Nowak' },
];
const STOCK = {
  id: 7, bandId: 1, status: 'IN_PROGRESS', startedBySubject: 'admin-subj', notes: 'spis testowy',
  startedAt: '2026-10-18T08:00:00Z', finishedAt: null, totalLines: ITEMS.length, countedLines: 0,
};
const LINES = ITEMS.map((it, i) => ({
  id: 101 + i, itemId: it.id, name: it.name, serialNumber: it.serialNumber,
  assignedMemberName: it.assignedMemberName, expectedStatus: it.lifecycleStatus,
  foundState: null, note: null, countedByMemberId: null, countedByMemberName: null, countedAt: null, extra: false,
}));
const SUMMARY = {
  id: 7, status: 'IN_PROGRESS', startedAt: STOCK.startedAt, finishedAt: null,
  total: 2, counted: 0, uncounted: 2, divergences: 0, ok: 0, missing: 0, broken: 0, extra: 0,
};

async function json(route: Route, data: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
}

/** Sessão SSO + tożsamość liczącego + single-band → prosto do pulpitu. */
async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'wi.session',
      JSON.stringify({
        accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
        user: { sub: 'admin-subj', firstName: 'Test', lastName: 'Osoba' },
      }),
    );
    localStorage.setItem('wi.identity.1', JSON.stringify({ memberId: 12, name: 'Anna Nowak' }));
  });
  await page.route('**/api/v1/me/bands', (r) => json(r, BANDS));
  await page.route('**/api/v1/bands/1/members', (r) => json(r, MEMBERS));
  await page.route('**/api/inventory/**', (r) => {
    const p = new URL(r.request().url()).pathname.replace('/api/inventory', '');
    if (p.startsWith('/items')) return json(r, ITEMS);
    if (p.startsWith('/attribute-defs')) return json(r, []);
    if (p === '/stocktakes') return json(r, [STOCK]);
    if (p === '/stocktakes/7') return json(r, STOCK);
    if (p === '/stocktakes/7/lines') return json(r, LINES);
    if (p === '/stocktakes/7/summary') return json(r, SUMMARY);
    return json(r, []);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Orkiestra' })).toBeVisible();
}

async function assertNoMockupChrome(page: Page, width: number): Promise<void> {
  await expect(page.locator('.sbar, .homebar, .sig, .bat')).toHaveCount(0);
  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalScroll, `poziomy scrollbar przy ${width}px`).toBe(false);
}

test('telefon 360: ramka ≤390 px, zakładki na dole, makieta usunięta', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seed(page);
  await assertNoMockupChrome(page, 360);

  const app = await page.locator('.app').boundingBox();
  expect(app!.width).toBeLessThanOrEqual(390);

  const content = await page.locator('.content').boundingBox();
  const tabs = await page.locator('.tabs').boundingBox();
  expect(tabs!.y).toBeGreaterThan(content!.y); // dolny pasek zakładek zostaje
});

test('tablet 834: szersza kolumna, sheet jako wyśrodkowany dialog', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await seed(page);
  await assertNoMockupChrome(page, 834);

  const app = await page.locator('.app').boundingBox();
  expect(app!.width).toBeGreaterThanOrEqual(700);
  expect(app!.width).toBeLessThanOrEqual(760);

  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '♧ Ekwipunek' }).click();
  await page.getByRole('button', { name: /Typ ▾/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Typ pozycji' });
  await expect(sheet).toBeVisible();
  const sb = await sheet.boundingBox();
  expect(sb!.width).toBeLessThanOrEqual(580);          // nie na całą szerokość
  expect(sb!.y).toBeLessThan(1112 * 0.55);             // nie przyklejony do dołu
  expect(sb!.y + sb!.height).toBeGreaterThan(1112 * 0.45); // wyśrodkowany w pionie

  const content = await page.locator('.content').boundingBox();
  const tabs = await page.locator('.tabs').boundingBox();
  expect(tabs!.y).toBeGreaterThan(content!.y);         // na tablecie zakładki wciąż na dole
  await assertNoMockupChrome(page, 834);
});

test('desktop 1440: okno ~1240 px, pigułki pod appbarem, akcje liczenia w rzędzie', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await assertNoMockupChrome(page, 1440);

  const app = await page.locator('.app').boundingBox();
  expect(app!.width).toBeGreaterThanOrEqual(1200);
  expect(app!.width).toBeLessThanOrEqual(1240);

  const bar = await page.locator('.appbar').boundingBox();
  const tabs = await page.locator('.tabs').boundingBox();
  const content = await page.locator('.content').boundingBox();
  expect(bar!.y).toBeLessThan(tabs!.y);   // zakładki tuż pod appbarem
  expect(tabs!.y).toBeLessThan(content!.y); // …a treść pod zakładkami

  const pill = page.locator('.tabs .t');
  const p0 = await pill.nth(0).boundingBox();
  const p1 = await pill.nth(1).boundingBox();
  expect(Math.abs(p0!.y - p1!.y)).toBeLessThan(2);  // jeden poziomy rząd
  expect(p1!.x).toBeGreaterThan(p0!.x + 40);        // obok siebie, nie pod sobą

  // liczenie: trzy duże akcje w jednym rzędzie
  await page.getByRole('button', { name: 'Liczenie' }).click();
  await page.getByRole('button', { name: /Dołącz i licz/ }).click();
  await expect(page.locator('.count-card')).toBeVisible();
  await assertNoMockupChrome(page, 1440);

  const ok = await page.getByRole('button', { name: /jest i sprawny/ }).boundingBox();
  const brak = await page.getByRole('button', { name: /BRAK/ }).boundingBox();
  const uszk = await page.getByRole('button', { name: /USZKODZONE/ }).boundingBox();
  expect(Math.abs(ok!.y - brak!.y)).toBeLessThan(2);
  expect(Math.abs(brak!.y - uszk!.y)).toBeLessThan(2);
  expect(brak!.x).toBeGreaterThan(ok!.x);
  expect(uszk!.x).toBeGreaterThan(brak!.x);
});
