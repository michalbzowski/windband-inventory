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
  nextServiceDate: string | null;
  assignments: { id: number; memberId: number; memberName: string; assignedAt: string; returnedAt: string | null; returnedState: string | null; assignNote: string | null; returnNote: string | null }[];
  transfers: { id: number; fromWarehouse: string; toWarehouse: string; note: string | null; transferredAt: string }[];
  services: { id: number; sentAt: string; sentNote: string | null; completedAt: string | null; completedNote: string | null; nextServiceDate: string | null }[];
}

const DEFS: Def[] = [
  { id: 1, itemType: 'UNIFORM', name: 'Kolor', dataType: 'TEXT', options: [], required: true, active: true, displayOrder: 1 },
  { id: 2, itemType: 'UNIFORM', name: 'Rozmiar', dataType: 'SELECT', options: ['S', 'M', 'L'], required: false, active: true, displayOrder: 2 },
  { id: 3, itemType: 'UNIFORM', name: 'Etui', dataType: 'BOOLEAN', options: [], required: false, active: true, displayOrder: 3 },
  { id: 4, itemType: 'INSTRUMENT', name: 'Liczba zaworów', dataType: 'NUMBER', options: [], required: false, active: true, displayOrder: 1 },
];

/** WM roster mock — 1:1 with B10 MemberView record incl. expectedSet (feeds F3). */
const MEMBERS = [
  { memberId: 12, firstName: 'Anna', lastName: 'Nowak', active: true, expectedSet: [{ instrument: 'Flet', primary: true }, { instrument: 'Altówka', primary: false }] },
  { memberId: 13, firstName: 'Bartosz', lastName: 'Kowal', active: true, expectedSet: [] },
];

