import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * B18 stronicowanie listy Ekwipunku. Mock lustrzany do kontraktowego
 * GET /items (filtr serwerowy: type/status/warehouse/search — reszta
 * dziedziczy z e2e/ekwipunek.spec); klient dzieli wiersze na strony po 25.
 * Seed: 134 UNIFORM + 10 INSTRUMENT = 144 pozycje -> 6 stron (ostatnia 19).
 */

interface Row {
  id: number; name: string; type: string; lifecycleStatus: string; warehouse: string;
  serialNumber: string; assignedMemberId: null; assignedMemberName: null; listAttributes: [];
}

function makeRows(): Row[] {
  const uni: Row[] = Array.from({ length: 134 }, (_, i) => ({
    id: i + 1, name: 'Mundur', type: 'UNIFORM', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN',
    serialNumber: `UNI-${String(i + 1).padStart(4, '0')}`,
    assignedMemberId: null, assignedMemberName: null, listAttributes: [],
  }));
  const ins: Row[] = Array.from({ length: 10 }, (_, i) => ({
    id: 1000 + i, name: 'Klarnet', type: 'INSTRUMENT', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN',
    serialNumber: `INS-${String(i + 1).padStart(4, '0')}`,
    assignedMemberId: null, assignedMemberName: null, listAttributes: [],
  }));
  return [...uni, ...ins];
}

async function json(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}

async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem('wi.session', JSON.stringify({
      accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
      user: { sub: 'admin-subj', firstName: 'Test', lastName: 'Osoba' },
    }));
  });
  const rows = makeRows();
  await page.route('**/api/v1/me/bands', (r) => json(r, [{ bandId: 1, name: 'Orkiestra', role: 'ADMIN' }]));
  // catch-all rejestrowany PRZED właściwym (page.route = LIFO, patrz skill 7c).
  await page.route('**/api/inventory/**', (r) => json(r, { error: 'mock_miss', path: new URL(r.request().url()).pathname }, 500));
  await page.route('**/api/inventory/items*', async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams;
    let out = rows;
    if (q.get('type')) out = out.filter((i) => i.type === q.get('type'));
    if (q.get('status')) out = out.filter((i) => i.lifecycleStatus === q.get('status'));
    if (q.get('warehouse')) out = out.filter((i) => i.warehouse === q.get('warehouse'));
    if (q.get('search')) {
      const s = (q.get('search') as string).toLowerCase();
      out = out.filter((i) => i.name.toLowerCase().includes(s) || i.serialNumber.toLowerCase().includes(s));
    }
    await json(route, out);
  });
  await page.goto('/');
}

async function openEkwipunek(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Ekwipunek/ }).first().click();
  await expect(page.getByRole('searchbox', { name: 'Szukaj pozycji' })).toBeVisible();
}

test.use({ viewport: { width: 360, height: 740 } });

test('144 pozycje: lista pokazuje 25 wierszy, nawigator podsumowuje zakres', async ({ page }) => {
  await seed(page);
  await openEkwipunek(page);

  await expect(page.getByText('144 pozycji · bez filtrów')).toBeVisible();
  await expect(page.locator('.srow')).toHaveCount(25);
  await expect(page.locator('.pager')).toBeVisible();
  await expect(page.locator('.pager-info')).toHaveText('Pozycje 1–25 z 144 · strona 1 z 6');
  await expect(page.getByRole('button', { name: 'Poprzednia strona' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Następna strona' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Strona 1' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.srow').first()).toContainText('UNI-0001');
  await expect(page.locator('.srow').nth(24)).toContainText('UNI-0025');
});

test('skok na stronę 3: wiersze 51–75, lista przewinięta na szczyt', async ({ page }) => {
  await seed(page);
  await openEkwipunek(page);

  // klik w nawigator wymaga zejścia pod fold — po zmianie strony wracamy na górę
  await page.getByRole('button', { name: 'Strona 3' }).click();

  await expect(page.locator('.pager-info')).toHaveText('Pozycje 51–75 z 144 · strona 3 z 6');
  await expect(page.locator('.srow')).toHaveCount(25);
  await expect(page.locator('.srow').first()).toContainText('UNI-0051');
  await expect(page.locator('.srow').nth(24)).toContainText('UNI-0075');
  const scrollTop = await page.locator('.content').evaluate((el) => el.scrollTop);
  expect(scrollTop).toBe(0);
});

test('strzałki: strona 6 to ostatnie 19 pozycji, «Następna» zablokowana', async ({ page }) => {
  await seed(page);
  await openEkwipunek(page);

  await page.getByRole('button', { name: 'Strona 6' }).click();
  await expect(page.locator('.pager-info')).toHaveText('Pozycje 126–144 z 144 · strona 6 z 6');
  await expect(page.locator('.srow')).toHaveCount(19);
  await expect(page.locator('.srow').last()).toContainText('INS-0010');
  await expect(page.getByRole('button', { name: 'Następna strona' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Poprzednia strona' })).toBeEnabled();

  await page.getByRole('button', { name: 'Poprzednia strona' }).click();
  await expect(page.locator('.pager-info')).toHaveText('Pozycje 101–125 z 144 · strona 5 z 6');
});

test('wyszukiwanie i filtry wracają na stronę 1; nawigator znika dla krótkiej listy', async ({ page }) => {
  await seed(page);
  await openEkwipunek(page);

  await page.getByRole('button', { name: 'Strona 3' }).click();
  await page.getByRole('searchbox', { name: 'Szukaj pozycji' }).fill('UNI-005');

  await expect(page.getByText('10 pozycji')).toBeVisible();
  await expect(page.locator('.pager')).toHaveCount(0); // jedna strona = brak nawigatora (szum UI)
  await expect(page.locator('.srow')).toHaveCount(10);
  await expect(page.locator('.srow').first()).toContainText('UNI-0050');

  await page.getByRole('searchbox', { name: 'Szukaj pozycji' }).fill('');
  await expect(page.getByText('144 pozycji · bez filtrów')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Strona 1' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.srow').first()).toContainText('UNI-0001');
});

test('filtr typu INSTRUMENT: 10 pozycji bez nawigatora (reguła B18 dla filtrów)', async ({ page }) => {
  await seed(page);
  await openEkwipunek(page);

  await page.getByRole('button', { name: 'Strona 4' }).click();
  await page.getByRole('button', { name: /Typ ▾/ }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /🎺 Instrument/ }).click();

  await expect(page.getByText('10 pozycji')).toBeVisible();
  await expect(page.locator('.pager')).toHaveCount(0);
  await expect(page.locator('.srow').first()).toContainText('INS-0001');
});

test.describe('desktop ≥1200px', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('nawigator siedzi pod listą (nie wypada nad przyciski) i nie powoduje poziomego scrolla', async ({ page }) => {
    await seed(page);
    await openEkwipunek(page);

    await expect(page.locator('.pager')).toBeVisible();
    const pagerBox = await page.locator('.pager').boundingBox();
    const lastRow = await page.locator('.srow').nth(24).boundingBox();
    expect(pagerBox).not.toBeNull();
    expect(lastRow).not.toBeNull();
    expect(pagerBox!.y).toBeGreaterThan(lastRow!.y); // order: pułapka ≥1200 — nawigator MUSI być pod wierszami

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'Strona 2' }).click();
    await expect(page.locator('.srow').first()).toContainText('UNI-0026');
  });
});
