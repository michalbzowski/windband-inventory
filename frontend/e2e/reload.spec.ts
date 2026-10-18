import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Strażnik zachowania po odświeżeniu (F5): użytkownik ≥2 zespołów, który
 * pracuje na dowolnej zakładce, MUSI wrócić na ten sam zespół i tę samą
 * zakładkę — nigdy nie może być cofnięty do menu wyboru zespołu.
 */

const BANDS = [
  { bandId: 1, name: 'Orkiestra Dęta', role: 'ADMIN' },
  { bandId: 2, name: 'Chór Kameralny', role: 'MEMBER' },
];

/** Pozycje różne per zespół — po restoracji widać, KTÓRY zespół odzyskano. */
function itemsFor(bandId: number) {
  const name = bandId === 2 ? 'Kontrabas' : 'Tamburyn';
  return [
    {
      id: bandId * 10 + 1, name, type: 'INSTRUMENT', lifecycleStatus: 'AVAILABLE',
      warehouse: 'MAIN', serialNumber: null, assignedMemberId: null, assignedMemberName: null,
    },
  ];
}

async function json(route: Route, data: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
}

async function seed(page: Page, extraStorage: Record<string, string> = {}): Promise<void> {
  await page.addInitScript(
    ({ extra }) => {
      sessionStorage.setItem(
        'wi.session',
        JSON.stringify({
          accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
          user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
        }),
      );
      for (const [k, v] of Object.entries(extra)) sessionStorage.setItem(k, v);
    },
    { extra: extraStorage },
  );
  await page.route('**/api/v1/me/bands', (r) => json(r, BANDS));
  await page.route('**/api/v1/bands/*/members', (r) => json(r, []));
  await page.route('**/api/inventory/**', (r) => {
    const url = new URL(r.request().url());
    const p = url.pathname.replace('/api/inventory', '');
    if (p.startsWith('/items')) {
      return json(r, itemsFor(Number(url.searchParams.get('bandId') ?? '0')));
    }
    return json(r, []);
  });
}

const picker = (page: Page) => page.getByRole('listbox', { name: 'Twoje zespoły' });

test('F5 na zakładce Ekwipunek w zespole 2 → ten sam zespół i ta sama zakładka', async ({ page }) => {
  await seed(page);
  await page.goto('/');

  // dwa zespoły na koncie → start to picker
  await expect(picker(page)).toBeVisible();
  await page.getByRole('option', { name: /Chór Kameralny/ }).click();
  await expect(page.getByRole('heading', { name: 'Chór Kameralny' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '♧ Ekwipunek' }).click();
  await expect(page.getByRole('heading', { name: 'Ekwipunek' })).toBeVisible();
  await expect(page.getByText('Kontrabas')).toBeVisible(); // pozycje należą do zespołu 2

  await page.reload();

  // brak cofnięcia do pickera; wciąż zespół 2 na zakładce Ekwipunek
  await expect(picker(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ekwipunek' })).toBeVisible();
  await expect(page.getByText('Kontrabas')).toBeVisible();
  await expect(page.getByText('Tamburyn')).toHaveCount(0);
});

test('F5 bez wcześniejszego wyboru → picker pozostaje pickerem', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await expect(picker(page)).toBeVisible();
  await page.reload();
  await expect(picker(page)).toBeVisible();
});

test('klucz z nieistniejącym zespołem → picker, a nie pusty ekran; klucz sprzątany', async ({ page }) => {
  await seed(page, { 'wi.selectedBand': JSON.stringify({ bandId: 999, name: 'Widmo', role: 'ADMIN' }) });
  await page.goto('/');
  await expect(picker(page)).toBeVisible();
  const staleKey = await page.evaluate(() => sessionStorage.getItem('wi.selectedBand'));
  expect(staleKey, 'nieaktualny klucz wyboru musi zostać wyczyszczony').toBeNull();
});
