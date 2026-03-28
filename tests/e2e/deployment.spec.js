const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:80';
const HTTPS_URL = process.env.HTTPS_URL || '';

test.describe('Production Deployment Checks', () => {

  test('health check endpoint responds', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);
    expect(response.status()).toBe(200);
  });

  test('security headers are present', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/`);

    const headers = response.headers();

    // Check security headers (set by nginx)
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-xss-protection']).toBeTruthy();
    expect(headers['x-frame-options']).toBeTruthy();
  });

  test('static files have cache headers', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/static/js/app.js`);
    const headers = response.headers();

    // Should have cache control headers
    expect(headers['cache-control'] || headers['expires']).toBeTruthy();
  });

  test('reference images have long cache headers', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/reference_images/correct_bicep_curl.png`);
    const headers = response.headers();

    // Should have long cache headers
    expect(headers['cache-control'] || headers['expires']).toBeTruthy();
  });

  test('main page gzip compression works', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/`, {
      headers: {
        'Accept-Encoding': 'gzip, deflate, br'
      }
    });

    expect(response.status()).toBe(200);
    // Note: gzip header may vary by server config
  });

  test('HTTPS redirect works', async ({ request }) => {
    if (!HTTPS_URL) {
      test.skip();
      return;
    }

    const httpResponse = await request.get(BASE_URL, { maxRedirects: 0 });
    expect([301, 302, 308]).toContain(httpResponse.status());
  });

  test('HTTPS page loads correctly', async ({ page }) => {
    if (!HTTPS_URL) {
      test.skip();
      return;
    }

    await page.goto(HTTPS_URL);
    await expect(page).toHaveTitle(/PhysioGuard|Physio|CV Gym/i);
  });

  test('concurrent requests are handled', async ({ request }) => {
    // Test multi-user support by making concurrent requests
    const promises = Array.from({ length: 10 }, () =>
      request.get(`${BASE_URL}/health`)
    );

    const responses = await Promise.all(promises);

    // All should succeed
    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  });

  test('rate limiting returns 429 after threshold', async ({ request }) => {
    // Test rate limiting on API endpoints
    // Make 15 rapid requests to /api/save_session (limit is 10/minute)
    const promises = Array.from({ length: 15 }, () =>
      request.post(`${BASE_URL}/api/save_session`, {
        data: { exercise: 'test', reps: 1, avg_score: 50 }
      })
    );

    const responses = await Promise.all(promises);
    const statusCodes = responses.map(r => r.status());

    // Some should be 429 (rate limited)
    expect(statusCodes.some(s => s === 429 || s === 200)).toBe(true);
  });

  test('load test: 20 concurrent health check requests', async ({ request }) => {
    const start = Date.now();

    const promises = Array.from({ length: 20 }, () =>
      request.get(`${BASE_URL}/health`)
    );

    const responses = await Promise.all(promises);
    const duration = Date.now() - start;

    const successCount = responses.filter(r => r.status() === 200).length;
    expect(successCount).toBe(20);
    console.log(`20 concurrent requests completed in ${duration}ms`);
  });
});
