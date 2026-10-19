import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 } });

/**
 * Segment „Serwis” deski Zamówienia i serwis (B15 stage 3): siedmiostanowy flow
 * REQUESTED → … → HANDLED_OVER z bramką ról (akcje tylko ADMIN), jednym przejściem
 * do przodu na kartę, notką dowodową przy przekazaniu/anulowaniu i guardem
 * „jedno otwarte zgłoszenie na pozycję”.
 */

interface JobRow {
  id: number; bandId: number; itemId: number;
  itemName: string; itemSerialNumber: string | null;
  reporterMemberId: number | null; reporterName: string | null;
  status: string; note: string | null; resolutionNote: string | null;
  createdByMemberId: number | null; createdByName: string | null;
  createdAt: string; shippedAt: string | null; returnedAt: string | null;
  handedOverAt: string | null; cancelledAt: string | null;
}

const ALLOWED: Record<string, string[]> = {
  REQUESTED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['REPAIRED'],
  REPAIRED: ['READY_FOR_PICKUP'],
  READY_FOR_PICKUP: ['IN_STOCK'],
  IN_STOCK: ['HANDLED_OVER'],
  HANDLED_OVER: [],
  CANCELLED: [],
};

async function mockApi(
  page: Page,
  role: 'ADMIN' | 'MEMBER',
  jobs: JobRow[],
  captured: { createBodies: Array<Record<string, unknown>>; statusBodies: Array<Record<string, unknown>> },
) {
  await page.addInitScript(() => {
    sessionStorage.setItem('wi.session', JSON.stringify({
      accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
      user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
    }));
  });
  await page.route('**/api/v1/me/bands', (r) =>
    r.fulfill({ json: [{ bandId: 7, name: 'Orkiestra', role }] }));
  await page.route('**/api/v1/bands/*/members', (r) =>
    r.fulfill({ json: [
      { memberId: 11, firstName: 'Jan', lastName: 'Kowalski', active: true, expectedSet: [] },
      { memberId: 12, firstName: 'Bolesław', lastName: 'Wąsacz', active: true, expectedSet: [] },
    ] }));
  await page.route('**/api/inventory/**', (r) => r.fulfill({ json: [] })); // catch-all FIRST (LIFO!)

  const items = [
    { id: 9, name: 'Flet Yamaha 467', type: 'INSTRUMENT', serialNumber: 'FL-467', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', assignedMemberId: 11 },
    { id: 8, name: 'Tuba Johann Sebastian Bach', type: 'INSTRUMENT', serialNumber: 'TB-2', lifecycleStatus: 'AVAILABLE', warehouse: 'MAIN', assignedMemberId: null },
  ];
  await page.route(/\/api\/inventory\/items(\?.*)?$/, (r) => r.fulfill({ json: items }));

  let clock = Date.now();
  const nextStamp = () => new Date(clock + 1000).toISOString();

  await page.route(/\/api\/inventory\/service-jobs(\?.*)?$/, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: jobs });
    // POST /service-jobs?bandId=7 — create
    const body = route.request().postDataJSON() as Record<string, unknown>;
    captured.createBodies.push(body);
    const itemId = body.itemId as number;
    if (jobs.some((j) => j.itemId === itemId && j.status !== 'HANDLED_OVER' && j.status !== 'CANCELLED')) {
      return route.fulfill({ status: 409, json: { error: 'Pozycja ma już otwarte zgłoszenie serwisowe.' } });
    }
    const item = items.find((i) => i.id === itemId);
    const reporterId = (body.reporterMemberId as number | undefined) ?? item?.assignedMemberId ?? null;
    const created: JobRow = {
      id: Math.max(0, ...jobs.map((j) => j.id)) + 1, bandId: 7, itemId,
      itemName: item?.name ?? '?', itemSerialNumber: item?.serialNumber ?? null,
      reporterMemberId: reporterId,
      reporterName: reporterId === 11 ? 'Jan Kowalski' : reporterId === 12 ? 'Bolesław Wąsacz' : null,
      status: 'REQUESTED', note: (body.note as string) ?? null, resolutionNote: null,
      createdByMemberId: 5, createdByName: 'Administrator', createdAt: nextStamp(),
      shippedAt: null, returnedAt: null, handedOverAt: null, cancelledAt: null,
    };
    jobs.unshift(created);
    return route.fulfill({ status: 201, json: created });
  });

  await page.route(/\/api\/inventory\/service-jobs\/\d+\/status$/, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    captured.statusBodies.push(body);
    const job = jobs.find((j) => String(j.id) === new URL(route.request().url()).pathname.split('/')[4]);
    if (!job) return route.fulfill({ status: 404, json: { error: 'brak zgłoszenia' } });
    const target = body.status as string;
    if (!(ALLOWED[job.status] ?? []).includes(target)) {
      return route.fulfill({ status: 409, json: { error: `Nieprawidłowe przejście ${job.status} → ${target}` } });
    }
    job.status = target;
    if (target === 'SHIPPED') job.shippedAt = nextStamp();
    if (target === 'IN_STOCK') job.returnedAt = nextStamp();
    if (target === 'HANDLED_OVER' || target === 'CANCELLED') {
      job.resolutionNote = (body.note as string) ?? null;
      if (target === 'HANDLED_OVER') job.handedOverAt = nextStamp();
      else job.cancelledAt = nextStamp();
    }
    return route.fulfill({ json: job });
  });

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Nawigacja główna' }).getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await page.getByRole('button', { name: 'Zamówienia i serwis' }).click();
  await expect(page.getByRole('heading', { name: 'Zamówienia i serwis' })).toBeVisible();
}

