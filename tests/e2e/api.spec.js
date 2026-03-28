const { test, expect, request } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:80';

test.describe('API Endpoints', () => {

  test('GET /health returns healthy status', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('physioguard');
    expect(body.timestamp).toBeTruthy();
  });

  test('GET /health responds within 500ms', async ({ request }) => {
    const start = Date.now();
    const response = await request.get(`${BASE_URL}/health`);
    const duration = Date.now() - start;

    expect(response.status()).toBe(200);
    expect(duration).toBeLessThan(500);
  });

  test('GET /api/exercises returns exercise list', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/exercises`);

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.exercises).toBeDefined();
    expect(Array.isArray(body.exercises)).toBe(true);
    expect(body.exercises.length).toBe(6);
  });

  test('GET /api/exercises has correct exercise structure', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/exercises`);
    const body = await response.json();

    const exercise = body.exercises[0];
    expect(exercise.key).toBeDefined();
    expect(exercise.name).toBeDefined();
    expect(exercise.description).toBeDefined();
    expect(exercise.reference_image).toBeDefined();
  });

  test('GET /api/exercises contains all 6 exercises', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/exercises`);
    const body = await response.json();

    const exerciseKeys = body.exercises.map(e => e.key);
    expect(exerciseKeys).toContain('bicep_curl');
    expect(exerciseKeys).toContain('squat');
    expect(exerciseKeys).toContain('shoulder_press');
    expect(exerciseKeys).toContain('lunge');
    expect(exerciseKeys).toContain('knee_extension');
    expect(exerciseKeys).toContain('lateral_arm_raise');
  });

  test('POST /api/save_session saves valid session', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/save_session`, {
      data: {
        exercise: 'bicep_curl',
        reps: 10,
        avg_score: 85.5,
        best_score: 95.0,
        duration_seconds: 60
      }
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('saved');
    expect(body.timestamp).toBeTruthy();
  });

  test('POST /api/save_session rejects missing fields', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/save_session`, {
      data: {
        exercise: 'bicep_curl'
        // Missing reps and avg_score
      }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/save_session rejects empty body', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/save_session`, {
      headers: { 'Content-Type': 'application/json' },
      data: {}
    });

    expect(response.status()).toBe(400);
  });

  test('GET /reference_images/correct_bicep_curl.png returns image', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/reference_images/correct_bicep_curl.png`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image');
  });

  test('GET /reference_images returns 400 for non-image files', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/reference_images/malicious.php`);
    expect(response.status()).toBe(400);
  });

  test('GET static JS files return 200', async ({ request }) => {
    const jsFiles = ['app.js', 'pose_engine.js', 'exercise_analyzer.js'];

    for (const file of jsFiles) {
      const response = await request.get(`${BASE_URL}/static/js/${file}`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('javascript');
    }
  });

  test('GET /api/health alias works', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/health`);
    expect(response.status()).toBe(200);
  });

  test('GET nonexistent route returns 404', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/nonexistent-route-xyz`);
    expect(response.status()).toBe(404);
  });
});
