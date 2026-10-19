import { test, expect, type Page, type Route } from '@playwright/test';

// v1.x #6 — skaner etykiet + wydruk etykiety pozycji (kod WI-{band}-{id}).
test.use({ viewport: { width: 1280, height: 900 } });

const BAND = { bandId: 1, name: 'Orkiestra', role: 'ADMIN' };
const ITEM = {
  id: 1, bandId: 1, name: 'Flet koncertowy', type: 'INSTRUMENT', lifecycleStatus: 'ASSIGNED',
  warehouse: 'MAIN', serialNumber: 'FL-1', description: null, notes: null, attributes: [],
  assignedMemberId: 22, assignedMemberName: 'Nadia Białas', nextServiceDate: null,
};

async function ok(route: Route, data: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('wi.session', JSON.stringify({
      accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
      user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
    }));
  });
  await page.route('**/api/v1/me/bands', (r) => ok(r, [BAND]));
  await page.route('**/api/inventory/**', (r) => ok(r, []));
  // kolejność rejestracji LIFO: konkretne drogi potem → mają pierwszeństwo
  await page.route(/\/api\/inventory\/items\/1\/assignments(\?.*)?$/, (r) => ok(r, []));
  await page.route(/\/api\/inventory\/items\/1(\?.*)?$/, (r) => ok(r, ITEM));
  await page.route(/\/api\/inventory\/items\?/ , (r) => ok(r, [ITEM]));
  await page.route(/^.*\/api\/inventory\/items$/, (r) => ok(r, [ITEM]));
});

async function openEkwipunek(page: Page): Promise<void> {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Nawigacja główna' });
  await nav.getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await expect(page.getByRole('heading', { name: 'Ekwipunek' })).toBeVisible();
}

test('skaner: ręczny kod WI-1-1 otwiera pozycję', async ({ page }) => {
  await openEkwipunek(page);
  await page.getByRole('button', { name: 'Skanuj kod etykiety' }).click();
  await expect(page.getByRole('heading', { name: 'Skanuj etykietę' })).toBeVisible();

  await page.getByLabel('Kod etykiety lub link do pozycji').fill('WI-1-1');
  await page.getByRole('button', { name: 'Otwórz pozycję' }).click();

  await expect(page.getByRole('heading', { name: /Flet koncertowy/ })).toBeVisible();
});

test('skaner: link do pozycji z parametrem band także otwiera', async ({ page }) => {
  await openEkwipunek(page);
  await page.getByRole('button', { name: 'Skanuj kod etykiety' }).click();
  await page.getByLabel('Kod etykiety lub link do pozycji')
    .fill('https://inventory.bandmanager.pl/items/1?band=1');
  await page.getByRole('button', { name: 'Otwórz pozycję' }).click();
  await expect(page.getByRole('heading', { name: /Flet koncertowy/ })).toBeVisible();
});

test('skaner: kod z innego zespołu jest twardo odrzucony', async ({ page }) => {
  await openEkwipunek(page);
  await page.getByRole('button', { name: 'Skanuj kod etykiety' }).click();
  await page.getByLabel('Kod etykiety lub link do pozycji').fill('WI-2-1');
  await page.getByRole('button', { name: 'Otwórz pozycję' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('innego zespołu');
  // nadal na skanerze
  await expect(page.getByRole('heading', { name: 'Skanuj etykietę' })).toBeVisible();
});

test('skaner: nieznany kształt kodu → komunikat, pozostajemy na miejscu', async ({ page }) => {
  await openEkwipunek(page);
  await page.getByRole('button', { name: 'Skanuj kod etykiety' }).click();
  await page.getByLabel('Kod etykiety lub link do pozycji').fill('hej');
  await page.getByRole('button', { name: 'Otwórz pozycję' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Nierozpoznany kod');
  await expect(page.getByRole('heading', { name: 'Skanuj etykietę' })).toBeVisible();
});

test('etykieta: ADMIN widzi QR + kod i może zamknąć sheet', async ({ page }) => {
  await openEkwipunek(page);
  await page.getByRole('button', { name: 'Pozycja Flet koncertowy' }).click();
  await expect(page.getByRole('heading', { name: /Flet koncertowy/ })).toBeVisible();

  await page.getByRole('button', { name: 'Etykieta pozycji — wydrukuj kod QR' }).click();
  const dialog = page.getByRole('dialog', { name: 'Etykieta pozycji' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img.label-qr')).toHaveAttribute('src', /^data:image\/png;base64/);
  await expect(dialog.locator('.label-code')).toContainText('WI-1-1');

  await page.getByRole('button', { name: 'Zamknij' }).click();
  await expect(dialog).not.toBeVisible();
});

test('etykieta: MEMBER nie ma przycisku wydruku (strefa akcyjna ADMIN)', async ({ page }) => {
  // nowa sesja z rolą MEMBER na tym bandzie (trasa ma pierwszeństwo — LIFO)
  await page.route('**/api/v1/me/bands', (r) => ok(r, [{ ...BAND, role: 'MEMBER' }]));

  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Nawigacja główna' });
  await nav.getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await expect(page.getByRole('heading', { name: 'Ekwipunek' })).toBeVisible();
  await page.getByRole('button', { name: /Flet koncertowy/ }).click();
  await expect(page.getByRole('heading', { name: /Flet koncertowy/ })).toBeVisible();

  // etykieta (strefa akcyjna) jest ukryta dla MEMBER; dane nadal czytelne
  expect(await page.getByRole('button', { name: /Etykieta pozycji/ }).count()).toBe(0);
});
