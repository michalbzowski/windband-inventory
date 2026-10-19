import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

/**
 * Liczniki Pulpitu (roadmapa: panel „w budowie” → prawdziwe dane):
 * cztery kafle z realnymi liczbami z API listujących + deep-linki
 * (planża potrzeb, filtr ASSIGNED, filtr serviceDue) do Ekwipunku.
 */

const item = (id: number, name: string, status: string) => ({
  id, name, type: 'UNIFORM', serialNumber: null, lifecycleStatus: status,
  warehouse: 'MAIN', assignedName: null,
});

async function boot(page: Page, captured: { itemQueries: string[] }) {
  await page.addInitScript(() => {
    sessionStorage.setItem('wi.session', JSON.stringify({
      accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
      user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
    }));
  });
  await page.route('**/api/v1/me/bands', (r) => r.fulfill({ json: [{ bandId: 7, name: 'Orkiestra', role: 'ADMIN' }] }));
  await page.route('**/api/v1/bands/*/members', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/inventory/stocktakes*', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/inventory/needs*', (r) => r.fulfill({ json: [
    { id: 1, bandId: 7, itemId: 5, name: 'Trąbka', serialNumber: null, quantity: 1, status: 'OPEN',
      note: null, resolutionNote: null, createdMemberId: null, createdMemberName: null,
      createdAt: '2026-10-15T10:00:00Z', resolvedAt: null },
    { id: 2, bandId: 7, itemId: 6, name: 'Futerał', serialNumber: null, quantity: 1, status: 'ORDERED',
      note: null, resolutionNote: null, createdMemberId: null, createdMemberName: null,
      createdAt: '2026-10-16T10:00:00Z', resolvedAt: null },
    { id: 3, bandId: 7, itemId: 7, name: 'Klaveta', serialNumber: null, quantity: 1, status: 'RECEIVED',
      note: null, resolutionNote: null, createdMemberId: null, createdMemberName: null,
      createdAt: '2026-10-14T10:00:00Z', resolvedAt: '2026-10-17T10:00:00Z' },
  ] }));
  await page.route(/\/api\/inventory\/items(\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    captured.itemQueries.push(url.search);
    const status = url.searchParams.get('status');
    const due = url.searchParams.get('serviceDue');
    const rows = due === 'true'
      ? [item(8, 'Śrubokręt serwisowy', 'AVAILABLE')]
      : status === 'ASSIGNED'
        ? [item(9, 'Mundur galowy', 'ASSIGNED'), item(10, 'Czapka', 'ASSIGNED'), item(11, 'Koszula', 'ASSIGNED')]
        : [item(5, 'Trąbka', 'AVAILABLE'), item(6, 'Futerał', 'AVAILABLE'), item(7, 'Klaveta', 'AVAILABLE'),
           item(8, 'Śrubokręt serwisowy', 'AVAILABLE'), item(9, 'Mundur galowy', 'ASSIGNED'),
           item(10, 'Czapka', 'ASSIGNED'), item(11, 'Koszula', 'ASSIGNED')];
    return route.fulfill({ json: rows });
  });

  await page.goto('/');
  return captured;
}

const counter = (page: Page, aria: string) => page.getByRole('button', { name: aria });

test('liczniki pokazują prawdziwe liczby zamiast „w budowie”', async ({ page }) => {
  await boot(page, { itemQueries: [] });
  // wartość siedzi w <span> kafelka (ikona), etykieta — za nim; para = jeden kafel
  await expect(counter(page, 'Pokaż wszystkie pozycje').locator('span')).toHaveText('7');
  await expect(counter(page, 'Pokaż pozycje z aktywnym przydziałem').locator('span')).toHaveText('3');
  await expect(counter(page, 'Otwórz planszę zamówień i serwisu').locator('span')).toHaveText('2');
  await expect(counter(page, 'Pokaż pozycje z terminem serwisu').locator('span')).toHaveText('1');
  await expect(page.getByText('w budowie')).toHaveCount(0);
});

test('licznik potrzeb prowadzi prosto na planszę Zamówień i serwisu, bez drugiego wklejenia po powrocie', async ({ page }) => {
  await boot(page, { itemQueries: [] });
  await counter(page, 'Otwórz planszę zamówień i serwisu').click();
  await expect(page.getByRole('heading', { name: 'Zamówienia i serwis' })).toBeVisible();
  // wracamy do listy i wychodzimy na pulpit — powrót na zakładkę nie może otworzyć planży ponownie
  await page.getByRole('button', { name: 'Wróć', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Szukaj pozycji' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '📋 Pulpit' }).click();
  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await expect(page.getByRole('searchbox', { name: 'Szukaj pozycji' })).toBeVisible();
});

test('licznik przydziałów wchodzi do Ekwipunku z filtrem ASSIGNED', async ({ page }) => {
  const captured = { itemQueries: [] as string[] };
  await boot(page, captured);
  await counter(page, 'Pokaż pozycje z aktywnym przydziałem').click();
  await expect(page.getByText('Mundur galowy')).toBeVisible();
  await expect(page.getByText('Trąbka')).toHaveCount(0);
  expect(captured.itemQueries.some((q) => q.includes('status=ASSIGNED'))).toBe(true);
  await expect(page.getByText('filtr: Status = Przypisane')).toBeVisible();
});

test('licznik serwisu wchodzi z filtrem serviceDue', async ({ page }) => {
  const captured = { itemQueries: [] as string[] };
  await boot(page, captured);
  await counter(page, 'Pokaż pozycje z terminem serwisu').click();
  await expect(page.getByText('Śrubokręt serwisowy')).toBeVisible();
  expect(captured.itemQueries.some((q) => q.includes('serviceDue=true'))).toBe(true);
});
