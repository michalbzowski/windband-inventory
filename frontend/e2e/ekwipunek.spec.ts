import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Ekwipunek registry UI (makieta screens 03–07, 17) against a faithful mock
 * of the merged REST contract (PR #10 attribute filter semantics included:
 * case-insensitive value equality, 400 for attributeValue without def).
 * Server-side behaviour itself lives in InventoryItemsIT.
 */

test.use({ viewport: { width: 360, height: 740 } });

interface Def { id: number; itemType: string; name: string; dataType: string; options: string[]; required: boolean; active: boolean; displayOrder: number }

interface MockItem {
  id: number; name: string; type: string; lifecycleStatus: string; warehouse: string;
  serialNumber: string | null; description: string | null; notes: string | null;
  attrs: Record<number, string>; assignedMemberId: number | null; assignedName: string | null;
  assignments: { id: number; memberId: number; memberName: string; assignedAt: string; returnedAt: string | null; returnedState: string | null; assignNote: string | null; returnNote: string | null }[];
  transfers: { id: number; fromWarehouse: string; toWarehouse: string; note: string | null; transferredAt: string }[];
}

const DEFS: Def[] = [
  { id: 1, itemType: 'UNIFORM', name: 'Kolor', dataType: 'TEXT', options: [], required: true, active: true, displayOrder: 1 },
  { id: 2, itemType: 'UNIFORM', name: 'Rozmiar', dataType: 'SELECT', options: ['S', 'M', 'L'], required: false, active: true, displayOrder: 2 },
  { id: 3, itemType: 'UNIFORM', name: 'Etui', dataType: 'BOOLEAN', options: [], required: false, active: true, displayOrder: 3 },
  { id: 4, itemType: 'INSTRUMENT', name: 'Liczba zaworów', dataType: 'NUMBER', options: [], required: false, active: true, displayOrder: 1 },
];

