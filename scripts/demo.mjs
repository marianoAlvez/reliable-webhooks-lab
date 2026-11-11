import { createHmac, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const base = `http://127.0.0.1:${process.env.PORT ?? '4311'}`;
const event = { eventId: `demo-${randomUUID()}`, type: 'demo.created',
  payload: { reference: 'synthetic-order-001', message: 'Ejemplo público sin datos personales' }, deliveryMode: 'fail-once' };
const body = JSON.stringify(event);
const signature = 'sha256=' + createHmac('sha256', process.env.DEMO_SECRET ?? 'local-demo-secret-not-for-production').update(body).digest('hex');
async function request(path, options) {
  const response = await fetch(base + path, options);
  const data = await response.json();
  assert.equal(response.ok, true, JSON.stringify(data));
  return data;
}
const submit = () => request('/events', { method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-signature': signature }, body });
const first = await submit();
const duplicate = await submit();
assert.equal(first.duplicate, false);
assert.equal(duplicate.duplicate, true);
await request('/demo/dispatch', { method: 'POST' });
const failed = await request(`/events/${event.eventId}`);
assert.equal(failed.status, 'pending'); assert.equal(failed.attempts, 1);
await new Promise(resolve => setTimeout(resolve, Math.max(0, failed.nextAttemptAt - Date.now()) + 30));
await request('/demo/dispatch', { method: 'POST' });
const delivered = await request(`/events/${event.eventId}`);
assert.equal(delivered.status, 'delivered'); assert.equal(delivered.attempts, 2);
console.log(JSON.stringify({ created: first.event.eventId, duplicate: duplicate.duplicate,
  afterFailure: { status: failed.status, attempts: failed.attempts },
  afterRetry: { status: delivered.status, attempts: delivered.attempts }, history: delivered.history }, null, 2));
