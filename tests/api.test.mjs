import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../lib/client/api.mjs';

test('an unconfigured frontend stays closed without sending any booking data', async () => {
  const request = createApiClient('', () => { throw new Error('must not send'); });
  const availability = await (await request('/api/availability?duration=30')).json();
  assert.equal(availability.ready, false);
  assert.deepEqual(availability.slots, []);
  const response = await request('/api/book', { method: 'POST', body: '{"email":"test@example.com"}' });
  assert.equal(response.status, 503);
});

test('requests preserve headers and abort signals while using the independent API origin', async () => {
  const signal = new AbortController().signal;
  let actual;
  const request = createApiClient('https://booking.example.com', async (...args) => {
    actual = args;
    return Response.json({status:'pending'});
  });
  const options = {headers: {Authorization:'Bearer test-only-token'}, signal};
  await request('/api/bookings/abc', options);
  assert.equal(actual[0], 'https://booking.example.com/api/bookings/abc');
  assert.equal(actual[1], options);
});

test('API requests reject insecure destinations and paths outside the API', async () => {
  for (const origin of ['http://example.com','https://user:password@example.com','https://example.com/path']) {
    assert.throws(() => createApiClient(origin), /API origin/);
  }
  const request = createApiClient('https://api.example.com', () => {throw new Error('must not send');});
  await assert.rejects(() => request('//other.example/api/book'), /API path/);
});
