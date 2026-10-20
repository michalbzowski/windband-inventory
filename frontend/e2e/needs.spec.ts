import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

/**
 * Plansza „Zamówienia i serwis” (backlog v1.x #3): filtry statusów,
 * przepływ OPEN → ORDERED → RECEIVED/CANCELLED z notką, ręczne zgłoszenie
 * z pickiem pozycji i zgłaszającego, bramka ról (zapis tylko ADMIN).
 */

interface NeedRow {
  id: number; bandId: number; itemId: number; name: string; serialNumber: string | null;
  quantity: number; status: string; note: string | null; resolutionNote: string | null;
  createdMemberId: number | null; createdMemberName: string | null;
  createdAt: string; resolvedAt: string | null;
}

async function mockApi(page: Page, needs: NeedRow[], captured: { statusBodies: Array<Record<string, unknown>>; createBodies: Array<Record<string, unknown>> }) {
  await page.addInitScript(() => {
    sessionStorage.setItem('wi.session', JSON.stringify({
      accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
      user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
    }));
  });
  await page.route('**/api/v1/me/bands', (r) => r.fulfill({ json: [{ bandId: 7, name: 'Orkiestra', role: 'ADMIN' }] }));
  await page.route('**/api/v1/bands/*/members', (r) =>
    r.fulfill({ json: [
      { memberId: 11, firstName: 'Anna', lastName: 'Nowak', active: true, expectedSet: [] },
      { memberId: 12, firstName: 'Bolesław', lastName: 'Kowal', active: true, expectedSet: [] },
    ] }));
  await page.route('**/api/inventory/**', (r) => r.fulfill({ json: [] })); // catch-all FIRST (LIFO!)

  await page.route(/\/api\/inventory\/items(\?.*)?$/, (r) => r.fulfill({ json: [
    { id: 5, name: 'Trąbka Jupiter 1100', type: 'INSTRUMENT', serialNumber: 'TR-11', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', assignedName: null },
    { id: 6, name: 'Futerał transportowy', type: 'EQUIPMENT', serialNumber: null, lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', assignedName: null },
  ] }));

  await page.route(/\/api\/inventory\/needs(\?.*)?$/, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: needs });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    captured.createBodies.push(body);
    const item = needs.length; // liczba tylko dla unikalności id
    const created: NeedRow = {
      id: Math.max(0, ...needs.map((n) => n.id)) + 1, bandId: 7,
      itemId: body.itemId as number,
      name: (body.itemId as number) === 5 ? 'Trąbka Jupiter 1100' : 'Futerał transportowy',
      serialNumber: (body.itemId as number) === 5 ? 'TR-11' : null,
      quantity: body.quantity as number, status: 'OPEN',
      note: (body.note as string) ?? null, resolutionNote: null,
      createdMemberId: body.createdMemberId as number,
      createdMemberName: (body.createdMemberId as number) === 11 ? 'Anna Nowak' : 'Bolesław Kowal',
      createdAt: new Date(Date.now() + item).toISOString(), resolvedAt: null,
    };
    needs.unshift(created);
    return route.fulfill({ status: 201, json: created });
  });
  await page.route(/\/api\/inventory\/needs\/\d+\/status$/, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    captured.statusBodies.push(body);
    const need = needs.find((n) => n.id === Number(new URL(route.request().url()).pathname.split('/')[4]));
    if (!need) return route.fulfill({ status: 404, json: { message: 'brak' } });
    need.status = String(body.status);
    if (body.status === 'RECEIVED' || body.status === 'CANCELLED') {
      need.resolutionNote = (body.note as string) ?? null;
      need.resolvedAt = new Date().toISOString();
    }
    return route.fulfill({ json: need });
  });

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await page.getByRole('button', { name: 'Zamówienia i serwis' }).click();
  await expect(page.getByRole('heading', { name: 'Zamówienia i serwis' })).toBeVisible();
}

const seed = (): NeedRow[] => [
  {
    id: 1, bandId: 7, itemId: 5, name: 'Trąbka Jupiter 1100', serialNumber: 'TR-11', quantity: 2,
    status: 'OPEN', note: 'brak na spisie', resolutionNote: null,
    createdMemberId: 11, createdMemberName: 'Anna Nowak', createdAt: '2026-10-15T10:00:00Z', resolvedAt: null,
  },
  {
    id: 2, bandId: 7, itemId: 6, name: 'Futerał transportowy', serialNumber: null, quantity: 1,
    status: 'ORDERED', note: null, resolutionNote: null,
    createdMemberId: 12, createdMemberName: 'Bolesław Kowal', createdAt: '2026-10-16T09:00:00Z', resolvedAt: null,
  },
];