function makeItems(): MockItem[] {
  return [
    { id: 1, name: 'Flet', type: 'INSTRUMENT', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', serialNumber: 'FL-01', description: null, notes: null, attrs: { 4: '3' }, assignedMemberId: null, assignedName: null, nextServiceDate: '2026-10-01', assignments: [], transfers: [], services: [{ id: 1, sentAt: '2026-05-02T09:00:00', sentNote: 'klepki', completedAt: '2026-05-20T15:00:00', completedNote: 'regulacja', nextServiceDate: '2026-10-01' }] },
    { id: 2, name: 'Marynarka', type: 'UNIFORM', lifecycleStatus: 'ASSIGNED', warehouse: 'MAIN', serialNumber: null, description: null, notes: null, attrs: { 1: 'Zielony', 2: 'M', 3: 'true' }, assignedMemberId: 12, assignedName: 'Anna Nowak', assignments: [{ id: 1, memberId: 12, memberName: 'Anna Nowak', assignedAt: '2026-09-01T10:00:00', returnedAt: null, returnedState: null, assignNote: 'koncert jesienny', returnNote: null }], transfers: [], nextServiceDate: null, services: [] },
    { id: 3, name: 'Spodnie', type: 'UNIFORM', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', serialNumber: null, description: null, notes: null, attrs: { 1: 'czarny', 2: 'S' }, assignedMemberId: null, assignedName: null, assignments: [], transfers: [], nextServiceDate: null, services: [] },
  ];
}

interface State { items: MockItem[]; created: { name: string; attributes: { attributeDefId: number; value: string }[] }[]; updated: MockItem[]; lastWrite: unknown; decls: DeclarationMock[]; role: 'ADMIN' | 'MEMBER' }

/** 1:1 pola DeclarationView (backend) — lustrzane semantycznie, B14. */
interface DeclarationMock {
  id: number; bandId: number; itemId: number; name: string; serialNumber: string | null;
  type: string; status: string;
  holderMemberId: number | null; holderName: string | null; locationText: string | null; note: string | null;
  declaredByMemberId: number; declaredByName: string;
  createdAt: string; revokedAt: string | null; revokedBy: string | null; revokedNote: string | null;
}

function summary(i: MockItem) {
  return { id: i.id, name: i.name, type: i.type, lifecycleStatus: i.lifecycleStatus, warehouse: i.warehouse, serialNumber: i.serialNumber, assignedMemberId: i.assignedMemberId, assignedMemberName: i.assignedName };
}

function detail(i: MockItem) {
  return {
    id: i.id, bandId: 1, name: i.name, type: i.type, lifecycleStatus: i.lifecycleStatus, warehouse: i.warehouse,
    serialNumber: i.serialNumber, description: i.description, notes: i.notes,
    attributes: DEFS.filter((d) => d.itemType === i.type && d.active).map((d) => ({ attributeDefId: d.id, name: d.name, dataType: d.dataType, value: i.attrs[d.id] ?? null })),
    assignedMemberId: i.assignedMemberId, assignedMemberName: i.assignedName,
    nextServiceDate: i.nextServiceDate,
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

  // B14 deklaracje posiadania — lista/utworzenie/odwołanie z regułami domenowymi.
  if (p === '/declarations' && m === 'GET') {
    const q = url.searchParams;
    let rows = [...st.decls].reverse();
    if (q.get('type')) rows = rows.filter((d) => d.type === q.get('type'));
    if (q.get('status')) rows = rows.filter((d) => d.status === q.get('status'));
    if (q.get('holderMemberId')) rows = rows.filter((d) => d.holderMemberId === Number(q.get('holderMemberId')));
    return json(route, rows);
  }
  if (p === '/declarations' && m === 'POST') {
    const target = st.items.find((x) => x.id === Number(body.itemId));
    if (!target) return json(route, { error: 'not_found', message: 'Pozycja nie istnieje' }, 404);
    if (target.lifecycleStatus === 'ASSIGNED') {
      return json(route, { error: 'status_conflict', message: 'Pozycja przypisana formalnie jest już u osoby — deklaruj po zwrocie' }, 409);
    }
    if (st.decls.some((d) => d.itemId === target.id && d.status === 'ACTIVE')) {
      return json(route, { error: 'status_conflict', message: 'Pozycja ma już aktywną deklarację posiadania — odwołaj ją najpierw' }, 409);
    }
    const type = String(body.type);
    if (!body.declaredByMemberId) return json(route, { error: 'invalid_request', message: 'declaredByMemberId wymagany' }, 400);
    const declarant = MEMBERS.find((x) => x.memberId === Number(body.declaredByMemberId));
    if (!declarant || !declarant.active) return json(route, { error: 'invalid_request', message: 'Członek nie należy do bandu' }, 400);
    const holder = MEMBERS.find((x) => x.memberId === body.holderMemberId) ?? null;
    if (type === 'PRIVATE' && !holder) return json(route, { error: 'invalid_request', message: 'Deklaracja prywatna wymaga osoby (holderMemberId)' }, 400);
    if (type === 'EXTERNAL' && !String(body.locationText ?? '').trim()) {
      return json(route, { error: 'invalid_request', message: 'Deklaracja zewnętrzna wymaga opisu miejsca (locationText)' }, 400);
    }
    const rec: DeclarationMock = {
      id: st.decls.length + 1, bandId: 1, itemId: target.id, name: target.name, serialNumber: target.serialNumber,
      type, status: 'ACTIVE',
      holderMemberId: holder?.memberId ?? null, holderName: holder ? `${holder.firstName} ${holder.lastName}` : null,
      locationText: type === 'EXTERNAL' ? String(body.locationText).trim() : null,
      note: (body.note as string | null) ?? null,
      declaredByMemberId: declarant.memberId, declaredByName: `${declarant.firstName} ${declarant.lastName}`,
      createdAt: new Date().toISOString().slice(0, 19), revokedAt: null, revokedBy: null, revokedNote: null,
    };
    st.decls.push(rec);
    return json(route, rec, 201);
  }
  const dMatch = p.match(/^\/declarations\/(\d+)(\/revoke)?$/);
  if (dMatch) {
    const d = st.decls.find((x) => x.id === Number(dMatch[1]));
    if (!d) return json(route, { error: 'not_found', message: 'Deklaracja nie istnieje' }, 404);
    if (m === 'GET') return json(route, d);
    if (m === 'POST' && dMatch[2] === '/revoke') {
      if (st.role !== 'ADMIN') return json(route, { error: 'forbidden', message: 'Odwołanie deklaracji wymaga administratora' }, 403);
      if (d.status !== 'ACTIVE') return json(route, { error: 'status_conflict', message: 'Odwołać można tylko aktywną deklarację' }, 409);
      d.status = 'REVOKED';
      d.revokedAt = new Date().toISOString().slice(0, 19);
      d.revokedNote = (body.note as string | null) ?? null;
      return json(route, d);
    }
  }
  const idMatch = p.match(/^\/items\/(\d+)(\/assignments|\/transfers|\/assign|\/unassign|\/service\/complete|\/service|\/services)?$/);
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
    if (q.get('serviceDue')) {
      // F4 mirror: AVAILABLE + plan set and due (<= today), server-side rule.
      const today = new Date().toISOString().slice(0, 10);
      rows = rows.filter((i) => i.lifecycleStatus === 'AVAILABLE' && !!i.nextServiceDate && i.nextServiceDate <= today);
    }
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
      attrs, assignedMemberId: null, assignedName: null, nextServiceDate: null, assignments: [], transfers: [], services: [],
    };
    st.items.push(created);
    st.created.push({ name: created.name, attributes: (body.attributes ?? []) as never });
    return json(route, detail(created), 201);
  }

  if (idMatch && m === 'GET' && !idMatch[2] && item) return json(route, detail(item));
  if (idMatch && m === 'PUT' && item) {
    st.updated.push(structuredClone(item));
    // BE: kod (serialNumber) nie należy do powierzchni edycji — program go nadaje,
    // edycja pozycji go NIE czyści (InventoryItem.replaceDetails nie dotyka serialNumber).
    item.name = body.name as string;
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
    if (item.assignments.length || item.transfers.length || item.services.length) {
      return json(route, { error: 'status_conflict', message: 'Pozycja z historią jest nieusuwalna' }, 409);
    }
    st.items = st.items.filter((x) => x.id !== item.id);
    return json(route, null, 204);
  }

  if (idMatch?.[2] === '/assignments' && m === 'GET' && item) return json(route, item.assignments);
  if (idMatch?.[2] === '/transfers' && m === 'GET' && item) return json(route, item.transfers);
  if (idMatch?.[2] === '/services' && m === 'GET' && item) return json(route, item.services);

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
    if (state === 'IN_SERVICE') {
      // F4 mirror: a return straight into service opens the evidence event.
      item.services.push({ id: item.services.length + 1, sentAt: new Date().toISOString(), sentNote: (body.note as string) ?? null, completedAt: null, nextServiceDate: null, completedNote: null });
    }
    st.lastWrite = body;
    return json(route, detail(item));
  }

  if (idMatch?.[2] === '/service' && m === 'POST' && item) {
    if (item.lifecycleStatus !== 'AVAILABLE') return json(route, { error: 'status_conflict', message: 'Do serwisu można wysłać wyłącznie pozycję o statusie AVAILABLE' }, 409);
    item.lifecycleStatus = 'IN_SERVICE';
    item.services.push({ id: item.services.length + 1, sentAt: new Date().toISOString(), sentNote: (body.note as string) ?? null, completedAt: null, completedNote: null, nextServiceDate: null });
    st.lastWrite = body;
    return json(route, detail(item));
  }

  if (idMatch?.[2] === '/service/complete' && m === 'POST' && item) {
    if (item.lifecycleStatus !== 'IN_SERVICE') return json(route, { error: 'status_conflict', message: 'Serwis można zamknąć wyłącznie dla pozycji o statusie IN_SERVICE' }, 409);
    const next = (body.nextServiceDate as string) ?? null;
    item.lifecycleStatus = 'AVAILABLE';
    item.nextServiceDate = next;
    const openSvc = [...item.services].reverse().find((s) => s.completedAt === null);
    if (openSvc) { openSvc.completedAt = new Date().toISOString(); openSvc.completedNote = (body.note as string) ?? null; openSvc.nextServiceDate = next; }
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

  const picMatch = p.match(/^\/members\/(\d+)\/picture$/);
  if (picMatch && m === 'GET') {
    const memberId = Number(picMatch[1]);
    const member = MEMBERS.find((x) => x.memberId === memberId);
    if (!member) return json(route, { error: 'not_found', message: 'Członek nie należy do tego bandu' }, 404);
    const actual = st.items.filter((i) => i.assignedMemberId === memberId && i.lifecycleStatus === 'ASSIGNED');
    const norm = (s: string) => s.trim().toLowerCase();
    const expected = member.expectedSet.map((e) => {
      const want = norm(e.instrument);
      const matched = actual
        .filter((i) => { const have = norm(i.name); return have === want || have.startsWith(want + ' '); })
        .map((i) => i.id);
      return { instrument: e.instrument, primary: e.primary, satisfied: matched.length > 0, matchedItemIds: matched };
    });
    const history = st.items
      .flatMap((i) => i.assignments.filter((a) => a.memberId === memberId)
        .map((a) => ({
          id: a.id, itemId: i.id, itemName: i.name, assignedAt: a.assignedAt,
          returnedAt: a.returnedAt, returnedState: a.returnedState,
          assignNote: a.assignNote, returnNote: a.returnNote,
        })))
      .sort((x, y) => y.assignedAt.localeCompare(x.assignedAt));
    return json(route, {
      memberId, memberName: `${member.firstName} ${member.lastName}`, active: member.active,
      expected, actual: actual.map(summary),
      gapCount: expected.filter((e) => !e.satisfied).length, history,
    });
  }

  return json(route, { error: 'mock_miss', path: p, method: m }, 500);
}

async function seed(page: Page, role: 'ADMIN' | 'MEMBER' = 'ADMIN'): Promise<State> {
  const st: State = { items: makeItems(), created: [], updated: [], lastWrite: null, decls: [], role };
  await page.addInitScript(() => {
    sessionStorage.setItem('wi.session', JSON.stringify({
      accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
      user: { sub: 'admin-subj', firstName: 'Test', lastName: 'Osoba' },
    }));
  });
  await page.route('**/api/v1/me/bands', (r) => json(r, [{ bandId: 1, name: 'Orkiestra', role }]));
  await page.route('**/api/v1/bands/1/members', (r) => json(r, MEMBERS));
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
  await expect(page.getByRole('button', { name: /Pozycja FL-01/ })).toBeVisible();
  await expect(page.getByText('3 pozycji')).toBeVisible();

  await page.getByRole('button', { name: /Typ ▾/ }).click();
  await page.getByRole('button', { name: /👕 Umundrowanie/ }).click();
  await expect(page.getByText('2 pozycji · filtr: Typ = Umundrowanie')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pozycja FL-01/ })).toHaveCount(0);

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