test('ADMIN: pełny flow serwisu REQUESTED → HANDLED_OVER z notką dowodową', async ({ page }) => {
  const jobs: JobRow[] = [];
  const captured = { createBodies: [] as Array<Record<string, unknown>>, statusBodies: [] as Array<Record<string, unknown>> };
  await mockApi(page, 'ADMIN', jobs, captured);

  await page.getByRole('tab', { name: 'Serwis' }).click();

  // Create — auto-assignee from the item (Jan Kowalski) + note.
  await page.getByRole('button', { name: 'Zgłoś do serwisu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Zgłoszenie do serwisu' });
  await dialog.locator('select').first().selectOption('9');
  await expect(dialog.locator('select').nth(1)).toHaveValue('11'); // zgłaszający z przydziału
  await dialog.getByLabel(/Notatka/).fill('pęknięta nuta, wyciek pasty');
  await dialog.getByRole('button', { name: 'Zgłoś ✓' }).click();

  const row = page.locator('li', { hasText: 'Flet Yamaha 467' }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText('Zgłoszone')).toBeVisible();
  expect(captured.createBodies[0]).toEqual({ itemId: 9, reporterMemberId: 11, note: 'pęknięta nuta, wyciek pasty' });

  // Walk through the state machine; single CTA per card.
  const card = page.locator('li', { hasText: 'Flet Yamaha 467' }).first();
  await card.getByRole('button', { name: 'Wyślij do serwisu: Flet Yamaha 467' }).click();
  await expect(card.getByText('Wysłane do serwisu')).toBeVisible();

  await card.getByRole('button', { name: 'Oznacz naprawę: Flet Yamaha 467' }).click();
  await expect(card.getByText('Naprawione')).toBeVisible();

  await card.getByRole('button', { name: 'Gotowe do odbioru: Flet Yamaha 467' }).click();
  await expect(card.getByText('Do odbioru z serwisu')).toBeVisible();

  await card.getByRole('button', { name: 'Przyjęcie do magazynu: Flet Yamaha 467' }).click();
  await expect(card.getByText('W magazynie')).toBeVisible();

  // Przekazanie — notka dowodowa w sheet.
  await card.getByRole('button', { name: 'Przekaż zgłaszającemu: Flet Yamaha 467' }).click();
  const walk = page.getByRole('dialog', { name: 'Przekazano osobie zgłaszającej: Flet Yamaha 467' });
  await walk.getByLabel(/Notatka/).fill('przekazano Janowi K., odbiór własny');
  await walk.getByRole('button', { name: 'Potwierdź ✓' }).click();

  await expect(card.getByText('Przekazano osobie zgłaszającej')).toBeVisible();
  await expect(card.locator('button')).toHaveCount(0);
  expect(captured.statusBodies.at(-1)).toEqual({ status: 'HANDLED_OVER', note: 'przekazano Janowi K., odbiór własny' });
});

