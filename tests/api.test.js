const request = require('supertest');
const { app, pool } = require('../server');

describe('Health check', () => {
  afterAll(() => pool.end());

  it('responds with status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});