test('F3 pełny obraz: oczekiwane vs faktyczne, luki i historia widokowa', async ({ page }) => {
  await seed(page);
  await openEkwipunek(page);

  await page.getByRole('button', { name: /Osoba ▾/ }).click();
  await page.getByRole('button', { name: /👤 Anna Nowak/ }).click();
  await page.getByRole('button', { name: /Osoba ▾/ }).click();
  await page.getByRole('button', { name: /Pełny obraz: Anna Nowak/ }).click();

  await expect(page.getByRole('heading', { name: '👤 Anna Nowak' })).toBeVisible();
  await expect(page.getByText('Aktywny')).toBeVisible();
  // Anna expects Flet + Altówka; she holds only the uniform Marynarka → 2 gaps
  await expect(page.getByText('✗ Flet')).toBeVisible();
  await expect(page.getByText('✗ Altówka')).toBeVisible();
  await expect(page.getByText('Luki: 2')).toBeVisible();
  await expect(page.getByText('Faktycznie przechowywane (1)')).toBeVisible();
  await expect(page.getByText('Historia przydziałów')).toBeVisible();
  await expect(page.getByText('tylko do odczytu', { exact: false })).toBeVisible();
  await expect(page.getByText('koncert jesienny')).toBeVisible();

  await page.getByRole('button', { name: 'Pozycja Marynarka' }).click();
  await expect(page.getByRole('heading', { name: '👕 Marynarka' })).toBeVisible();
});