function makeItems(): MockItem[] {
  return [
    { id: 1, name: 'Flet', type: 'INSTRUMENT', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', serialNumber: 'FL-01', description: null, notes: null, attrs: { 4: '3' }, assignedMemberId: null, assignedName: null, assignments: [], transfers: [] },
    { id: 2, name: 'Marynarka', type: 'UNIFORM', lifecycleStatus: 'ASSIGNED', warehouse: 'MAIN', serialNumber: null, description: null, notes: null, attrs: { 1: 'Zielony', 2: 'M', 3: 'true' }, assignedMemberId: 12, assignedName: 'Anna Nowak', assignments: [{ id: 1, memberId: 12, memberName: 'Anna Nowak', assignedAt: '2026-09-01T10:00:00', returnedAt: null, returnedState: null, assignNote: 'koncert jesienny', returnNote: null }], transfers: [] },
    { id: 3, name: 'Spodnie', type: 'UNIFORM', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', serialNumber: null, description: null, notes: null, attrs: { 1: 'czarny', 2: 'S' }, assignedMemberId: null, assignedName: null, assignments: [], transfers: [] },
  ];
}

interface State { items: MockItem[]; created: { name: string; attributes: { attributeDefId: number; value: string }[] }[]; updated: MockItem[]; lastWrite: unknown }

function summary(i: MockItem) {
  return { id: i.id, name: i.name, type: i.type, lifecycleStatus: i.lifecycleStatus, warehouse: i.warehouse, serialNumber: i.serialNumber, assignedMemberId: i.assignedMemberId, assignedMemberName: i.assignedName };
}

function detail(i: MockItem) {
  return {
    id: i.id, bandId: 1, name: i.name, type: i.type, lifecycleStatus: i.lifecycleStatus, warehouse: i.warehouse,
    serialNumber: i.serialNumber, description: i.description, notes: i.notes,
    attributes: DEFS.filter((d) => d.itemType === i.type && d.active).map((d) => ({ attributeDefId: d.id, name: d.name, dataType: d.dataType, value: i.attrs[d.id] ?? null })),
    assignedMemberId: i.assignedMemberId, assignedMemberName: i.assignedName,
  };
}

async function json(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}

function normValue(def: Def, raw: string): string {
  if (def.dataType === 'SELECT') return def.options.find((o) => o.toLowerCase() === raw.toLowerCase()) ?? raw;
  if (def.dataType === 'BOOLEAN') return raw.toLowerCase() === 'true' ? 'true' : 'false';
  return raw.trim();
}

async function mockInventory(route: Route, st: State): Promise<void> {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname.replace('/api/inventory', '');
  const m = req.method();
  const body = (req.postDataJSON?.() ?? {}) as Record<string, unknown>;
  const idMatch = p.match(/^\/items\/(\d+)(\/assignments|\/transfers|\/assign|\/unassign)?$/);
  const id = idMatch ? Number(idMatch[1]) : NaN;
  const item = Number.isNaN(id) ? undefined : st.items.find((x) => x.id === id);

  if (p === '/items' && m === 'GET') {
    const q = url.searchParams;
    const value = q.get('attributeValue');
    const defId = q.get('attributeDefId');
    if (value && !defId) return json(route, { error: 'invalid_request', message: 'attributeValue wymaga attributeDefId' }, 400);
    let rows = st.items;
    if (q.get('type')) rows = rows.filter((i) => i.type === q.get('type'));
    if (q.get('status')) rows = rows.filter((i) => i.lifecycleStatus === q.get('status'));
    if (q.get('warehouse')) rows = rows.filter((i) => i.warehouse === q.get('warehouse'));
    if (q.get('assignedMemberId')) rows = rows.filter((i) => i.assignedMemberId === Number(q.get('assignedMemberId')));
    if (q.get('search')) {
      const s = (q.get('search') as string).toLowerCase();
      rows = rows.filter((i) => i.name.toLowerCase().includes(s) || (i.serialNumber ?? '').toLowerCase().includes(s));
    }
    if (defId) {
      const d = Number(defId);
      if (value) rows = rows.filter((i) => (i.attrs[d] ?? '').trim().toLowerCase() === value.trim().toLowerCase());
      else rows = rows.filter((i) => (i.attrs[d] ?? '') !== '');
    }
    return json(route, rows.map(summary));
  }

  if (p === '/items' && m === 'POST') {
    const attrs: Record<number, string> = {};
    for (const a of (body.attributes ?? []) as { attributeDefId: number; value: string }[]) {
      const def = DEFS.find((d) => d.id === a.attributeDefId);
      if (def && a.value) attrs[def.id] = normValue(def, a.value);
    }
    const created: MockItem = {
      id: Math.max(...st.items.map((i) => i.id)) + 1, name: body.name as string, type: body.type as string,
      lifecycleStatus: 'AVAILABLE', warehouse: (body.warehouse as string) ?? 'MAIN',
      serialNumber: (body.serialNumber as string) ?? null, description: (body.description as string) ?? null, notes: (body.notes as string) ?? null,
      attrs, assignedMemberId: null, assignedName: null, assignments: [], transfers: [],
    };
    st.items.push(created);
    st.created.push({ name: created.name, attributes: (body.attributes ?? []) as never });
    return json(route, detail(created), 201);
  }

  if (idMatch && m === 'GET' && !idMatch[2] && item) return json(route, detail(item));
  if (idMatch && m === 'PUT' && item) {
    st.updated.push(structuredClone(item));
    item.name = body.name as string;
    item.serialNumber = (body.serialNumber as string) || null;
    item.description = (body.description as string) || null;
    item.notes = (body.notes as string) || null;
    const attrs: Record<number, string> = {};
    for (const a of (body.attributes ?? []) as { attributeDefId: number; value: string }[]) {
      const def = DEFS.find((d) => d.id === a.attributeDefId);
      if (def && a.value) attrs[def.id] = normValue(def, a.value);
    }
    item.attrs = attrs;
    return json(route, detail(item));
  }
  if (idMatch && m === 'DELETE' && item) {
    if (item.assignments.length || item.transfers.length) {
      return json(route, { error: 'status_conflict', message: 'Pozycja z historią jest nieusuwalna' }, 409);
    }
    st.items = st.items.filter((x) => x.id !== item.id);
    return json(route, null, 204);
  }

  if (idMatch?.[2] === '/assignments' && m === 'GET' && item) return json(route, item.assignments);
  if (idMatch?.[2] === '/transfers' && m === 'GET' && item) return json(route, item.transfers);

  if (idMatch?.[2] === '/assign' && m === 'POST' && item) {
    if (item.lifecycleStatus !== 'AVAILABLE') return json(route, { error: 'status_conflict', message: 'Tylko dostępna pozycja trafia do przydziału' }, 409);
    const memberId = body.memberId as number;
    const memberName = memberId === 12 ? 'Anna Nowak' : 'Bartosz Kowal';
    item.lifecycleStatus = 'ASSIGNED';
    item.assignedMemberId = memberId;
    item.assignedName = memberName;
    item.assignments.push({ id: item.assignments.length + 1, memberId, memberName, assignedAt: new Date().toISOString(), returnedAt: null, returnedState: null, assignNote: (body.note as string) ?? null, returnNote: null });
    st.lastWrite = body;
    return json(route, detail(item));
  }

  if (idMatch?.[2] === '/unassign' && m === 'POST' && item) {
    if (item.lifecycleStatus !== 'ASSIGNED') return json(route, { error: 'status_conflict', message: 'Brak aktywnego przydziału' }, 409);
    const state = (body.state as string) ?? 'AVAILABLE';
    const open = [...item.assignments].reverse().find((a) => a.returnedAt === null);
    if (open) { open.returnedAt = new Date().toISOString(); open.returnedState = state; open.returnNote = (body.note as string) ?? null; }
    item.lifecycleStatus = state;
    item.assignedMemberId = null;
    item.assignedName = null;
    st.lastWrite = body;
    return json(route, detail(item));
  }

  if (idMatch?.[2] === '/transfers' && m === 'POST' && item) {
    if (!['AVAILABLE', 'IN_SERVICE', 'RETIRED'].includes(item.lifecycleStatus)) {
      return json(route, { error: 'status_conflict', message: 'Przypisanej pozycji nie przenosi się miedzy magazynami' }, 409);
    }
    const to = body.to as string;
    item.transfers.push({ id: item.transfers.length + 1, fromWarehouse: item.warehouse, toWarehouse: to, note: (body.note as string) ?? null, transferredAt: new Date().toISOString() });
    item.warehouse = to;
    st.lastWrite = body;
    return json(route, detail(item));
  }

  if (p === '/attribute-defs' && m === 'GET') {
    const type = url.searchParams.get('type');
    return json(route, DEFS.filter((d) => (!type || d.itemType === type)).map((d) => ({ ...d, bandId: 1 })));
  }

  return json(route, { error: 'mock_miss', path: p, method: m }, 500);
}

async function seed(page: Page, role: 'ADMIN' | 'MEMBER' = 'ADMIN'): Promise<State> {
  const st: State = { items: makeItems(), created: [], updated: [], lastWrite: null };
  await page.addInitScript(() => {
    sessionStorage.setItem('wi.session', JSON.stringify({
      accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
      user: { sub: 'admin-subj', firstName: 'Test', lastName: 'Osoba' },
    }));
  });
  await page.route('**/api/v1/me/bands', (r) => json(r, [{ bandId: 1, name: 'Orkiestra', role }]));
  await page.route('**/api/v1/bands/1/members', (r) =>
    json(r, [
      { memberId: 12, firstName: 'Anna', lastName: 'Nowak', active: true, expectedSet: [{ instrument: 'Flet', primary: true }] },
      { memberId: 13, firstName: 'Bartosz', lastName: 'Kowal', active: true, expectedSet: [] },
    ]));
  await page.route('**/api/inventory/**', (r) => mockInventory(r, st));
  await page.goto('/');
  return st;
}

async function openEkwipunek(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Ekwipunek/ }).first().click();
  await expect(page.getByRole('searchbox', { name: 'Szukaj pozycji' })).toBeVisible();
}

