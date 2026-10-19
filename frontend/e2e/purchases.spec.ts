import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

/**
 * Segment „Zamówienia” deski (roadmapa 2026-10-19): zakup nowego przedmiotu
 * dla osoby, flow REQUESTED → SENT → IN_PROGRESS → DELIVERED → READY_FOR_PICKUP
 * → RECEIVED, dostawa linkuje pozycję, odbiór przypisuje. Bramka ról jak w
 * PurchaseController: odczyt każdy, zapis ADMIN. Dodatkowo podpowiedź
 * serwisowa w formularzu potrzeby (istniejąca pozycja ≠ zakup).
 */

interface PurchaseAttribute {
  attributeDefId: number; name: string; value: string;
}

interface PurchaseRow {
  id: number; bandId: number; name: string; itemType: string; status: string;
  requestedForMemberId: number; requestedForName: string;
  note: string | null; resolutionNote: string | null;
  createdMemberId: number | null; createdMemberName: string | null;
  attributes: PurchaseAttribute[];
  itemId: number | null; itemSerialNumber: string | null;
  createdAt: string; deliveredAt: string | null; receivedAt: string | null;
}

/** Fixture definicji użytkownika — scenariusz z zalecenia (UNIFORM). */
const ATTR_DEFS = [
  { id: 700, bandId: 7, itemType: 'UNIFORM', name: 'Typ', dataType: 'SELECT', displayOrder: 1, required: true, displayInList: true, options: ['Mundur', 'Koszula'], active: true, dependsOnDefId: null, dependsOnValues: [] },
  { id: 701, bandId: 7, itemType: 'UNIFORM', name: 'Wzrost', dataType: 'NUMBER', displayOrder: 2, required: true, displayInList: false, options: [], active: true, dependsOnDefId: null, dependsOnValues: [] },
  { id: 702, bandId: 7, itemType: 'UNIFORM', name: 'Szerokość ramion', dataType: 'NUMBER', displayOrder: 3, required: false, displayInList: false, options: [], active: true, dependsOnDefId: 700, dependsOnValues: ['Mundur'] },
  { id: 703, bandId: 7, itemType: 'UNIFORM', name: 'Rozmiar kołnierzyka', dataType: 'NUMBER', displayOrder: 4, required: false, displayInList: false, options: [], active: true, dependsOnDefId: 700, dependsOnValues: ['Koszula'] },
];
const DEFS_BY_ID = new Map(ATTR_DEFS.map((d) => [d.id, d] as const));

const ITEM_DETAIL = {
  id: 99, bandId: 7, name: 'Trąbka Jupiter 1100', type: 'INSTRUMENT',
  lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', serialNumber: null,
  description: null, notes: 'Utworzone z zamówienia #1', attributes: [],
  assignedMemberId: null, assignedMemberName: null, nextServiceDate: null,
};