test('F4 serwis: lista „do serwisu”, wysłanie, zamknięcie z terminem i plan', async ({ page }) => {
  const st = await seed(page);
  await openEkwipunek(page);

  // Flet ma zamknięty serwis z planem w przeszłości → tylko on trafia do listy due
  await page.getByRole('button', { name: 'Status ▾' }).click();
  await page.getByRole('button', { name: '🔧 Do serwisu (minął termin)' }).click();
  await expect(page.getByText('filtr: do serwisu (termin)')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pozycja FL-01/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pozycja Spodnie' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Wyczyść filtry' }).click();

  // Spodnie: AVAILABLE → do serwisu → zamknięcie z kolejnym terminem
  await page.getByRole('button', { name: 'Pozycja Spodnie' }).click();
  await page.getByRole('button', { name: /Do serwisu 🔧/ }).click();
  await page.getByLabel(/Usterka/).fill('rozsunięte szwy');
  await page.getByRole('button', { name: 'Wyślij do serwisu 🔧' }).click();
  await expect(page.getByText('Wysłano do serwisu ✓')).toBeVisible();
  await expect(page.locator('.badge.b-warn', { hasText: 'W serwisie' })).toBeVisible();
  await expect.poll(() => st.items.find((i) => i.id === 3)?.lifecycleStatus).toBe('IN_SERVICE');
  await expect(page.getByText('Historia serwisów')).toBeVisible();
  await expect(page.locator('.badge.b-warn', { hasText: 'otwarty' })).toBeVisible();

  await page.getByRole('button', { name: /Zakończ serwis ✅/ }).click();
  await page.getByLabel(/Co zrobiono/).fill('naprawa + impregnat');
  await page.getByLabel(/Następny serwis/).fill('2027-05-01');
  await page.getByRole('button', { name: 'Zamknij serwis ✅' }).click();
  await expect(page.getByText('Serwis zamknięty ✓')).toBeVisible();
  await expect.poll(() => st.items.find((i) => i.id === 3)?.nextServiceDate).toBe('2027-05-01');
  await expect(page.getByText('Następny serwis')).toBeVisible();
  await expect(page.getByText('🔧 1.05.2027')).toBeVisible();
  await expect(page.getByText('naprawa + impregnat')).toBeVisible();

  // serwis to dowód — usuwanie zablokowane
  await expect(page.getByRole('button', { name: /Usuń \(ma historię\)/ })).toBeVisible();

  // Flet wciąż w „do serwisu”, Spodnie już nie (termin przyszły)
  await page.getByRole('button', { name: 'Wróć do listy' }).click();
  await page.getByRole('button', { name: 'Status ▾' }).click();
  await page.getByRole('button', { name: '🔧 Do serwisu (minął termin)' }).click();
  await expect(page.getByRole('button', { name: /Pozycja FL-01/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pozycja Spodnie' })).toHaveCount(0);
});

test('assign → zwrot ze stanem → transfer + historia przydziałów (05/17)', async ({ page }) => {
  const st = await seed(page);
  await openEkwipunek(page);

  await page.getByRole('button', { name: /Pozycja FL-01/ }).click();
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
  // notatka zwrotu jest w dwóch dowodach: przydział (returnNote) + serwis (sentNote)
  await expect(page.getByText('pęknięty szew').first()).toBeVisible();

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
  await expect(page.getByText('„Kolor" jest wymagany')).toBeVisible();
  await page.getByLabel(/^Kolor \*/).fill('Granatowy');
  await page.getByRole('button', { name: 'L', exact: true }).click();
  await page.getByRole('button', { name: '✓ TAK' }).click();
  await page.getByRole('button', { name: 'Zapisz pozycję' }).click();

  await expect(page.getByText('4 pozycji · bez filtrów')).toBeVisible();
  await expect(page.getByRole('button', { name: /Pozycja FL-01/ })).toBeVisible();
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

test('B14 deklaracje: MEMBER składa prywatną, ADMIN odwołuje, ASSIGNED odpada', async ({ page }) => {
  const st = await seed(page, 'MEMBER');
  await openEkwipunek(page);

  // MEMBER ma dostęp do deklarowania (B14) — Flet jest AVAILABLE
  await page.getByRole('button', { name: /Pozycja FL-01/ }).click();
  await expect(page.getByText('Posiadanie poza magazynem')).toBeVisible();
  await page.getByRole('button', { name: /Deklaruj posiadanie 🏠/ }).click();
  await page.getByRole('button', { name: /🧳 zewnętrzne/ }).click();
  await page.getByLabel(/Kto składa/).selectOption('12');
  // EXTERNAL bez miejsca nie przechodzi (lustrzana walidacja serwera)
  await expect(page.getByRole('button', { name: /Zadeklaruj ✓/ })).toBeDisabled();
  await page.getByLabel(/Opis miejsca/).fill('sala GOK, szafa 3');
  await page.getByRole('button', { name: /Zadeklaruj ✓/ }).click();
  await expect(page.getByText('Zadeklarowano ✓')).toBeVisible();
  await expect(page.getByText('🧳 sala GOK, szafa 3')).toBeVisible();
  await expect.poll(() => st.decls.length).toBe(1);

  // MEMBER nie odwołuje — przycisk ukryty, badge zamiast niego
  await expect(page.getByRole('button', { name: /Odwołaj ✕/ })).toHaveCount(0);
  await expect(page.locator('.badge', { hasText: 'aktywna' })).toBeVisible();

  // aktywna blokuje kolejne zgłoszenie — CTA znika
  await expect(page.getByRole('button', { name: /Deklaruj posiadanie 🏠/ })).toHaveCount(0);

  // pozycja ASSIGNED nie podlega deklaracji (Marynarka u Anny)
  await page.getByRole('button', { name: 'Wróć do listy' }).click();
  await page.getByRole('button', { name: 'Pozycja Marynarka' }).click();
  await expect(page.getByRole('button', { name: /Deklaruj posiadanie 🏠/ })).toHaveCount(0);
  await expect(page.getByText('najpierw zwrot, potem deklaracja')).toBeVisible();
});

test('B14 deklaracja: ADMIN odwołuje i można zadeklarować od nowa', async ({ page }) => {
  const st = await seed(page, 'ADMIN');
  await openEkwipunek(page);

  await page.getByRole('button', { name: 'Pozycja Spodnie' }).click();
  await page.getByRole('button', { name: /Deklaruj posiadanie 🏠/ }).click();
  await page.getByLabel(/Kto składa/).selectOption('13');
  await page.getByLabel(/U kogo jest pozycja/).selectOption('12');
  await page.getByLabel(/Notatka/).fill('od lat w piwnicy u prezesa');
  await page.getByRole('button', { name: /Zadeklaruj ✓/ }).click();
  await expect(page.getByText('Zadeklarowano ✓')).toBeVisible();
  await expect(page.getByText('🏠 Anna Nowak')).toBeVisible();
  await expect(page.getByText('od lat w piwnicy u prezesa')).toBeVisible();

  // ADMIN odwołuje
  await page.getByRole('button', { name: /Odwołaj ✕/ }).click();
  await expect(page.getByText('Deklaracja odwołana ✓')).toBeVisible();
  await expect.poll(() => st.decls[0]?.status).toBe('REVOKED');
  await expect(page.locator('.badge', { hasText: 'odwołana' })).toBeVisible();

  // odwołana = historia; pozycja znowu się nadaje do deklaracji
  await expect(page.getByRole('button', { name: /Deklaruj posiadanie 🏠/ })).toBeVisible();
});

test('desktop (1280): szczegóły pozycji bez szyny nawigacji — menu wraca tylko na listę', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const st = await seed(page);
  await openEkwipunek(page);

  await page.getByRole('button', { name: /Pozycja FL-01/ }).click();
  await expect(page.getByRole('heading', { name: /FL-01/ })).toBeVisible();

  // konwencja trybu pracy: w szczegółach NIE ma paska Pulpit/Ekwipunek/Liczenie/Konto
  // (regrecja po bugu "menu wpada pod przyciski akcji" 2026-10),
  await expect(page.locator('nav, .tabs, [role="tablist"]')).toHaveCount(0);

  // powrót "‹": na liście menu WRACA,
  await page.getByRole('button', { name: 'Wróć do listy' }).click();
  await expect(page.locator('.tabs, [role="tablist"]').first()).toBeVisible();
});

test('flow v1.x: lista → szczegóły → ✎ edycja wpisu → „Zapisz zmiany” trafia do rejestru', async ({ page }) => {
  const st = await seed(page);
  await openEkwipunek(page);

  await page.getByRole('button', { name: /Pozycja FL-01/ }).click();
  await page.getByRole('button', { name: 'Edytuj pozycję' }).click();
  await expect(page.getByRole('button', { name: 'Zapisz zmiany' })).toBeVisible();

  await page.getByLabel(/Liczba zaworów/).fill('16');
  await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

  // powrót do szczegółów z nowymi danymi (reload po onDone) — tożsamość = kod FL-01
  await expect(page.getByRole('heading', { name: /FL-01/ })).toBeVisible();

  // zapis poszedł PUT-em na serwer: snapshot PRZED edycją + nowy stan mocka
  await expect.poll(() => st.updated.length).toBe(1);
  expect(st.updated[0].name).toBe('Flet');
  expect(st.updated[0].attrs[4]).toBe('3');
  expect(st.items[0].attrs).toEqual({ 4: '16' });

  // i widać to na liście — tożsamość wiersza = kod FL-01 (nazwa wtórna)
  await page.getByRole('button', { name: 'Wróć do listy' }).click();
  await expect(page.getByRole('button', { name: /Pozycja FL-01/ })).toBeVisible();
});
