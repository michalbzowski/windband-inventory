import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Ekran „Definicje atrybutów” (B6): ADMIN CRUD na zamyce istniejącego API.
 * Mock utrzymuje stan definicji w pamięci testu — pełny cykl: tworzenie
 * (walidacja + duplikaty), edycja (typ danych nietykalny), wyłączenie/przywrócenie.
 */

const BAND = { bandId: 1, name: 'Orkiestra Dęta', role: 'ADMIN' };

interface DefRow {
  id: number; bandId: number; itemType: string; name: string; dataType: string;
  displayOrder: number; required: boolean; displayInList: boolean; options: string[]; active: boolean;
}

async function json(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}

async function mockApi(page: Page, band: { bandId: number; name: string; role: string }, defs: DefRow[]): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'wi.session',
      JSON.stringify({
        accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
        user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
      }),
    );
  });
  await page.route('**/api/v1/me/bands', (r) => json(r, [band]));
  await page.route('**/api/v1/bands/*/members', (r) => json(r, []));
  await page.route('**/api/inventory/**', (r) => json(r, []));
  await page.route(/\/api\/inventory\/attribute-defs/, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();

    const byId = ((): number | null => {
      const m = url.pathname.match(/\/attribute-defs\/(\d+)$/);
      return m ? Number(m[1]) : null;
    })();

    if (method === 'GET' && byId === null) {
      const bandId = Number(url.searchParams.get('bandId'));
      const type = url.searchParams.get('type');
      const all = url.searchParams.get('all') === 'true';
      return json(route, defs.filter(
        (d) => d.bandId === bandId && (!type || d.itemType === type) && (all || d.active),
      ));
    }
    if (method === 'POST' && byId === null) {
      const body = req.postDataJSON() as Partial<DefRow>;
      const bandId = Number(url.searchParams.get('bandId'));
      const clash = defs.some((d) =>
        d.bandId === bandId && d.itemType === body.itemType && d.active
        && d.name.toLowerCase() === (body.name ?? '').trim().toLowerCase());
      if (clash) {
        return json(route, { message: `Atrybut „${body.name}” już istnieje w tym zespole` }, 409);
      }
      const def: DefRow = {
        id: Math.max(0, ...defs.map((d) => d.id)) + 1,
        bandId, itemType: body.itemType!, name: (body.name ?? '').trim(), dataType: body.dataType!,
        displayOrder: body.displayOrder ?? 0, required: body.required ?? false,
        displayInList: body.displayInList ?? false, options: body.options ?? [], active: true,
      };
      defs.push(def);
      return json(route, def, 201);
    }
    if (method === 'PUT' && byId !== null) {
      const def = defs.find((d) => d.id === byId);
      if (!def) return json(route, { message: 'nie znaleziono' }, 404);
      const body = req.postDataJSON() as Partial<DefRow>;
      if (body.name) def.name = body.name.trim();
      if (body.displayOrder != null) def.displayOrder = body.displayOrder;
      if (body.required != null) def.required = body.required;
      if (body.displayInList != null) def.displayInList = body.displayInList;
      if (body.options != null) def.options = body.options;
      if (body.active != null) def.active = body.active;
      return json(route, def);
    }
    if (method === 'DELETE' && byId !== null) {
      const def = defs.find((d) => d.id === byId);
      if (!def) return json(route, {}, 404);
      def.active = false;
      return route.fulfill({ status: 204, body: '' });
    }
    return json(route, { message: `nieobsłużone ${method} ${url.pathname}` }, 500);
  });
}

const def = (over: Partial<DefRow>): DefRow => ({
  id: 1, bandId: 1, itemType: 'INSTRUMENT', name: 'Numer fabryczny', dataType: 'TEXT',
  displayOrder: 0, required: false, displayInList: false, options: [], active: true, ...over,
});

