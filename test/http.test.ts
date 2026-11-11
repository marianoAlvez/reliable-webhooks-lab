import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApp } from '../src/app';
import { LOCAL_DEMO_SECRET } from '../src/http/signature-guard';

test('contrato HTTP: concurrencia, validación, HMAC, límites y documentación', async t => {
  const { app, store } = await createApp({ databasePath: ':memory:' });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const input = { eventId: 'concurrent-001', type: 'demo.created',
    payload: { reference: 'synthetic-001', message: 'Sólo demostración' }, deliveryMode: 'success' };
  const signed = (value: unknown, signature?: string) => {
    const body = JSON.stringify(value);
    return fetch(base + '/events', { method: 'POST', body, headers: { 'content-type': 'application/json',
      'x-demo-signature': signature ?? ('sha256=' + createHmac('sha256', LOCAL_DEMO_SECRET).update(body).digest('hex')) } });
  };
  try {
    await t.test('16 solicitudes simultáneas producen un solo evento/outbox', async () => {
      const responses = await Promise.all(Array.from({ length: 16 }, () => signed(input)));
      assert.ok(responses.every(response => response.status === 200));
      const data = await Promise.all(responses.map(response => response.json()));
      assert.equal(data.filter(item => !item.duplicate).length, 1);
      assert.equal(store.list(100).length, 1);
      const dispatches = await Promise.all(Array.from({ length: 8 }, () => fetch(base + '/demo/dispatch', { method: 'POST' })));
      assert.ok(dispatches.every(response => response.ok));
      assert.equal(store.get(input.eventId)?.attempts, 1);
      assert.equal(store.get(input.eventId)?.status, 'delivered');
    });

    await t.test('mismo ID y contenido distinto devuelve 409', async () => {
      assert.equal((await signed({ ...input, deliveryMode: 'always-fail' })).status, 409);
    });

    await t.test('rechaza campos desconocidos, payload incompleto y tamaño de campos', async () => {
      for (const invalid of [
        { ...input, eventId: 'invalid-1', admin: true },
        { ...input, eventId: 'invalid-2', payload: { reference: 'missing-message' } },
        { ...input, eventId: 'invalid-3', payload: null },
        { ...input, eventId: 'invalid-4', payload: { ...input.payload, message: 'x'.repeat(501) } },
        { ...input, eventId: 'invalid-5', deliveryMode: 'remote-http' },
        { ...input, eventId: '../invalid' },
      ]) assert.equal((await signed(invalid)).status, 400);
      assert.equal(store.list(100).length, 1);
    });

    await t.test('rechaza firma ausente, alterada y cuerpo mayor a 16 KiB', async () => {
      assert.equal((await signed(input, 'sha256=' + '0'.repeat(64))).status, 401);
      assert.equal((await fetch(base + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })).status, 401);
      assert.equal((await signed({ ...input, payload: { reference: 'x', message: 'x'.repeat(17_000) } })).status, 413);
    });

    await t.test('consulta acotada, 404, health y OpenAPI utilizable', async () => {
      assert.equal((await fetch(base + '/events?limit=101')).status, 400);
      assert.equal((await fetch(base + '/events/missing')).status, 404);
      assert.equal((await (await fetch(base + '/health')).json()).status, 'ok');
      const spec = await (await fetch(base + '/openapi.json')).json();
      assert.ok(spec.paths['/events'].post);
      assert.ok(spec.components.schemas.SubmitEventDto);
      assert.ok(spec.components.schemas.PayloadDto);
      assert.equal((await fetch(base + '/docs')).status, 200);
    });
  } finally { await app.close(); }
});
