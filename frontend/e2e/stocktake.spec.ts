import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Mock server — mirrors the canonical F5 contract exactly:
 *  POST /api/inventory/stocktakes?bandId=  (single-open guard → 409)
 *  GET  /api/inventory/stocktakes[/{id}[/lines|/summary]]
 *  PUT  /api/inventory/stocktakes/{id}/lines/{lineId}
 *  POST /api/inventory/stocktakes/{id}/lines
 *  PATCH /api/inventory/stocktakes/{id}/pause|resume|close
 */

interface Line {
  id: number;
  itemId: number;
  name: string;
  serialNumber: string | null;
  assignedMemberName: string | null;
  expectedStatus: string;
  foundState: string | null;
  note: string | null;
  countedByMemberId: number | null;
  countedByMemberName: string | null;
  countedAt: string | null;
  extra: boolean;
}

function makeState() {
  return {
    items: [
      { id: 1, name: 'Flet', type: 'INSTRUMENT', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', serialNumber: 'FL-01', assignedMemberName: null },
      { id: 2, name: 'Tuba', type: 'INSTRUMENT', lifecycleStatus: 'ASSIGNED', warehouse: 'MAIN', serialNumber: null, assignedMemberName: 'Adam Stary' },
      { id: 3, name: 'Klarnet', type: 'INSTRUMENT', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', serialNumber: 'KL-07', assignedMemberName: null },
    ],
    stocktake: null as null | { id: number; status: string; notes: string | null; startedAt: string; finishedAt: string | null; startedBySubject: string | null },
    lines: [] as Line[],
    nextLineId: 104,
    needs: [] as NeedRow[],
    nextNeedId: 501,
    writes: 0,
  };
}

/** 1:1 z NeedQueryService.NeedView (nazwy pól zamrożone w wierszu dowodu). */
interface NeedRow {
  id: number; bandId: number; itemId: number; name: string; serialNumber: string | null;
  quantity: number; status: string; note: string | null; resolutionNote: string | null;
  createdMemberId: number | null; createdMemberName: string | null; createdAt: string; resolvedAt: string | null;
}

type State = ReturnType<typeof makeState>;

async function json(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}

async function mockInventory(route: Route, st: State): Promise<void> {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname.replace('/api/inventory', '');
  const m = req.method();
  const body = req.postDataJSON?.() ?? {};

  if (p === '/items' && m === 'GET') {
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    let items = st.items;
    if (status) items = items.filter((i) => i.lifecycleStatus === status);
    if (type) items = items.filter((i) => i.type === type);
    return json(route, items);
  }
  if (p === '/stocktakes' && m === 'POST') {
    if (st.stocktake && st.stocktake.status !== 'CLOSED') {
      return json(route, { error: 'status_conflict', message: 'Zespół ma już otwarty spis' }, 409);
    }
    st.stocktake = {
      id: 7, status: 'IN_PROGRESS', notes: (body.notes as string) ?? null,
      startedAt: new Date().toISOString(), finishedAt: null, startedBySubject: 'admin-subj',
    };
    st.lines = st.items.map((it, idx) => ({
      id: 101 + idx, itemId: it.id, name: it.name, serialNumber: it.serialNumber,
      assignedMemberName: it.assignedMemberName, expectedStatus: it.lifecycleStatus,
      foundState: null, note: null, countedByMemberId: null, countedByMemberName: null,
      countedAt: null, extra: false,
    }));
    return json(route, view(st));
  }
  if (p === '/stocktakes' && m === 'GET') return json(route, st.stocktake ? [view(st)] : []);
  if (!st.stocktake) return json(route, { error: 'not_found' }, 404);

  if (p === '/stocktakes/7') return json(route, view(st));
  if (p === '/stocktakes/7/lines' && m === 'GET') {
    const state = url.searchParams.get('state');
    return json(route, state ? st.lines.filter((l) => l.foundState === state) : st.lines);
  }
  if (p === '/stocktakes/7/summary') {
    const counted = st.lines.filter((l) => l.foundState !== null).length;
    const extra = st.lines.filter((l) => l.extra).length;
    const missing = st.lines.filter((l) => l.foundState === 'MISSING').length;
    const broken = st.lines.filter((l) => l.foundState === 'BROKEN').length;
    const ok = st.lines.filter((l) => l.foundState === 'OK').length;
    return json(route, {
      id: 7, status: st.stocktake.status, startedAt: st.stocktake.startedAt,
      finishedAt: st.stocktake.finishedAt, total: st.lines.length, counted,
      uncounted: st.lines.length - counted, divergences: missing + broken + extra,
      ok, missing, broken, extra,
    });
  }
  const linePut = p.match(/^\/stocktakes\/7\/lines\/(\d+)$/);
  if (linePut && m === 'PUT') {
    if (st.stocktake.status !== 'IN_PROGRESS') return json(route, { error: 'status_conflict' }, 409);
    const line = st.lines.find((l) => l.id === Number(linePut[1]));
    if (!line) return json(route, { error: 'not_found' }, 404);
    line.foundState = body.foundState as string;
    line.note = (body.note as string) ?? null;
    line.countedByMemberId = body.countedMemberId as number;
    line.countedByMemberName = 'Anna Nowak';
    line.countedAt = new Date().toISOString();
    st.writes += 1;
    return json(route, line);
  }
  if (p === '/stocktakes/7/lines' && m === 'POST') {
    if (st.stocktake.status !== 'IN_PROGRESS') return json(route, { error: 'status_conflict' }, 409);
    if (st.lines.some((l) => l.itemId === body.itemId)) return json(route, { error: 'duplicated' }, 409);
    const item = st.items.find((i) => i.id === body.itemId);
    const line: Line = {
      id: st.nextLineId++, itemId: body.itemId as number, name: item?.name ?? 'Obcy',
      serialNumber: item?.serialNumber ?? null, assignedMemberName: null,
      expectedStatus: 'AVAILABLE', foundState: 'EXTRA', note: (body.note as string) ?? null,
      countedByMemberId: body.countedMemberId as number, countedByMemberName: 'Anna Nowak',
      countedAt: new Date().toISOString(), extra: true,
    };
    st.lines.push(line);
    st.writes += 1;
    return json(route, line, 201);
  }
  const patch = p.match(/^\/stocktakes\/7\/(pause|resume|close)$/);
  if (patch && m === 'PATCH') {
    const next = { pause: 'DRAFT', resume: 'IN_PROGRESS', close: 'CLOSED' }[patch[1]] as string;
    if (patch[1] === 'pause' && st.stocktake.status !== 'IN_PROGRESS') return json(route, { error: 'status_conflict' }, 409);
    if (patch[1] === 'resume' && st.stocktake.status !== 'DRAFT') return json(route, { error: 'status_conflict' }, 409);
    if (patch[1] === 'close' && st.stocktake.status !== 'IN_PROGRESS') return json(route, { error: 'status_conflict' }, 409);
    st.stocktake.status = next;
    if (next === 'CLOSED') st.stocktake.finishedAt = new Date().toISOString();
    return json(route, view(st));
  }
  // --- Potrzeby/Zamówienia (v1.x #3) — lustrzane reguły domenowe ---
  if (p === '/needs' && m === 'GET') {
    const status = url.searchParams.get('status');
    return json(route, status ? st.needs.filter((n) => n.status === status) : st.needs);
  }
  if (p === '/needs' && m === 'POST') {
    const item = st.items.find((i) => i.id === body.itemId);
    if (!item) return json(route, { error: 'not_found' }, 404);
    if (st.needs.some((n) => n.itemId === item.id && (n.status === 'OPEN' || n.status === 'ORDERED'))) {
      return json(route, { error: 'status_conflict', message: 'Ta pozycja ma już niezamkniętą potrzebę — najpierw ją rozstrzygnij' }, 409);
    }
    const now = new Date().toISOString();
    const n: NeedRow = {
      id: st.nextNeedId++, bandId: 1, itemId: item.id, name: item.name, serialNumber: item.serialNumber,
      quantity: body.quantity ?? 1, status: 'OPEN', note: body.note ?? null, resolutionNote: null,
      createdMemberId: body.createdMemberId ?? 12, createdMemberName: 'Anna Nowak', createdAt: now, resolvedAt: null,
    };
    st.needs.push(n);
    st.writes++;
    return json(route, n, 201);
  }
  const needStatus = p.match(/^\/needs\/(\d+)\/status$/);
  if (needStatus && m === 'POST') {
    const n = st.needs.find((x) => x.id === Number(needStatus[1]));
    if (!n) return json(route, { error: 'not_found' }, 404);
    const target = body.status;
    const bad = (target === 'ORDERED' && n.status !== 'OPEN')
      || (target === 'RECEIVED' && n.status !== 'ORDERED')
      || (target === 'CANCELLED' && n.status !== 'OPEN' && n.status !== 'ORDERED');
    if (bad) return json(route, { error: 'status_conflict', message: 'Niedozwolone przejście statusu' }, 409);
    n.status = target;
    if (body.note) n.resolutionNote = body.note;
    if (target === 'RECEIVED' || target === 'CANCELLED') n.resolvedAt = new Date().toISOString();
    st.writes++;
    return json(route, n);
  }

  // v1.x #5: akcja „→ Serwis” (F4 kontrakt: AVAILABLE → IN_SERVICE, ADMIN)
  const serviceMatch = p.match(/^\/items\/(\d+)\/service$/);
  if (serviceMatch && m === 'POST') {
    const item = st.items.find((i) => i.id === Number(serviceMatch[1]));
    if (!item) return json(route, { error: 'not_found', message: 'Pozycja nie istnieje' }, 404);
    if (item.lifecycleStatus !== 'AVAILABLE') {
      return json(route, { error: 'status_conflict', message: 'Do serwisu wyśle tylko pozycję dostępną z magazynu' }, 409);
    }
    item.lifecycleStatus = 'IN_SERVICE';
    st.writes++;
    return json(route, item);
  }

  return json(route, { error: 'mock_miss', path: p, method: m }, 500);
}

function view(st: State) {
  const countedLines = st.lines.filter((l) => l.foundState !== null).length;
  return {
    id: st.stocktake?.id, bandId: 1, status: st.stocktake?.status,
    startedBySubject: st.stocktake?.startedBySubject, notes: st.stocktake?.notes,
    startedAt: st.stocktake?.startedAt, finishedAt: st.stocktake?.finishedAt,
    totalLines: st.lines.length, countedLines,
  };
}

async function seed(page: Page, st: State, role: 'ADMIN' | 'MEMBER' = 'ADMIN'): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'wi.session',
      JSON.stringify({
        accessToken: 'test-legacy-token', idToken: 'x',
        expiresAt: Date.now() + 3_600_000,
        user: { sub: 'admin-subj', firstName: 'Test', lastName: 'Osoba' },
      }),
    );
  });
  await page.route('**/api/v1/me/bands', (r) => json(r, [{ bandId: 1, name: 'Orkiestra', role }]));
  await page.route('**/api/v1/bands/1/members', (r) =>
    json(r, [{ memberId: 12, firstName: 'Anna', lastName: 'Nowak', active: true, expectedSet: [{ instrument: 'Flet', primary: true }] }]));
  await page.route('**/api/inventory/**', (r) => mockInventory(r, st));
}