test('ADMIN: pełny cykl definicji — tworzenie, edycja, wyłączanie, duplikat', async ({ page }) => {
  const defs: DefRow[] = [def({})];
  await mockApi(page, BAND, defs);
  await page.goto('/');

  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '♧ Ekwipunek' }).click();
  await page.getByRole('button', { name: 'Definicje atrybutów' }).click();
  await expect(page.getByRole('heading', { name: 'Definicje atrybutów' })).toBeVisible();
  await expect(page.getByText('Numer fabryczny')).toBeVisible(); // INSTRUMENT — widok domyślny

  // zmiana typu → pusto
  await page.getByRole('button', { name: '👕 Umundrowanie' }).click();
  await expect(page.getByText('Brak definicji dla tego typu.')).toBeVisible();

  // tworzenie z walidacją: SELECT bez opcji odrzucony lokalnie
  await page.getByRole('button', { name: 'Nowa definicja atrybutu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowa definicja atrybutu' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^Nazwa/).fill('Rozmiar');
  await dialog.getByLabel(/Typ danych/).selectOption('SELECT');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dialog.getByText('Podaj co najmniej jedną opcję')).toBeVisible();

  // uzupełnienie → zapis
  await dialog.getByLabel(/Opcje/).fill('S\nM\nL\nM'); // duplikat 'M' → deduplikacja po stronie klienta
  await dialog.getByLabel(/^Wymagany/).selectOption('1');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'Rozmiar' });
  await expect(row).toBeVisible();
  await expect(row.getByText(/3 opcji/)).toBeVisible();
  await expect(row.getByText(/wymagany/)).toBeVisible();

  // edycja: nazwa + wymagany; typ danych zablokowany
  await row.getByRole('button', { name: 'Edytuj definicję Rozmiar' }).click();
  const edit = page.getByRole('dialog', { name: 'Edycja · Rozmiar' });
  await expect(edit.getByLabel(/Typ danych/)).toBeDisabled();
  await edit.getByLabel(/^Nazwa/).fill('Rozmiar kołnierza');
  await edit.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Rozmiar kołnierza')).toBeVisible();

  // wyłączenie → przywrócenie
  const row2 = page.getByRole('listitem').filter({ hasText: 'Rozmiar kołnierza' });
  await row2.getByRole('button', { name: 'Wyłącz definicję Rozmiar kołnierza' }).click();
  await expect(row2.getByText('wyłączony')).toBeVisible();
  await row2.getByRole('button', { name: 'Przywróć definicję Rozmiar kołnierza' }).click();
  await expect(row2.getByText('wyłączony')).toHaveCount(0);

  // duplikat nazwy (wielkość liter bez znaczenia) → błąd z serwera
  await page.getByRole('button', { name: 'Nowa definicja atrybutu' }).click();
  await dialog.getByLabel(/^Nazwa/).fill('rozmiar kołnierza');
  await dialog.getByLabel(/Typ danych/).selectOption('TEXT');
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText(/już istnieje/)).toBeVisible();

  // spójność z filtrem: wyłączona definicja znikałaby z aktywnej listy — tu aktywna = widoczna
  await dialog.getByRole('button', { name: 'Anuluj' }).click();
  await page.getByRole('button', { name: 'Wróć do listy' }).click();
  await page.getByRole('button', { name: 'Atrybut ▾' }).click();
  await expect(page.getByRole('dialog', { name: 'Filtr: atrybut' }).getByText('Rozmiar kołnierza (UNIFORM)')).toBeVisible();

  // magazyn mocka dostał realne wywołania — definicja UNIFORM istnieje i jest aktywna
  expect(defs.some((d) => d.itemType === 'UNIFORM' && d.name === 'Rozmiar kołnierza' && d.active)).toBe(true);
});

test('MEMBER: brak wejścia w definicje', async ({ page }) => {
  await mockApi(page, { bandId: 1, name: 'Orkiestra Dęta', role: 'MEMBER' }, [def({})]);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '♧ Ekwipunek' }).click();
  await expect(page.getByRole('button', { name: 'Definicje atrybutów' })).toHaveCount(0);
});

test('pusty stan: wejście z poziomu sheetu „Filtr: atrybut”', async ({ page }) => {
  await mockApi(page, BAND, []);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '♧ Ekwipunek' }).click();
  await page.getByRole('button', { name: 'Atrybut ▾' }).click();
  await expect(page.getByText('Brak definicji atrybutów')).toBeVisible();
  await page.getByRole('button', { name: '⚙ Otwórz definicje atrybutów' }).click();
  await expect(page.getByRole('heading', { name: 'Definicje atrybutów' })).toBeVisible();
});
