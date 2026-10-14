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
    writes: 0,
  };
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
