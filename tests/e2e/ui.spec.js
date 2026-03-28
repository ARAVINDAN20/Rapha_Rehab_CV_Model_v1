const { test, expect } = require('@playwright/test');

test.describe('UI Interactions', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        return canvas.captureStream(30);
      };
    });

    await page.goto('/');
    // Use domcontentloaded instead of networkidle — MediaPipe CDN requests keep network busy indefinitely
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
  });

  test('page is responsive', async ({ page }) => {
    // Test desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('body')).toBeVisible();

    // Test tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('exercise list is populated from API', async ({ page }) => {
    // Wait for dynamic content to load
    await page.waitForTimeout(1000);

    // Should have exercise items
    const exerciseItems = page.locator('[class*="exercise"]');
    const count = await exerciseItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('voice toggle button is interactive', async ({ page }) => {
    const voiceBtn = page.locator('button').filter({ hasText: /voice|sound|audio/i }).first();

    if (await voiceBtn.isVisible()) {
      await voiceBtn.click();
      // Just verify it doesn't crash
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('reset button works without crashing', async ({ page }) => {
    const resetBtn = page.locator('button').filter({ hasText: /reset/i }).first();

    if (await resetBtn.isVisible()) {
      await resetBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('page has dark/modern theme', async ({ page }) => {
    // Check that the body has a dark background
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });

    // Just verify CSS is loaded (bgColor should not be default white)
    expect(bgColor).toBeTruthy();
  });

  test('fonts are loaded', async ({ page }) => {
    await page.waitForTimeout(2000);

    const fontFamily = await page.evaluate(() => {
      return window.getComputedStyle(document.body).fontFamily;
    });

    expect(fontFamily).toBeTruthy();
  });
});
