import { expect, test, type Page } from '@playwright/test';

/**
 * Reguły warunkowe atrybutów (v2.0) w UI:
 *  A) ADMIN definiuje atrybut zależny od wartości rodzica-SELECT (chipsy).
 *  B) Formularz pozycji pokazuje tylko widoczne atrybuty i nie wysyła ukrytych.
 * Przykład: Mundur → Wzrost+Obwód ramion; Czapka → nic; Koszula → Wzrost.
 */

interface DefRow {
  id: number; bandId: number; itemType: string; name: string; dataType: string;
  displayOrder: number; required: boolean; displayInList: boolean; options: string[];
  active: boolean; dependsOnDefId: number | null; dependsOnValues: string[];
}

interface Captured { createBodies: Array<Record<string, unknown>> }

async function mockApi(page: Page, seedDefs: DefRow[], captured: Captured) {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'wi.session',
      JSON.stringify({
        accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
        user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
      }),
    );
  });
  await page.route('**/api/v1/me/bands', (r) => r.fulfill({ json: [{ bandId: 7, name: 'Orkiestra', role: 'ADMIN' }] }));
  await page.route('**/api/v1/bands/*/members', (r) => r.fulfill({ json: [{ memberId: 12, firstName: 'Anna', lastName: 'Nowak', active: true, expectedSet: [] }] }));
  await page.route('**/api/inventory/**', (r) => r.fulfill({ json: [] })); // catch-all FIRST (LIFO!)

  await page.route(/\/api\/inventory\/attribute-defs(\?.*)?$/, (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ json: seedDefs.filter((d) => d.active) });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const dep = body.dependsOnDefId as number | null | undefined;
    const created: DefRow = {
      id: Math.max(0, ...seedDefs.map((d) => d.id)) + 1, bandId: 7,
      itemType: String(body.itemType), name: String(body.name), dataType: String(body.dataType),
      displayOrder: (body.displayOrder as number) ?? 0, required: (body.required as boolean) ?? false,
      displayInList: (body.displayInList as boolean) ?? false, options: (body.options as string[]) ?? [], active: true,
      dependsOnDefId: dep != null && dep > 0 ? dep : null,
      dependsOnValues: dep != null && dep > 0 ? (body.dependsOnValues as string[]) ?? [] : [],
    };
    seedDefs.push(created);
    return route.fulfill({ status: 201, json: created });
  });
  await page.route(/\/api\/inventory\/attribute-defs\/\d+$/, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const def = seedDefs.find((d) => d.id === Number(new URL(route.request().url()).pathname.split('/').pop()));
    if (!def) return route.fulfill({ status: 404, json: { message: 'brak' } });
    Object.assign(def, {
      name: (body.name as string) ?? def.name,
      options: (body.options as string[]) ?? def.options,
      required: (body.required as boolean) ?? def.required,
      displayInList: (body.displayInList as boolean) ?? def.displayInList,
      displayOrder: (body.displayOrder as number) ?? def.displayOrder,
      active: (body.active as boolean) ?? def.active,
    });
    const dep = body.dependsOnDefId as number | null | undefined;
    if (dep != null) {
      if (dep <= 0) { def.dependsOnDefId = null; def.dependsOnValues = []; }
      else { def.dependsOnDefId = dep; def.dependsOnValues = (body.dependsOnValues as string[]) ?? []; }
    } else if (body.dependsOnValues != null) {
      def.dependsOnValues = body.dependsOnValues as string[];
    }
    return route.fulfill({ json: def });
  });

  await page.route(/\/api\/inventory\/items(\?.*)?$/, (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      captured.createBodies.push(body);
      return route.fulfill({ status: 201, json: {
        id: 99, name: body.name, type: body.type, lifecycleStatus: 'IN_WAREHOUSE',
        warehouse: 'MAIN', serialNumber: null, description: null, notes: null,
        assignedMemberId: null, assignedName: null, assignments: [], transfers: [],
        services: [], nextServiceDate: null,
        attributes: ((body.attributes as Array<{ attributeDefId: number; value: string }>) ?? []).map((a) =>
          ({ attributeDefId: a.attributeDefId, name: String(a.attributeDefId), dataType: 'TEXT', value: a.value })),
      } });
    }
    return route.fulfill({ json: [] });
  });
  await page.route(/\/api\/inventory\/items\/\d+$/, (route) => route.fulfill({ json: {
    id: 99, name: 'X', type: 'UNIFORM', lifecycleStatus: 'IN_WAREHOUSE', warehouse: 'MAIN',
    serialNumber: null, description: null, notes: null, assignedMemberId: null, assignedName: null,
    assignments: [], transfers: [], services: [], nextServiceDate: null, attributes: [],
  } }));

  await page.goto('/');
}

const parent = (over?: Partial<DefRow>): DefRow => ({
  id: 10, bandId: 7, itemType: 'UNIFORM', name: 'Rodzaj', dataType: 'SELECT',
  displayOrder: 0, required: false, displayInList: false,
  options: ['Mundur', 'Czapka', 'Koszula'], active: true,
  dependsOnDefId: null, dependsOnValues: [], ...over,
});

