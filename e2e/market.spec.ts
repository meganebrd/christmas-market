import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end: the market opens, the visitor enters, talks to an artisan, asks a question
 * (answered without AI), opens a stall's showcase and travels with the map.
 */

async function boot(page: Page, params: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('GL Driver')) errors.push(m.text());
  });
  await page.goto(`/?${params}`);
  await page.waitForFunction(() => (window as any).__givrelune?.ready, null, { timeout: 120_000 });
  return errors;
}

const mode = (page: Page) => page.evaluate(() => (window as any).__givrelune.ctx.mode as string);

/** Presses the "continue" key until the free-text field of the dialogue shows up. */
async function advanceToQuestion(page: Page) {
  const input = page.locator('.gl-ask__input');
  for (let i = 0; i < 12 && !(await input.isVisible()); i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
  }
  await expect(input).toBeVisible();
}

test('title screen → enter → intro can be skipped', async ({ page }) => {
  const errors = await boot(page, 'fresh&mute');
  const enter = page.getByRole('button', { name: /entrer/i });
  await expect(enter).toBeVisible();
  await enter.click();
  await expect.poll(() => mode(page), { timeout: 20_000 }).toBe('cinematic');
  await page.keyboard.press('Escape');
  await expect.poll(() => mode(page), { timeout: 30_000 }).toMatch(/explore|dialogue/);
  expect(errors).toEqual([]);
});

test('talk to an artisan and get an answer from her own texts', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'keyboard flow');
  const errors = await boot(page, 'skipIntro&fresh&mute');
  await page.evaluate(() => (window as any).__givrelune.travelTo('stall:la-meche-doree'));
  await page.waitForTimeout(1500);
  await page.keyboard.press('e');
  await expect(page.locator('.gl-dlg')).toBeVisible({ timeout: 15_000 });
  expect(await mode(page)).toBe('dialogue');
  await advanceToQuestion(page);
  await page.locator('.gl-ask__input').fill('Tu livres ?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.keyboard.press('Space'); // finish the typewriter
  await expect(page.locator('.gl-dlg__text')).toContainText(/Colissimo|50/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('stall showcase lists products with links to the shop', async ({ page }) => {
  const errors = await boot(page, 'skipIntro&fresh&mute');
  await page.evaluate(() => (window as any).__givrelune.openStall('la-meche-doree'));
  await expect(page.locator('.gl-product')).toHaveCount(4);
  await expect(page.getByRole('link', { name: /visiter le site/i })).toHaveAttribute('href', /example\.com/);
  await page.keyboard.press('Escape');
  await expect.poll(() => mode(page)).toBe('explore');
  expect(errors).toEqual([]);
});

test('map: travel to the bar', async ({ page }) => {
  const errors = await boot(page, 'skipIntro&fresh&mute');
  await page.evaluate(() => {
    const g = (window as any).__givrelune;
    g.setMode('map');
    g.ctx.ui.openMap();
  });
  await expect(page.locator('.gl-map')).toBeVisible();
  await page.locator('.gl-legend__item', { hasText: 'Le Chaudron Doré' }).first().click();
  await expect.poll(() => mode(page), { timeout: 15_000 }).toBe('explore');
  await page.waitForTimeout(1500);
  const zone = await page.evaluate(() => {
    const g = (window as any).__givrelune.ctx;
    return g.layout.zoneAt(g.player.position.x, g.player.position.z);
  });
  expect(zone).toBe('bar');
  expect(errors).toEqual([]);
});

test('touch devices get a joystick and an action button', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile only');
  const errors = await boot(page, 'skipIntro&fresh&mute');
  await expect(page.locator('.gl-action')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the market recovers when the GPU drops the WebGL context', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'same code path as desktop');
  const errors = await boot(page, 'skipIntro&fresh&mute');
  const gl = () => page.evaluate(() => (window as any).__givrelune.render());
  expect(await page.evaluate(() => (window as any).__givrelune.simulateContextLoss(1500))).toBe(true);
  // a notice covers the canvas instead of a black screen…
  await expect(page.locator('.gl-gpu.is-on')).toBeVisible({ timeout: 5_000 });
  expect((await gl()).contextLost).toBe(true);
  // …until the context is back, shaders rebuilt and the market drawn again
  await expect(page.locator('.gl-gpu.is-on')).toHaveCount(0, { timeout: 30_000 });
  const after = await gl();
  expect(after.contextLost).toBe(false);
  expect(after.contextLosses).toBe(1);
  expect(after.level).toBeGreaterThanOrEqual(2); // lighter frames from now on
  expect(await mode(page)).toBe('explore');
  expect(errors).toEqual([]);
});
