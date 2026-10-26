import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { memoryDb } from './helpers.mjs';
import { serve } from '../app.mjs';
const api = 'https://meet-api.example.com';
const site = 'https://meet.example.com';
const env = () => ({DB:memoryDb(), SITE_ORIGIN:site, API_ORIGIN:api, ADMIN_USERNAME:'yuchen', ADMIN_PASSWORD_HASH:createHash('sha256').update('test-only-admin-password').digest('hex')});
const auth = 'Basic ' + Buffer.from('yuchen:test-only-admin-password').toString('base64');

test('anonymous and forged hosting identities cannot read or change admin settings', async () => {
  for (const headers of [{}, {'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.com'}, {authorization:'Basic '+Buffer.from('yuchen:wrong-password').toString('base64')}]) {
    const response = await serve(new Request(api+'/api/admin',{headers}),env());
    assert.equal(response.status,401);
  }
  const response = await serve(new Request(api+'/api/admin',{headers:{authorization:auth}}),env());
  assert.equal(response.status,200);
  assert.equal((await response.json()).settings.timezone,'America/New_York');
});

test('Pages preflight supports capability headers and rejects other origins', async () => {
  const request = (origin) => new Request(api+'/api/book',{method:'OPTIONS',headers:{origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'}});
  const allowed = await serve(request(site),env());
  assert.equal(allowed.status,204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),site);
  assert.match(allowed.headers.get('Access-Control-Allow-Headers'),/Authorization/i);
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'),null);
  assert.equal((await serve(request('https://evil.example'),env())).status,403);
});

test('public availability response is readable from Pages and contains no secret or fake slots', async () => {
  const response = await serve(new Request(api+'/api/availability',{headers:{origin:site}}),env());
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),site);
  const body = await response.json();
  assert.equal(body.ready,false);
  assert.deepEqual(body.slots,[]);
});

test('OAuth callback without a valid stored state cannot connect a calendar', async () => {
  const config = env();
  const response = await serve(new Request(api+'/api/google/callback?state=forged&code=forged'),config);
  assert.equal(response.status,303);
  assert.match(response.headers.get('location'),/connection_error=/);
  assert.equal(await config.DB.prepare("SELECT value FROM settings WHERE id='google'").bind().first(),null);
});