test('ADMIN definiuje warunek: rodzic SELECT + chipsy wartości', async ({ page }) => {
  const defs: DefRow[] = [parent()];
  await mockApi(page, defs, { createBodies: [] });

  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '♧ Ekwipunek' }).click();
  await page.getByRole('button', { name: 'Definicje atrybutów' }).click();
  await expect(page.getByRole('heading', { name: 'Definicje atrybutów' })).toBeVisible();
  await page.getByRole('button', { name: '👕 Umundrowanie' }).click();
  await page.getByRole('button', { name: 'Nowa definicja atrybutu' }).click();

  const dialog = page.getByRole('dialog', { name: 'Nowa definicja atrybutu' });
  await dialog.getByLabel(/Nazwa/).fill('Wzrost');
  await dialog.getByLabel(/Typ danych/).selectOption('NUMBER');
  await dialog.getByLabel(/Pokazywany tylko gdy/).selectOption({ label: 'zależy od „Rodzaj”' });
  const warunek = dialog.getByRole('group', { name: 'Wartości warunku' });
  await warunek.getByRole('button', { name: 'Mundur', pressed: false }).click();
  await warunek.getByRole('button', { name: 'Koszula', pressed: false }).click();
  await dialog.getByRole('button', { name: 'Zapisz' }).click();

  // list widaéć: meta mówi o zależności
  await expect(page.locator('li', { hasText: 'Wzrost' }).first())
    .toContainText('zależy od „Rodzaj” = {Mundur, Koszula}');
  await expect.poll(() => defs.find((d) => d.name === 'Wzrost')?.dependsOnDefId).toBe(10);
  expect(defs.find((d) => d.name === 'Wzrost')?.dependsOnValues).toEqual(['Mundur', 'Koszula']);
});

test('bez wartości warunku zapis blokuje się komunikatem', async ({ page }) => {
  const defs: DefRow[] = [parent()];
  await mockApi(page, defs, { createBodies: [] });
  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '♧ Ekwipunek' }).click();
  await page.getByRole('button', { name: 'Definicje atrybutów' }).click();
  await page.getByRole('button', { name: '👕 Umundrowanie' }).click();
  await page.getByRole('button', { name: 'Nowa definicja atrybutu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nowa definicja atrybutu' });
  await dialog.getByLabel(/Nazwa/).fill('Wzrost');
  await dialog.getByLabel(/Typ danych/).selectOption('NUMBER');
  await dialog.getByLabel(/Pokazywany tylko gdy/).selectOption({ label: 'zależy od „Rodzaj”' });
  await dialog.getByRole('button', { name: 'Zapisz' }).click();
  await expect(dialog.getByText(/po których wartościach rodzica/i)).toBeVisible();
  expect(defs.some((d) => d.name === 'Wzrost')).toBe(false);
});

test('formularz pozycji: tylko widoczne atrybuty, ukryte nie lecą w payloadzie', async ({ page }) => {
  const defs: DefRow[] = [
    parent(),
    parent({ id: 11, name: 'Wzrost', dataType: 'NUMBER', options: [], required: true, dependsOnDefId: 10, dependsOnValues: ['Mundur', 'Koszula'], displayOrder: 1 }),
    parent({ id: 12, name: 'Obwód ramion', dataType: 'NUMBER', options: [], dependsOnDefId: 10, dependsOnValues: ['Mundur'], displayOrder: 2 }),
  ];
  const captured: Captured = { createBodies: [] };
  await mockApi(page, defs, captured);

  await page.getByRole('button', { name: 'Nowa pozycja' }).click();
  await page.getByRole('button', { name: '👕 Umundrowanie' }).click();

  // Rodzic wybrany? nie → oba warunkowe ukryte
  await expect(page.getByText('Rodzaj', { exact: true })).toBeVisible();
  await expect(page.getByText(/Wzrost/)).toHaveCount(0);
  await expect(page.getByText(/Obwód/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Mundur', pressed: false }).click();
  await expect(page.getByText('Wzrost *')).toBeVisible();
  await expect(page.getByText('Obwód ramion')).toBeVisible();
  await page.getByLabel('Wzrost *').fill('178');
  await page.getByLabel('Obwód ramion').fill('94');

  // przełącznik: Koszula chowa Obwód, Wzrost zostaje z wartością
  await page.getByRole('button', { name: 'Koszula', pressed: false }).click();
  await expect(page.getByText('Wzrost *')).toBeVisible();
  await expect(page.getByText('Obwód ramion')).toHaveCount(0);
  await expect(page.getByLabel('Wzrost *')).toHaveValue('178');

  await page.getByLabel(/Nazwa \*/).fill('Koszula koncertowa');
  await page.getByRole('button', { name: 'Zapisz pozycję' }).click();

  await expect.poll(() => captured.createBodies.length).toBe(1);
  const ids = (captured.createBodies[0].attributes as Array<{ attributeDefId: number }>).map((a) => a.attributeDefId);
  expect(ids).toEqual(expect.arrayContaining([10, 11]));
  expect(ids).not.toContain(12);
});