test('guard: pozycja z otwartym zgłoszeniem jest wyłączona z nowego zgłoszenia', async ({ page }) => {
  const jobs: JobRow[] = [{
    id: 1, bandId: 7, itemId: 9, itemName: 'Flet Yamaha 467', itemSerialNumber: 'FL-467',
    reporterMemberId: 11, reporterName: 'Jan Kowalski', status: 'SHIPPED', note: null, resolutionNote: null,
    createdByMemberId: 5, createdByName: 'Administrator', createdAt: '2026-10-18T09:00:00Z',
    shippedAt: '2026-10-18T12:00:00Z', returnedAt: null, handedOverAt: null, cancelledAt: null,
  }];
  const captured = { createBodies: [] as Array<Record<string, unknown>>, statusBodies: [] as Array<Record<string, unknown>> };
  await mockApi(page, 'ADMIN', jobs, captured);

  await page.getByRole('tab', { name: 'Serwis' }).click();
  await page.getByRole('button', { name: 'Zgłoś do serwisu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Zgłoszenie do serwisu' });
  await expect(dialog.locator('option[value="9"]')).toHaveAttribute('disabled');
});

test('chips: filtry statusów i licznik „Wszystkie” = otwarte', async ({ page }) => {
  const jobs: JobRow[] = [
    { id: 1, bandId: 7, itemId: 9, itemName: 'Flet Yamaha 467', itemSerialNumber: 'FL-467', reporterMemberId: 11, reporterName: 'Jan Kowalski', status: 'REQUESTED', note: null, resolutionNote: null, createdByMemberId: 5, createdByName: 'A', createdAt: '2026-10-18T09:00:00Z', shippedAt: null, returnedAt: null, handedOverAt: null, cancelledAt: null },
    { id: 2, bandId: 7, itemId: 8, itemName: 'Tuba Johann Sebastian Bach', itemSerialNumber: 'TB-2', reporterMemberId: 12, reporterName: 'Bolesław Wąsacz', status: 'HANDLED_OVER', note: null, resolutionNote: 'ok', createdByMemberId: 5, createdByName: 'A', createdAt: '2026-10-17T09:00:00Z', shippedAt: null, returnedAt: null, handedOverAt: '2026-10-18T10:00:00Z', cancelledAt: null },
  ];
  const captured = { createBodies: [] as Array<Record<string, unknown>>, statusBodies: [] as Array<Record<string, unknown>> };
  await mockApi(page, 'ADMIN', jobs, captured);

  await page.getByRole('tab', { name: 'Serwis' }).click();
  await expect(page.getByRole('button', { name: /Wszystkie/ })).toHaveText(/1/); // licznik = tylko otwarte
  await expect(page.locator('li')).toHaveCount(2);

  const group = page.locator('[role="group"][aria-label*="zgłoszeń"]').last();
  await group.locator('.chip', { hasText: /^Zgłoszone/ }).click();
  await expect(page.locator('li')).toHaveCount(1);
  await expect(page.locator('li').first()).toContainText('Flet Yamaha 467');

  await group.locator('.chip', { hasText: /Przekazano osobie zgłaszającej/ }).click();
  await expect(page.locator('li')).toHaveCount(1);
  await expect(page.locator('li').first()).toContainText('Tuba Johann Sebastian Bach');
});

test('MEMBER: widok tylko do odczytu — brak CTA i przycisków akcji', async ({ page }) => {
  const jobs: JobRow[] = [{
    id: 1, bandId: 7, itemId: 9, itemName: 'Flet Yamaha 467', itemSerialNumber: 'FL-467',
    reporterMemberId: 11, reporterName: 'Jan Kowalski', status: 'REQUESTED', note: null, resolutionNote: null,
    createdByMemberId: 5, createdByName: 'Administrator', createdAt: '2026-10-18T09:00:00Z',
    shippedAt: null, returnedAt: null, handedOverAt: null, cancelledAt: null,
  }];
  const captured = { createBodies: [] as Array<Record<string, unknown>>, statusBodies: [] as Array<Record<string, unknown>> };
  await mockApi(page, 'MEMBER', jobs, captured);

  await page.getByRole('tab', { name: 'Serwis' }).click();
  await expect(page.getByRole('button', { name: 'Zgłoś do serwisu' })).not.toBeVisible();
  await expect(page.locator('li', { hasText: 'Flet Yamaha 467' }).locator('button')).toHaveCount(0);
});