test('ADMIN przeprowadza potrzebę OPEN → ORDERED → RECEIVED z notką', async ({ page }) => {
  const needs = seed();
  const captured = { statusBodies: [] as Array<Record<string, unknown>>, createBodies: [] as Array<Record<string, unknown>> };
  await mockApi(page, needs, captured);

  const row = page.locator('li', { hasText: 'Trąbka Jupiter 1100' }).first();
  await expect(row.getByText('Zgłoszona')).toBeVisible();
  await row.getByRole('button', { name: 'Zamów TR-11' }).click();
  await expect(row.getByText('Zamówiona')).toBeVisible();
  expect(captured.statusBodies[0]).toEqual({ status: 'ORDERED', note: null });

  const row2 = page.locator('li', { hasText: 'Futerał transportowy' }).first();
  await row2.getByRole('button', { name: 'Dostarcz Futerał transportowy' }).click();
  const dialog = page.getByRole('dialog', { name: /Dostarczona: Futerał/ });
  await dialog.getByLabel(/Notatka/).fill('dostarczone 17.10, courier X');
  await dialog.getByRole('button', { name: 'Potwierdź ✓' }).click();
  await expect(row2.getByText('Dostarczona')).toBeVisible();
  await expect(row2.getByText(/rozwinięcie: dostarczone 17\.10/)).toBeVisible();
  expect(captured.statusBodies[1]).toEqual({ status: 'RECEIVED', note: 'dostarczone 17.10, courier X' });
});

test('chip statusu przycina listę', async ({ page }) => {
  await mockApi(page, seed(), { statusBodies: [], createBodies: [] });
  await page.getByRole('group', { name: 'Filtry statusów potrzeb' }).getByRole('button', { name: /Zamówiona/ }).click();
  await expect(page.locator('ul.list > li')).toHaveCount(1);
  await expect(page.getByText('Trąbka Jupiter 1100')).toHaveCount(0);
});

test('ręczne zgłoszenie: pik pozycji + zgłaszający + ilość, trafia na górę', async ({ page }) => {
  const needs = seed();
  const captured = { statusBodies: [] as Array<Record<string, unknown>>, createBodies: [] as Array<Record<string, unknown>> };
  await mockApi(page, needs, captured);

  await page.getByRole('button', { name: 'Zgłoś potrzebę' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowa potrzeba' });
  await dialog.getByLabel(/Pozycja/).selectOption('6');
  await dialog.getByLabel(/Ilość/).fill('3');
  await dialog.getByLabel(/Zgłasza/).selectOption('12');
  await dialog.getByLabel(/Notatka/).fill('na koncert 30.11');
  await dialog.getByRole('button', { name: 'Zgłoś potrzebę ✓' }).click();

  await expect.poll(() => captured.createBodies.length).toBe(1);
  expect(captured.createBodies[0]).toMatchObject({ itemId: 6, quantity: 3, createdMemberId: 12, note: 'na koncert 30.11' });
  const first = page.locator('ul.list > li').first();
  await expect(first.getByText('Futerał transportowy')).toBeVisible();
  await expect(first.getByText('Zgłoszona')).toBeVisible();
});

test('bez wyboru pozycji zgłoszenie blokuje się komunikatem', async ({ page }) => {
  const captured = { statusBodies: [] as Array<Record<string, unknown>>, createBodies: [] as Array<Record<string, unknown>> };
  await mockApi(page, seed(), captured);
  await page.getByRole('button', { name: 'Zgłoś potrzebę' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowa potrzeba' });
  await dialog.getByLabel(/Zgłasza/).selectOption('11');
  await dialog.getByRole('button', { name: 'Zgłoś potrzebę ✓' }).click();
  await expect(dialog.getByText('Wybierz pozycję')).toBeVisible();
  expect(captured.createBodies).toHaveLength(0);
});

test('MEMBER widzi planzę, ale bez akcji i FAB-a', async ({ page }) => {
  await mockApi(page, seed(), { statusBodies: [], createBodies: [] });
  await page.route('**/api/v1/me/bands', (r) => r.fulfill({ json: [{ bandId: 7, name: 'Orkiestra', role: 'MEMBER' }] }));
  await page.reload();
  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await page.getByRole('button', { name: 'Zamówienia i serwis' }).click();
  await expect(page.getByText('Trąbka Jupiter 1100')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zgłoś potrzebę' })).toHaveCount(0);
  await expect(page.locator('li').getByRole('button', { name: /^(Zamów|Dostarcz|Anuluj)/ })).toHaveCount(0);
});
