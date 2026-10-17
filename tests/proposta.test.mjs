import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../api/proposta.ts';

// Testes isolados: nenhuma chamada de rede ou notificação real é permitida.
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
const valid = { name: 'Teste local', company: 'Auditoria local', phone: '(62) 98125-2338', project: 'Filmagem com drone e produção audiovisual', page: '/filmagem-com-drone', utm_source: 'teste-local' };
const request = (body, origin = 'https://ar1films.com') => new Request('http://localhost/api/proposta', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });

test('invalid bodies and contact fields are rejected before any integration', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network access'); });
  assert.equal((await POST(request(null))).status, 400);
  assert.equal((await POST(request([]))).status, 400);
  assert.equal((await POST(request({}))).status, 422);
  for (const phone of ['12345678', 'abcdefghij', '1234567890123456']) assert.equal((await POST(request({ ...valid, phone }))).status, 422);
  assert.equal((await POST(request({ ...valid, email: 'invalido' }))).status, 422);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('honeypot and foreign origin do not reach integrations', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network access'); });
  assert.equal((await POST(request({ website: 'bot' }))).status, 200);
  assert.equal((await POST(request(valid, 'https://example.invalid'))).status, 403);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('successful lead preserves service, page and attribution in the existing funnel', async (t) => {
  process.env.SUPABASE_URL = 'https://mock.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-only';
  let saved;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options?.method === 'POST') { saved = JSON.parse(options.body); return new Response(null, { status: 201 }); }
    return Response.json([]);
  });
  const response = await POST(request(valid));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(saved.project_type, valid.project);
  assert.equal(saved.source_path, valid.page);
  assert.equal(saved.source, 'site');
  assert.match(saved.message, /UTM source: teste-local/);
});

test('integration failure and rate limit never report success', async (t) => {
  process.env.SUPABASE_URL = 'https://mock.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-only';
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async (_url, options) => options?.method === 'POST' ? new Response('simulated failure', { status: 500 }) : Response.json([]));
  assert.equal((await POST(request(valid))).status, 502);
  globalThis.fetch.mock.mockImplementation(async () => Response.json(Array.from({ length: 5 }, (_, id) => ({ id }))));
  assert.equal((await POST(request(valid))).status, 429);
});

test('missing configuration returns an explicit unavailable response', async (t) => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network access'); });
  assert.equal((await POST(request(valid))).status, 503);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});
