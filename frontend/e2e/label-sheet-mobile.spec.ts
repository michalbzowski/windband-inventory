import { test, expect, type Route } from '@playwright/test';

// Regression: sheet „Etykieta pozycji” na mobile (viewport 390×844, dokument dłuższy
// niż okno) MUSI być w całości w widoku od razu — bez przewijania strony.
// Przyczyna historyczna: .dim miało position:absolute → sheet przyklejony do dna
// DOKUMENTU, poza viewportem gdy strona jest przewinięta/węższym oknie.
test.use({ viewport: { width: 390, height: 844 } });

const BAND = { bandId: 1, name: 'Orkiestra', role: 'ADMIN' };
const ITEM = {
  id: 1, bandId: 1, name: 'Flet koncertowy', type: 'INSTRUMENT', lifecycleStatus: 'ASSIGNED',
  warehouse: 'MAIN', serialNumber: 'FL-1', description: null, notes: null, attributes: [],
  assignedMemberId: 22, assignedMemberName: 'Nadia Białas', nextServiceDate: null,
};

async function ok(route: Route, data: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
}

test('etykieta na mobile: otwiera się w granicach widoku bez scrollowania', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('wi.session', JSON.stringify({
      accessToken: 'test-token', idToken: 'x', expiresAt: Date.now() + 3_600_000,
      user: { sub: 'subj-1', firstName: 'Test', lastName: 'Osoba' },
    }));
  });
  await page.route('**/api/v1/me/bands', (r) => ok(r, [BAND]));
  await page.route('**/api/inventory/**', (r) => ok(r, []));
  await page.route(/\/api\/inventory\/items\/1\/assignments(\?.*)?$/, (r) => ok(r, []));
  await page.route(/\/api\/inventory\/items\/1(\?.*)?$/, (r) => ok(r, ITEM));
  await page.route(/\/api\/inventory\/items\?/, (r) => ok(r, [ITEM]));
  await page.route(/^.*\/api\/inventory\/items$/, (r) => ok(r, [ITEM]));

  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Nawigacja główna' });
  await nav.getByRole('button', { name: '🎒 Ekwipunek' }).click();
  await expect(page.getByRole('heading', { name: 'Ekwipunek' })).toBeVisible();
  await page.getByRole('button', { name: /Pozycja FL-1/ }).click();
  await expect(page.getByRole('heading', { name: /FL-1/ })).toBeVisible();

  // użytkownik czyta dół strony (content scrolluje wewnętrznie — shell mobile),
  // potem klika 🏷 (przycisk wraca w widok)
  await page.locator('.content').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.getByRole('button', { name: 'Etykieta pozycji — wydrukuj kod QR' }).click();

  const dialog = page.getByRole('dialog', { name: 'Etykieta pozycji' });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box, 'dialog nie ma bounding box').not.toBeNull();
  // pełny dialog musi mieścić się w oknie 390×844 — bez przewijania strony
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await expect(dialog.getByRole('button', { name: 'Drukuj' })).toBeVisible();
  await expect(dialog.locator('img.label-qr')).toHaveAttribute('src', /^data:image\/png;base64/);
});