test('P0 §3.1 list filters: typ, status, osoba, atrybut (wartość case-insensitive)', async ({ page }) => {
  await seed(page);
  await openEkwipunek(page);
  await expect(page.getByRole('button', { name: 'Pozycja Flet' })).toBeVisible();
  await expect(page.getByText('3 pozycji')).toBeVisible();

  await page.getByRole('button', { name: /Typ ▾/ }).click();
  await page.getByRole('button', { name: /👕 Umundrowanie/ }).click();
  await expect(page.getByText('2 pozycji · filtr: Typ = Umundrowanie')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pozycja Flet' })).toHaveCount(0);

  await page.getByRole('button', { name: /Status ▾/ }).click();
  await page.getByRole('button', { name: 'Przypisany', exact: true }).click();
  await expect(page.getByText('1 pozycji')).toBeVisible();

  await page.getByRole('button', { name: 'Wyczyść filtry' }).click();
  await expect(page.getByText('3 pozycji · bez filtrów')).toBeVisible();

  // atrybut wg definicji: Kolor (TEXT) → wartość "czarny" trafia w "Czarny"/"czarny"
  await page.getByRole('button', { name: /Atrybut ▾/ }).click();
  await page.getByRole('button', { name: /Kolor \(UNIFORM\)/ }).click();
  await page.getByRole('button', { name: 'Dowolna wartość (ustawiony)' }).click();
  await expect(page.getByText('2 pozycji')).toBeVisible();

  await page.getByRole('button', { name: /Atrybut ▾/ }).click();
  await page.getByRole('button', { name: '‹ Inny atrybut' }).click();
  await page.getByRole('button', { name: /Kolor \(UNIFORM\)/ }).click();
  await page.getByLabel('Wartość atrybutu Kolor').fill('CZARNY');
  await page.getByRole('button', { name: 'Filtruj' }).click();
  await expect(page.getByRole('button', { name: 'Pozycja Spodnie' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pozycja Marynarka' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Wyczyść filtry' }).click();
  await page.getByRole('button', { name: /Osoba ▾/ }).click();
  await page.getByRole('button', { name: /👤 Anna Nowak/ }).click();
  await expect(page.getByText('filtr: Osoba = Anna Nowak')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pozycja Marynarka' })).toBeVisible();
});

test('assign → zwrot ze stanem → transfer + historia przydziałów (05/17)', async ({ page }) => {
  const st = await seed(page);
  await openEkwipunek(page);

  await page.getByRole('button', { name: 'Pozycja Flet' }).click();
  await page.getByRole('button', { name: /Przypisz… ↦/ }).click();
  await page.getByRole('button', { name: /👤 Bartosz Kowal/ }).click();
  await page.getByLabel(/Notatka/).fill('na koncert');
  await page.getByRole('button', { name: /Przypisz — Bartosz Kowal/ }).click();
  await expect(page.getByText('Przypisano ✓')).toBeVisible();
  await expect(page.locator('.badge.b-primary', { hasText: 'Przypisany' })).toBeVisible();
  await expect(page.getByText('👤 Bartosz Kowal', { exact: true }).first()).toBeVisible();
  await expect.poll(() => st.items.find((i) => i.id === 1)?.assignedName).toBe('Bartosz Kowal');

  // zwrot z uszkodzeniem → IN_SERVICE
  await page.getByRole('button', { name: 'Wróć do listy' }).click();
  await page.getByRole('button', { name: 'Pozycja Marynarka' }).click();
  await page.getByRole('button', { name: /Zwróć ✋/ }).click();
  await page.getByRole('button', { name: /uszkodzony → serwis/ }).click();
  await page.getByLabel(/Notatka/).fill('pęknięty szew');
  await page.getByRole('button', { name: 'Zatwierdź zwrot' }).click();
  await expect(page.getByText('Zwrócono ✓')).toBeVisible();
  await expect(page.locator('.badge.b-warn', { hasText: 'W serwisie' })).toBeVisible();
  await expect.poll(() => st.items.find((i) => i.id === 2)?.lifecycleStatus).toBe('IN_SERVICE');
  await expect(page.getByText('zwrot: W serwisie')).toBeVisible();
  await expect(page.getByText('pęknięty szew')).toBeVisible();

  // transfer magazynowy + historia przeniesień
  await page.getByRole('button', { name: /Transfer 🏬/ }).click();
  await page.getByRole('button', { name: /🏬 Archiwum/ }).click();
  await page.getByRole('button', { name: /Przenieś do: Archiwum/ }).click();
  await expect(page.getByText('Przeniesiono ✓')).toBeVisible();
  await expect(page.getByText('🏬 Główny → Archiwum')).toBeVisible();
  await expect.poll(() => st.items.find((i) => i.id === 2)?.warehouse).toBe('ARCHIVE');
});

test('two-step create: walidacja inline + payload z atrybutami; MEMBER read-only', async ({ page }) => {
  const st = await seed(page);
  await openEkwipunek(page);

  await page.locator('.fab').click();
  await page.getByRole('button', { name: /👕 Umundrowanie/ }).click();
  await expect(page.getByLabel(/^Kolor \*/)).toBeVisible();

  await page.getByRole('button', { name: 'Zapisz pozycję' }).click();
  await expect(page.getByText('Nazwa jest wymagana')).toBeVisible();
  await expect(page.getByText('„Kolor" jest wymagany')).toBeVisible();

  await page.getByLabel(/Nazwa/).fill('Czapko-czaszka');
  await page.getByLabel(/^Kolor \*/).fill('Granatowy');
  await page.getByRole('button', { name: 'L', exact: true }).click();
  await page.getByRole('button', { name: '✓ TAK' }).click();
  await page.getByRole('button', { name: 'Zapisz pozycję' }).click();

  await expect(page.getByText('4 pozycji · bez filtrów')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pozycja Flet' })).toBeVisible();
  await expect.poll(() => st.created.length).toBe(1);
  expect(st.created[0].attributes).toEqual([
    { attributeDefId: 1, value: 'Granatowy' },
    { attributeDefId: 2, value: 'L' },
    { attributeDefId: 3, value: 'true' },
  ]);
});

test('MEMBER: lista bez FAB i bez strefy akcji na szczegółach', async ({ page }) => {
  await seed(page, 'MEMBER');
  await openEkwipunek(page);
  await expect(page.locator('.fab')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pozycja Marynarka' }).click();
  await expect(page.getByText('MEMBER: podgląd bez zapisów')).toBeVisible();
  await expect(page.getByRole('button', { name: /Zwróć ✋/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Przypisz… ↦' })).toHaveCount(0);
});
