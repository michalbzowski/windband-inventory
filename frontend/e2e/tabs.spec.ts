import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Strażnik nawigacji między zakładkami. Rejestr błędu: LiczenieTab renderował
 * <Tabs> tylko z onLiczenie — przyciski Pulpit/Ekwipunek/Moje miały
 * onClick={undefined} i nie reagowały (użytkownik uwięziony na zakładce).
 * Test klika cyklem przez wszystkie zakładki z każdego miejsca, w tym z
 * gate'u tożsamości i z ekranu szczegółów pozycji (ItemDetail miał onPulpit
 * prowadzący do listy, nie do pulpitu).
 */

const BAND = { bandId: 1, name: 'Orkiestra', role: 'ADMIN' };
const MEMBER = { memberId: 12, firstName: 'Anna', lastName: 'Nowak', active: true, expectedSet: [{ instrument: 'Flet', primary: true }] };
const ITEM = {
  id: 1, bandId: 1, name: 'Flet koncertowy', type: 'INSTRUMENT', lifecycleStatus: 'AVAILABLE',
  warehouse: 'MAIN', serialNumber: 'FL-1', description: null, notes: null, attributes: [],
  assignedMemberId: null, assignedMemberName: null, nextServiceDate: null,
};

async function json(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}

async function mockBase(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'wi.session',
      JSON.stringify({
        accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
        user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
      }),
    );
  });
  await page.route('**/api/v1/me/bands', (r) => json(r, [BAND]));
  await page.route('**/api/v1/bands/*/members', (r) => json(r, [MEMBER]));
  // catch-all PRZED handlerami szczegółowymi — Playwright matching jest LIFO
  await page.route('**/api/inventory/**', (r) => json(r, []));
  await page.route(/\/api\/inventory\/items/, (route) => {
    const p = new URL(route.request().url()).pathname.replace('/api/inventory', '');
    const m = p.match(/^\/items\/(\d+)(\/.*)?$/);
    if (m) return json(route, m[2] ? [] : ITEM); // detal = obiekt, zagnieżdżone = listy
    return json(route, [ITEM]);
  });
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Nawigacja główna' });

test('cykl przez wszystkie zakładki — z Liczenia też da się wyjść', async ({ page }) => {
  await mockBase(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Orkiestra' })).toBeVisible();

  // Pulpit → Liczenie (gate tożsamości:Tabs musza działać też tutaj)
  await nav(page).getByRole('button', { name: '🧮 Liczenie' }).click();
  await expect(page.getByRole('heading', { name: 'Kim jesteś na czas spisu?' })).toBeVisible();
  await nav(page).getByRole('button', { name: '📋 Pulpit' }).click();
  await expect(page.getByRole('heading', { name: 'Orkiestra' })).toBeVisible();

  // → Liczenie hub
  await nav(page).getByRole('button', { name: '🧮 Liczenie' }).click();
  await page.getByRole('button', { name: /Anna Nowak/ }).click();
  await expect(page.getByRole('heading', { name: 'Liczenie' })).toBeVisible();

  // Liczenie → Ekwipunek → Moje → Liczenie → Ekwipunek → Pulpit
  await nav(page).getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await expect(page.getByRole('heading', { name: 'Ekwipunek' })).toBeVisible();
  await nav(page).getByRole('button', { name: '👤 Konto' }).click();
  await expect(page.getByRole('heading', { name: 'Konto' })).toBeVisible();
  await nav(page).getByRole('button', { name: '🧮 Liczenie' }).click();
  await expect(page.getByRole('heading', { name: 'Liczenie' })).toBeVisible();
  await nav(page).getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await expect(page.getByRole('heading', { name: 'Ekwipunek' })).toBeVisible();
  await nav(page).getByRole('button', { name: '📋 Pulpit' }).click();
  await expect(page.getByRole('heading', { name: 'Orkiestra' })).toBeVisible();
});

test('ItemDetail: tryb pracy — bez szyny Tabs, powrót „‹ Wróć do listy”, nawigacja z listy', async ({ page }) => {
  await mockBase(page);
  await page.goto('/');

  await nav(page).getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await expect(page.getByRole('heading', { name: 'Ekwipunek' })).toBeVisible();

  await page.getByRole('button', { name: /Pozycja FL-1/ }).click();
  await expect(page.getByRole('heading', { name: /FL-1/ })).toBeVisible();

  // konwencja ekranów pracy (jak liczenie): jedyna dolna szyna to akcje pozycji
  await expect(nav(page)).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Akcje pozycji' })).toBeVisible();

  await page.getByRole('button', { name: /Wróć do listy/ }).click();
  await expect(page.getByRole('heading', { name: 'Ekwipunek' })).toBeVisible();
  await expect(nav(page)).toBeVisible();

  // dalej do pulpitu z listy (nie z drill-down)
  await nav(page).getByRole('button', { name: '📋 Pulpit' }).click();
  await expect(page.getByRole('heading', { name: 'Orkiestra' })).toBeVisible();
});
