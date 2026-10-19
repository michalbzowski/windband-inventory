import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Zakładka „Konto” (dawniej „Moje”) — grupy tożsamości/sesji jako spójne kafle (reguła bliższości):
 * para „etykieta + wartość” w jednym klocku; przycisk „Zmień osobę” należy do
 * kafelka tożsamości (wcześniej „zjadał” koniec wartości w luźnym .kv); akcje
 * sesji (Zmień zespół / Wyloguj) siedzą W panelu Sesja, nie wisiły pod spodem.
 */

test.use({ viewport: { width: 1280, height: 720 } });

const json = (route: Route, data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem('wi.session', JSON.stringify({
      accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
      user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
    }));
  });
  await page.route('**/api/v1/me/bands', (r) => json(r, [{ bandId: 1, name: 'Orkiestra Dęta Strażaków', role: 'ADMIN' }]));
  await page.route('**/api/v1/bands/*/members', (r) => json(r, []));
  await page.route('**/api/inventory/**', (r) => json(r, []));
  await page.goto('/');
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Nawigacja główna' });

test('„Konto”: tożsamość i sesja są zamknięte w kaflach; akcje siedzą we właściwych grupach', async ({ page }) => {
  await boot(page);
  await nav(page).getByRole('button', { name: '☺ Konto' }).click();
  await expect(page.getByRole('heading', { name: 'Konto' })).toBeVisible();

  const tozsamosc = page.locator('.panel', { hasText: 'Tożsamość liczącego' });
  // para zespół: wartość i etykieta w jednym kafelku
  const tileZespol = tozsamosc.locator('.tile', { hasText: 'Zespół' });
  await expect(tileZespol).toContainText('Orkiestra Dęta Strażaków · ADMIN');
  const tileJa = tozsamosc.locator('.tile', { hasText: 'Liczę jako' });
  await expect(tileJa).toContainText('Nie wybrano');

  // pusta kolejka → CTA nieaktywne, ale należy do panelu kolejkowego
  const kolejka = page.locator('.panel', { hasText: 'Kolejka offline' });
  await expect(kolejka.getByRole('button', { name: 'Przejdź do liczenia' })).toBeDisabled();

  // akcje zespołu/sesji W panelu Sesja — nie rozrzucone po sekcji
  const sesja = page.locator('.panel', { hasText: 'Sesja i synchronizacja' });
  await expect(sesja).toContainText('żywa sesja ✓');
  await expect(sesja).toContainText('◇ włączony');
  await expect(sesja.getByRole('button', { name: 'Zmień zespół' })).toBeVisible();
  await expect(sesja.getByRole('button', { name: 'Wyloguj' })).toBeVisible();

  // pozostałe luźne pary .kv na tej stronie nie występują
  await expect(page.locator('.kv')).toHaveCount(0);
});