async function startCounting(page: Page): Promise<void> {
  // single band → straight into the workspace; go to LICZENIE, pick identity, start
  await page.goto('/');
  await page.getByRole('button', { name: 'Liczenie' }).click();
  await page.getByRole('button', { name: /Anna Nowak/ }).click();
  await page.getByRole('button', { name: /Rozpocznij spis/ }).click();
  await expect(page.getByText(/Podgląd zakresu: 3 pozycji/)).toBeVisible();
  await page.getByRole('button', { name: '▶ Uruchom spis' }).click();
  await expect(page.locator('.stepper', { hasText: 'Pozycja 1 z 3' })).toBeVisible();
}

test('full stocktake: start → count → pause/resume → notes → close → frozen report', async ({ page }) => {
  const st = makeState();
  await seed(page, st);
  await startCounting(page);

  // OK with auto-advance; flushed immediately to the mock server
  await page.getByRole('button', { name: /OK — jest i sprawny/ }).click();
  await expect(page.locator('.stepper', { hasText: 'Pozycja 2 z 3' })).toBeVisible();
  await expect.poll(() => st.lines[0].foundState).toBe('OK');
  await expect(page.getByText('1/3')).toBeVisible();

  // pause (ADMIN) mid-count → resume
  await page.getByRole('button', { name: '⏸' }).click();
  await expect(page.getByText('Liczenie wstrzymane')).toBeVisible();
  await page.getByRole('button', { name: '▶ Wznów liczenie' }).click();
  await expect(page.locator('.stepper', { hasText: 'Pozycja 2 z 3' })).toBeVisible();

  // BRAK opens the optional-note panel; note is saved with the decision
  await page.getByRole('button', { name: /BRAK/ }).click();
  await page.getByPlaceholder(/np. waga w progu/).fill('waga w progu sali');
  await page.getByRole('button', { name: /Zapisz i dalej/ }).click();
  await expect(page.locator('.stepper', { hasText: 'Pozycja 3 z 3' })).toBeVisible();
  await expect.poll(() => st.lines[1].foundState).toBe('MISSING');
  await expect.poll(() => st.lines[1].note).toBe('waga w progu sali');

  // last card
  await page.getByRole('button', { name: /OK — jest i sprawny/ }).click();
  await expect(page.getByText('Wszystkie pozycje policzone')).toBeVisible();

  // close from the counting screen → CLOSED guard view
  await page.getByRole('button', { name: /Zamknij spis/ }).click();
  await expect(page.getByText('Spis zamknięty')).toBeVisible();
  await page.getByRole('button', { name: 'Wróć' }).click();

  // report of the closed stocktake — divergence + frozen stamp visible
  await page.getByRole('button', { name: /#7 —/ }).click();
  await expect(page.getByText('ZAMKNIĘTO').first()).toBeVisible();
  await expect(page.getByText('Brakuje')).toBeVisible();
  await expect(page.getByText('waga w progu sali')).toBeVisible();
});

test('offline tap survives the outage: queue holds the decision, then flushes', async ({ page, context }) => {
  const st = makeState();
  await seed(page, st);
  await startCounting(page);

  await context.setOffline(true);
  await page.getByRole('button', { name: /OK — jest i sprawny/ }).click();
  await expect(page.locator('.stepper', { hasText: 'Pozycja 2 z 3' })).toBeVisible();
  await expect(page.getByText(/kolejka: 1 do wysłania/)).toBeVisible();
  expect(st.writes).toBe(0); // nothing reached the server

  // counting continues fully offline
  await page.getByRole('button', { name: /OK — jest i sprawny/ }).click();
  await expect(page.locator('.stepper', { hasText: 'Pozycja 3 z 3' })).toBeVisible();
  await expect(page.getByText(/kolejka: 2 do wysłania/)).toBeVisible();

  await context.setOffline(false);
  await expect.poll(() => st.writes).toBe(2);
  await expect.poll(() => [st.lines[0].foundState, st.lines[1].foundState]).toEqual(['OK', 'OK']);
  await expect(page.getByText(/wszystko zsynchronizowane|zapisano przed chwilą/)).toBeVisible();
});

test('nadwyżka sheet adds EXTRA and the divergences counter grows', async ({ page }) => {
  const st = makeState();
  await seed(page, st);
  await startCounting(page);

  // a physical unit NOT in the snapshot appears in the band register after start
  st.items.push({ id: 4, name: 'Waltornia', type: 'INSTRUMENT', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', serialNumber: 'WA-9', assignedMemberName: null });

  await page.getByRole('button', { name: '＋ Nadwyżka' }).click();
  await page.locator('.sheet .srow', { hasText: 'Waltornia' }).click();
  await expect(page.getByText(/Nadwyżka: Waltornia/)).toBeVisible();
  await expect.poll(() => st.lines.some((l) => l.extra && l.foundState === 'EXTRA')).toBe(true);
  await expect(page.getByText('1/4')).toBeVisible(); // counted includes the extra
});

test('single-open guard: active stocktake hides the start CTA', async ({ page }) => {
  const st = makeState();
  await seed(page, st);
  await page.goto('/');
  await page.getByRole('button', { name: 'Liczenie' }).click();
  await page.getByRole('button', { name: /Anna Nowak/ }).click();
  await page.getByRole('button', { name: /Rozpocznij spis/ }).click();
  await page.getByRole('button', { name: '▶ Uruchom spis' }).click();
  await page.getByRole('button', { name: 'Zakończ liczenie' }).click(); // back to hub
  await expect(page.getByText('Aktywny spis')).toBeVisible();
  await expect(page.getByText('Dołącz i licz')).toBeVisible();
  await expect(page.getByRole('button', { name: /Rozpocznij spis/ })).toBeHidden();
});

test('F5 potrzeby: BRAK w raporcie → „→ Potrzeba” → Zgłoszona → Zamówiona → Dostarczona', async ({ page }) => {
  const st = makeState();
  await seed(page, st);
  await startCounting(page);

  // Flet OK, Tuba BRAK (bez notatki), Klarnet OK
  await page.getByRole('button', { name: /OK — jest i sprawny/ }).click();
  await page.getByRole('button', { name: /BRAK/ }).click();
  await page.getByRole('button', { name: /Zapisz i dalej/ }).click();
  await page.getByRole('button', { name: /OK — jest i sprawny/ }).click();
  await expect(page.getByText('Wszystkie pozycje policzone')).toBeVisible();
  await page.getByRole('button', { name: /Zamknij spis/ }).click();
  await expect(page.getByText('Spis zamknięty')).toBeVisible();
  await page.getByRole('button', { name: 'Wróć' }).click();
  await page.getByRole('button', { name: /#7 —/ }).click();
  await expect(page.getByText('Brakuje')).toBeVisible();

  // B9: akcja BRAK odblokowana — wiersz MISSING dostaje CTA „→ Potrzeba”
  const missingRow = page.locator('.panel', { hasText: 'Brakuje' }).locator('.srow', { hasText: 'Tuba' });
  await expect(missingRow.getByRole('button', { name: '→ Potrzeba' })).toBeVisible();
  await missingRow.getByRole('button', { name: '→ Potrzeba' }).click();
  await expect(page.getByRole('dialog', { name: 'Potrzeba: Tuba' })).toBeVisible();
  await page.getByRole('button', { name: 'Zgłoś potrzebę ✓' }).click();
  await expect(page.getByText('Potrzeba zgłoszona ✓')).toBeVisible();
  await expect.poll(() => st.needs.length).toBe(1);

  // CTA zmienia się w chip statusu — brak duplikatu (serwer i tak dałby 409)
  await expect(missingRow.getByText('Zgłoszona')).toBeVisible();
  await expect(missingRow.getByRole('button', { name: '→ Potrzeba' })).toHaveCount(0);

  // Panel „Potrzeby zespołu”: pełna ścieżka zamówienia
  const needRow = page.locator('.panel', { hasText: 'Potrzeby zespołu' }).locator('.srow', { hasText: 'Tuba ×1' });
  await expect(needRow.locator('.badge', { hasText: 'Zgłoszona' })).toBeVisible();
  await needRow.getByRole('button', { name: 'Zamów 📦' }).click();
  await expect(needRow.locator('.badge', { hasText: 'Zamówiona' })).toBeVisible();
  await needRow.getByRole('button', { name: 'Dostarczono ✅' }).click();
  await expect(needRow.locator('.badge', { hasText: 'Dostarczona' })).toBeVisible();
  await expect(needRow.getByRole('button', { name: 'Anuluj ✕' })).toHaveCount(0);
  await expect(needRow.getByRole('button', { name: 'Zamów 📦' })).toHaveCount(0);
});


test('liczenie v1.x #5: BRAK → „→ Potrzeba”, USZKODZONE → „→ Serwis” prosto ze spisu', async ({ page }) => {
  const st = makeState();
  await seed(page, st);
  await startCounting(page);

  // Flet OK; Tuba BRAK (bez notatki); Klarnet USZKODZONE
  await page.getByRole('button', { name: /OK — jest i sprawny/ }).click();
  await expect(page.locator('.stepper', { hasText: 'Pozycja 2 z 3' })).toBeVisible();
  await page.getByRole('button', { name: /BRAK/ }).click();
  await expect(page.getByPlaceholder(/waga w progu/)).toBeVisible();
  await page.getByRole('button', { name: /Zapisz i dalej/ }).click();
  await expect(page.locator('.stepper', { hasText: 'Pozycja 3 z 3' })).toBeVisible();
  await page.getByRole('button', { name: /USZKODZONE/ }).click();
  await expect(page.getByPlaceholder(/pęknięta czara/)).toBeVisible();
  await page.getByRole('button', { name: /Zapisz i dalej/ }).click();
  await expect(page.getByText('Wszystkie pozycje policzone')).toBeVisible();

  // panel rozbieżności z odblokowanymi akcjami (makieta 14)
  const panel = page.locator('.panel', { hasText: 'Rozbieżności — akcje' });
  await expect(panel).toBeVisible();
  const tubaRow = panel.locator('.srow', { hasText: 'Tuba' });
  const klarnetRow = panel.locator('.srow', { hasText: 'Klarnet' });

  await tubaRow.getByRole('button', { name: '→ Potrzeba' }).click();
  await expect(page.getByRole('dialog', { name: 'Potrzeba: Tuba' })).toBeVisible();
  await page.getByRole('button', { name: 'Zgłoś potrzebę ✓' }).click();
  await expect(page.getByText('Potrzeba zgłoszona ✓')).toBeVisible();
  await expect.poll(() => st.needs.length).toBe(1);
  await expect(tubaRow.locator('.badge', { hasText: 'Zgłoszona' })).toBeVisible();
  await expect(tubaRow.getByRole('button', { name: '→ Potrzeba' })).toHaveCount(0);

  await klarnetRow.getByRole('button', { name: '→ Serwis 🔧' }).click();
  await expect(page.getByText('Wysłano do serwisu 🔧✓')).toBeVisible();
  await expect.poll(() => st.items[2].lifecycleStatus).toBe('IN_SERVICE');
  await expect(klarnetRow.locator('.badge', { hasText: '🔧 wysłano' })).toBeVisible();
});

test('raport v1.x #5: Uszkodzone → „→ Serwis” (ADMIN) i Wydruk/PDF rozwija Sprawne', async ({ page }) => {
  const st = makeState();
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => { (window as unknown as { __printed: number }).__printed++; };
  });
  await seed(page, st);
  await startCounting(page);

  // Flet (AVAILABLE) → USZKODZONE; Tuba i Klarnet OK
  await page.getByRole('button', { name: /USZKODZONE/ }).click();
  await expect(page.getByPlaceholder(/pęknięta czara/)).toBeVisible();
  await page.getByRole('button', { name: /Zapisz i dalej/ }).click();
  await page.getByRole('button', { name: /OK — jest i sprawny/ }).click();
  await page.getByRole('button', { name: /OK — jest i sprawny/ }).click();
  await expect(page.getByText('Wszystkie pozycje policzone')).toBeVisible();
  await page.getByRole('button', { name: /Zamknij spis/ }).click();
  await expect(page.getByText('Spis zamknięty')).toBeVisible();
  await page.getByRole('button', { name: 'Wróć' }).click();
  await page.getByRole('button', { name: /#7 —/ }).click();

  const brokenRow = page.locator('.panel', { hasText: 'Uszkodzone' }).locator('.srow', { hasText: 'Flet' });
  await expect(brokenRow.getByRole('button', { name: '→ Serwis 🔧' })).toBeVisible();
  await brokenRow.getByRole('button', { name: '→ Serwis 🔧' }).click();
  await expect(page.getByText('Wysłano do serwisu 🔧✓')).toBeVisible();
  await expect(brokenRow.locator('.badge', { hasText: '🔧 wysłano' })).toBeVisible();
  await expect.poll(() => st.items[0].lifecycleStatus).toBe('IN_SERVICE');

  // Wydruk: przycisk rozwija sekcję Sprawne i woła drukarkę przeglądarki (stub)
  await page.getByRole('button', { name: 'Wydruk / PDF 🖨' }).click();
  await expect(page.getByRole('button', { name: /▾ Sprawne/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
});
