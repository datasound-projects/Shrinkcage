import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { makeServer } from '../server/http.js';
import type { Dashboard } from '../server/types.js';

test('HTTP boundary rejects remote hosts, origins, mutations and arbitrary URL parameters', async () => {
  let collections = 0;
  const server = makeServer(async () => { collections++; return { updatedAt: 'test' } as Dashboard; });
  await new Promise<void>((resolve,reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const call = (path: string, extra: { method?: string; headers?: Record<string,string> } = {}) => new Promise<{ status: number; body: string }>((resolve,reject) => {
    const req = request({ host: '127.0.0.1', port: address.port, path, ...extra }, res => { let body=''; res.on('data', x => body += x); res.on('end', () => resolve({ status: res.statusCode!, body })); }); req.on('error', reject); req.end();
  });
  try {
    assert.equal((await call('/api/health')).status, 200);
    assert.equal((await call('/api/metrics')).status, 200); assert.equal(collections, 1);
    assert.equal((await call('/api/metrics?url=http://example.com')).status, 400);
    assert.equal((await call('/api/metrics', { method:'POST' })).status, 405);
    assert.equal((await call('/api/metrics', { headers: { Host: 'attacker.test:8790' } })).status, 403);
    assert.equal((await call('/api/metrics', { headers: { Origin: 'https://attacker.test' } })).status, 403);
    assert.equal((await call('/api/metrics', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await call('/%2e%2e%2fpackage.json')).status, 404);
    assert.equal(collections, 1, 'rejected requests must never invoke collectors');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
