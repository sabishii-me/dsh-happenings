import { expect, test } from '@playwright/test';

test.describe('calendar', () => {
  test.beforeEach(async ({ page }) => {
    // Pin the locale so assertions do not depend on the browser's language.
    await page.goto('/?lang=zh');
    await expect(page.locator('.fc-daygrid-event').first()).toBeVisible({ timeout: 20_000 });
  });

  test('renders a multi-day event as bars spanning days, not one chip per day', async ({ page }) => {
    const cell = await page.locator('.fc-daygrid-day').first().boundingBox();
    expect(cell).not.toBeNull();

    const segments = page.locator('.fc-daygrid-event', { hasText: 'GGX NEXUS JAM' });
    const count = await segments.count();
    expect(count).toBeGreaterThan(0);

    // FullCalendar splits a long run into one segment per week row. The point is
    // that it is a handful of bars, not one chip for each of its ~100 days.
    expect(count).toBeLessThanOrEqual(8);

    const first = await segments.first().boundingBox();
    expect(first).not.toBeNull();
    expect(first!.width).toBeGreaterThan(cell!.width * 2.5);
  });

  test('a one-day event stays one column wide', async ({ page }) => {
    const cell = await page.locator('.fc-daygrid-day').first().boundingBox();
    const single = page.locator('.fc-daygrid-event', { hasText: 'Tokyo Indies' }).first();
    if ((await single.count()) === 0) test.skip(true, 'single-day event not in this month');
    const box = await single.boundingBox();
    expect(box!.width).toBeLessThan(cell!.width * 1.6);
  });

  test('clicking an event opens it in a new tab and keeps the page in place', async ({ page, context }) => {
    const link = page.locator('a.fc-event[href]').first();
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^https?:\/\//u);

    const before = page.url();
    const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await popup.waitForLoadState('domcontentloaded').catch(() => undefined);
    expect(popup.url()).toContain(new URL(href!).host);
    expect(page.url()).toBe(before);

    await popup.close();
  });

  test('the "more" link opens the day drawer, not an in-page jump', async ({ page }) => {
    const before = page.url();
    const more = page.locator('.fc-more-link').first();
    await expect(more).toBeVisible();
    await more.click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('li').first()).toBeVisible();

    // Drawer items are real links opening in a new tab.
    const item = drawer.locator('a[href^="http"]').first();
    await expect(item).toHaveAttribute('target', '_blank');

    expect(page.url()).toBe(before);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('topic filters change what the calendar asks for and shows', async ({ page }) => {
    const request = page.waitForRequest((req) => req.url().includes('/api/events') && req.url().includes('topics=meetup'));
    await page.locator('[title="meetup"]').click();
    await request;
    await expect(page.locator('[title="meetup"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('switching language re-renders the chrome and the calendar', async ({ page }) => {
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Refresh now' })).toBeVisible();
    await expect(page.locator('.fc-today-button')).toHaveText('Today');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(page.url()).toContain('lang=en');

    await page.getByRole('button', { name: '日本語' }).click();
    await expect(page.getByRole('button', { name: '今すぐ更新' })).toBeVisible();
    await expect(page.locator('.fc-today-button')).toHaveText('今日');
  });

  test('the week view is available and keeps multi-day bars', async ({ page }) => {
    await page.getByRole('button', { name: '周' }).click();
    await expect(page.locator('.fc-timegrid')).toBeVisible();

    // All-day events keep their spanning bars in the week view's all-day row.
    const bar = page.locator('.fc-timegrid .fc-daygrid-event', { hasText: 'GGX NEXUS JAM' }).first();
    await expect(bar).toBeVisible();
    const cellWidth = (await page.locator('.fc-timegrid-col').first().boundingBox())?.width ?? 0;
    const barWidth = (await bar.boundingBox())?.width ?? 0;
    expect(barWidth).toBeGreaterThan(cellWidth);
  });
});