async function mockApi(
  page: Page,
  purchases: PurchaseRow[],
  captured: { statusBodies: Array<Record<string, unknown>>; createBodies: Array<Record<string, unknown>> },
  role: 'ADMIN' | 'MEMBER' = 'ADMIN',
  attrDefs: Array<(typeof ATTR_DEFS)[number]> = [],
) {
  await page.addInitScript(() => {
    sessionStorage.setItem('wi.session', JSON.stringify({
      accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
      user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
    }));
  });
  await page.route('**/api/v1/me/bands', (r) => r.fulfill({ json: [{ bandId: 7, name: 'Orkiestra', role }] }));
  await page.route('**/api/v1/bands/*/members', (r) =>
    r.fulfill({ json: [
      { memberId: 11, firstName: 'Anna', lastName: 'Nowak', active: true, expectedSet: [] },
      { memberId: 12, firstName: 'Bolesław', lastName: 'Kowal', active: true, expectedSet: [] },
    ] }));
  await page.route('**/api/inventory/**', (r) => r.fulfill({ json: [] })); // catch-all FIRST (LIFO!)

  await page.route('**/api/inventory/items/99', (r) => r.fulfill({ json: ITEM_DETAIL }));
  await page.route(/\/api\/inventory\/items(\?.*)?$/, (r) => r.fulfill({ json: [] }));

  await page.route(/\/api\/inventory\/purchases(\?.*)?$/, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: purchases });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    captured.createBodies.push(body);
    const created: PurchaseRow = {
      id: Math.max(0, ...purchases.map((p) => p.id)) + 1, bandId: 7,
      name: body.name as string, itemType: body.itemType as string, status: 'REQUESTED',
      requestedForMemberId: body.requestedForMemberId as number,
      requestedForName: (body.requestedForMemberId as number) === 11 ? 'Anna Nowak' : 'Bolesław Kowal',
      note: (body.note as string) ?? null, resolutionNote: null,
      createdMemberId: body.createdMemberId as number,
      createdMemberName: (body.createdMemberId as number) === 11 ? 'Anna Nowak' : 'Bolesław Kowal',
      attributes: ((body.attributes as PurchaseAttribute[] | undefined) ?? [])
        .filter((a) => a.value !== '')
        .map((a) => ({ ...a, name: DEFS_BY_ID.get(a.attributeDefId)?.name ?? `Atrybut ${a.attributeDefId}` })),
      itemId: null, itemSerialNumber: null,
      createdAt: new Date(Date.now() + 1).toISOString(), deliveredAt: null, receivedAt: null,
    };
    purchases.unshift(created);
    return route.fulfill({ status: 201, json: created });
  });
  await page.route(/\/api\/inventory\/purchases\/\d+\/status$/, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    captured.statusBodies.push(body);
    const p = purchases.find((x) => x.id === Number(new URL(route.request().url()).pathname.split('/')[4]));
    if (!p) return route.fulfill({ status: 404, json: { message: 'brak' } });
    p.status = String(body.status);
    const now = new Date().toISOString();
    if (body.status === 'DELIVERED') {
      p.itemId = 99;
      p.itemSerialNumber = null;
      p.deliveredAt = now;
    }
    if (body.status === 'RECEIVED' || body.status === 'CANCELLED') p.resolutionNote = (body.note as string) ?? null;
    if (body.status === 'RECEIVED') p.receivedAt = now;
    return route.fulfill({ json: p });
  });

  // Definicje atrybutów dla modala zamówienia (rejestrujemy PO catch-allu — LIFO).
  await page.route(/\/api\/inventory\/attribute-defs(\?.*)?$/, (route) => {
    const t = new URL(route.request().url()).searchParams.get('type');
    route.fulfill({ json: attrDefs.filter((d) => !t || d.itemType === t) });
  });

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await page.getByRole('button', { name: 'Zamówienia i serwis' }).click();
  await expect(page.getByRole('heading', { name: 'Zamówienia i serwis' })).toBeVisible();
}

const seed = (): PurchaseRow[] => [
  {
    id: 1, bandId: 7, name: 'Trąbka Jupiter 1100', itemType: 'INSTRUMENT', status: 'REQUESTED',
    requestedForMemberId: 12, requestedForName: 'Bolesław Kowal',
    note: 'na etat pierwszego trębacza', resolutionNote: null,
    createdMemberId: 11, createdMemberName: 'Anna Nowak',
    attributes: [],
    itemId: null, itemSerialNumber: null,
    createdAt: '2026-10-18T10:00:00Z', deliveredAt: null, receivedAt: null,
  },
  {
    id: 2, bandId: 7, name: 'Pasek od munduru', itemType: 'UNIFORM', status: 'IN_PROGRESS',
    requestedForMemberId: 11, requestedForName: 'Anna Nowak',
    note: null, resolutionNote: null,
    createdMemberId: 11, createdMemberName: 'Anna Nowak',
    attributes: [],
    itemId: null, itemSerialNumber: null,
    createdAt: '2026-10-17T09:00:00Z', deliveredAt: null, receivedAt: null,
  },
];

const doSwitch = async (page: Page) => {
  await page.getByRole('tab', { name: 'Zamówienia' }).click();
  await expect(page.getByRole('group', { name: 'Filtry statusów zamówień' })).toBeVisible();
};

test('podpowiedź serwisowa w formularzu potrzeby', async ({ page }) => {
  await mockApi(page, seed(), { statusBodies: [], createBodies: [] });
  await page.getByRole('button', { name: 'Zgłoś potrzebę' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowa potrzeba' });
  await expect(dialog.getByText(/traktuj ją jak/)).toBeVisible();
  await expect(dialog.getByText(/segmentu „Zamówienia”/)).toBeVisible();
});

test('ADMIN przeprowadza zamówienie od zgłoszenia do odbioru', async ({ page }) => {
  const purchases = seed();
  const captured = { statusBodies: [] as Array<Record<string, unknown>>, createBodies: [] as Array<Record<string, unknown>> };
  await mockApi(page, purchases, captured);
  await doSwitch(page);

  const row = page.locator('li', { hasText: 'Pasek od munduru' }).first();
  await expect(row.getByText('W realizacji')).toBeVisible();
  await row.getByRole('button', { name: 'Oznacz dostawę — Pasek od munduru' }).click();
  const dialog = page.getByRole('dialog', { name: /Dostawa: Pasek/ });
  await dialog.getByLabel(/Notatka/).fill('paczka nadana 19.10');
  await dialog.getByRole('button', { name: 'Oznacz dostawę ✓' }).click();
  await expect(row.getByText('Dostarczone')).toBeVisible();
  expect(captured.statusBodies[0]).toEqual({ status: 'DELIVERED', note: 'paczka nadana 19.10' });

  await row.getByRole('button', { name: 'Przygotuj do odbioru — Pasek od munduru' }).click();
  await expect(row.getByText('Do odbioru')).toBeVisible();

  await row.getByRole('button', { name: 'Potwierdź odbiór — Pasek od munduru' }).click();
  const dialog2 = page.getByRole('dialog', { name: /Odbiór osobisty: Pasek/ });
  await expect(dialog2.getByText(/przypisze pozycję osobie/)).toBeVisible();
  await dialog2.getByLabel(/Notatka/).fill('wydano na próbie');
  await dialog2.getByRole('button', { name: 'Potwierdź odbiór ✓' }).click();
  await expect(row.getByText('Odebrane')).toBeVisible();
  await expect(captured.statusBodies.at(-1)).toEqual({ status: 'RECEIVED', note: 'wydano na próbie' });
  // terminalne — żadnej akcji przeprowadzającej w wierszu (zostaje tylko link do pozycji)
  await expect(row.getByRole('button', { name: /Przekaż|Rozpocznij|Oznacz|Przygotuj|Potwierdź|Anuluj/ })).toHaveCount(0);
});

test('dostarczona pozycja otwiera się w Ekwipunku', async ({ page }) => {
  const purchases = seed();
  await mockApi(page, purchases, { statusBodies: [], createBodies: [] });
  await doSwitch(page);
  const row = page.locator('li', { hasText: 'Trąbka Jupiter 1100' }).first();
  // przeprowadź do dostawy
  await row.getByRole('button', { name: 'Przekaż do realizacji — Trąbka Jupiter 1100' }).click();
  await row.getByRole('button', { name: 'Rozpocznij realizację — Trąbka Jupiter 1100' }).click();
  await row.getByRole('button', { name: 'Oznacz dostawę — Trąbka Jupiter 1100' }).click();
  await page.getByRole('dialog', { name: /Dostawa: Trąbka/ }).getByRole('button', { name: 'Oznacz dostawę ✓' }).click();
  await expect(row.getByText('Dostarczone')).toBeVisible();

  await row.getByRole('button', { name: 'Otwórz dostarczoną pozycję Trąbka Jupiter 1100' }).click();
  await expect(page.getByRole('heading', { name: 'Trąbka Jupiter 1100' })).toBeVisible();
});

test('FAB zamówienia: walidacja i payload', async ({ page }) => {
  const purchases = seed();
  const captured = { statusBodies: [] as Array<Record<string, unknown>>, createBodies: [] as Array<Record<string, unknown>> };
  await mockApi(page, purchases, captured);
  await doSwitch(page);

  await page.getByRole('button', { name: 'Zamów nowy przedmiot' }).click();
  const dialog = page.getByRole('dialog', { name: 'Zamów nowy przedmiot' });
  await dialog.getByRole('button', { name: 'Zamów ✓' }).click();
  await expect(dialog.getByText('Podaj nazwę przedmiotu')).toBeVisible();
  await expect(dialog.getByText('Wskaż, dla kogo kupujemy')).toBeVisible();
  expect(captured.createBodies.length).toBe(0);

  await dialog.getByLabel(/Nazwa przedmiotu/).fill('Tuba Alexander');
  await dialog.getByLabel(/Typ/).selectOption('UNIFORM');
  await dialog.getByLabel(/Dla kogo/).selectOption('12');
  await dialog.getByLabel(/Zgłasza/).selectOption('11');
  await dialog.getByLabel(/Notatka/).fill('oferta 4 200 zł');
  await dialog.getByRole('button', { name: 'Zamów ✓' }).click();
  expect(captured.createBodies[0]).toEqual({
    name: 'Tuba Alexander', itemType: 'UNIFORM', requestedForMemberId: 12,
    note: 'oferta 4 200 zł', createdMemberId: 11, attributes: [],
  });
  const nowa = page.locator('li', { hasText: 'Tuba Alexander' }).first();
  await expect(nowa.getByText('Zgłoszone')).toBeVisible();
  await expect(nowa.getByText('dla Bolesław Kowal')).toBeVisible();
});

test('MEMBER widzi zamówienia bez FAB-a i bez akcji', async ({ page }) => {
  await mockApi(page, seed(), { statusBodies: [], createBodies: [] }, 'MEMBER');
  await doSwitch(page);
  await expect(page.getByRole('listitem').filter({ hasText: 'Pasek od munduru' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zamów nowy przedmiot' })).toHaveCount(0);
  await expect(page.locator('li').getByRole('button', { name: /^(Przekaż|Rozpocznij|Oznacz|Przygotuj|Potwierdź|Anuluj)/ })).toHaveCount(0);
});

test('modal zamówienia: atrybuty warunkowe jak w formularzu „Nowa pozycja”', async ({ page }) => {
  const purchases = seed();
  const captured = { statusBodies: [] as Array<Record<string, unknown>>, createBodies: [] as Array<Record<string, unknown>> };
  await mockApi(page, purchases, captured, 'ADMIN', ATTR_DEFS);
  await doSwitch(page);

  await page.getByRole('button', { name: 'Zamów nowy przedmiot' }).click();
  const dialog = page.getByRole('dialog', { name: 'Zamów nowy przedmiot' });
  await dialog.getByLabel(/Nazwa przedmiotu/).fill('Mundur paradny');
  await dialog.getByLabel(/Typ/).selectOption('UNIFORM');

  // Sekcja atrybutów pojawiła się; Typ (SELECT) to chipsy Mundur|Koszula, Wzrost wymagany.
  await expect(dialog.getByText(/Atrybuty przedmiotu/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Mundur' })).toBeVisible();
  await expect(dialog.getByLabel(/Wzrost/)).toBeVisible();
  await expect(dialog.getByLabel(/Szerokość ramion/)).toHaveCount(0); // gałąź Mundur jeszcze nieaktywna

  // Koszula: kołnierz widać, szerokości ramion nie — wypełnij gałąź Koszuli…
  await dialog.getByRole('button', { name: 'Koszula' }).click();
  await expect(dialog.getByLabel(/Rozmiar kołnierzyka/)).toBeVisible();
  await dialog.getByLabel(/Rozmiar kołnierzyka/).fill('39');

  // …potem wróć do Munduru: ukryte pole znika i jego wartość NIE trafia do payloadu.
  await dialog.getByRole('button', { name: 'Mundur' }).click();
  await expect(dialog.getByLabel(/Rozmiar kołnierzyka/)).toHaveCount(0);
  await dialog.getByLabel(/Wzrost/).fill('180');
  await expect(dialog.getByLabel(/Szerokość ramion/)).toBeVisible();
  await dialog.getByLabel(/Szerokość ramion/).fill('45');

  await dialog.getByLabel(/Dla kogo/).selectOption('12');
  await dialog.getByLabel(/Zgłasza/).selectOption('11');
  await dialog.getByRole('button', { name: 'Zamów ✓' }).click();

  expect(captured.createBodies[0].attributes).toEqual([
    { attributeDefId: 700, value: 'Mundur' },
    { attributeDefId: 701, value: '180' },
    { attributeDefId: 702, value: '45' },
    // 703 (kołnierz=39) nie ma — gałąź była ukryta w momencie wysyłki
  ]);
  const nowa = page.locator('li', { hasText: 'Mundur paradny' }).first();
  await expect(nowa.getByText('Typ Mundur · Wzrost 180 · Szerokość ramion 45')).toBeVisible();
});

test('modal zamówienia: brak wypełnionych atrybutów wymaganych blokuje wysyłkę', async ({ page }) => {
  const captured = { statusBodies: [] as Array<Record<string, unknown>>, createBodies: [] as Array<Record<string, unknown>> };
  await mockApi(page, seed(), captured, 'ADMIN', ATTR_DEFS);
  await doSwitch(page);

  await page.getByRole('button', { name: 'Zamów nowy przedmiot' }).click();
  const dialog = page.getByRole('dialog', { name: 'Zamów nowy przedmiot' });
  await dialog.getByLabel(/Nazwa przedmiotu/).fill('Koszula');
  await dialog.getByLabel(/Typ/).selectOption('UNIFORM');
  await dialog.getByLabel(/Dla kogo/).selectOption('12');
  await dialog.getByLabel(/Zgłasza/).selectOption('11');
  await dialog.getByRole('button', { name: 'Zamów ✓' }).click();

  // Te same komunikaty co w „Nowej pozycji” — bez załamania na 400 (wording z form.ts).
  await expect(dialog.getByText(/„Typ" jest wymagany/)).toBeVisible();
  await expect(dialog.getByText(/„Wzrost" jest wymagany/)).toBeVisible();
  expect(captured.createBodies.length).toBe(0);
});
