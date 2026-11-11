import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { Clock } from '../src/application/ports';
import { WebhookService } from '../src/application/webhook-service';
import { SqliteEventStore } from '../src/adapters/sqlite-event-store';
import { SimulatedConsumer } from '../src/adapters/simulated-consumer';
import { IdempotencyConflict, LEASE_MS, WebhookEvent } from '../src/domain/webhook';

class FakeClock implements Clock {
  time = 1_000;
  now() { return this.time; }
}
const fixture = (id: string, deliveryMode: WebhookEvent['deliveryMode'] = 'success'): WebhookEvent => ({
  eventId: id, type: 'demo.created', payload: { reference: 'synthetic-001', message: 'Sin datos reales' }, deliveryMode,
});

test('idempotencia canónica conserva un evento y rechaza cambios de contenido', () => {
  const store = new SqliteEventStore(':memory:');
  try {
    const service = new WebhookService(store, new FakeClock(), new SimulatedConsumer());
    const input = fixture('same-event');
    assert.equal(service.submit(input).duplicate, false);
    assert.equal(service.submit({ ...input, payload: { message: input.payload.message, reference: input.payload.reference } }).duplicate, true);
    assert.throws(() => service.submit({ ...input, deliveryMode: 'always-fail' }), IdempotencyConflict);
    assert.equal(store.list(100).length, 1);
  } finally { store.close(); }
});

test('fallo transitorio respeta backoff y después se entrega sin esperar tiempo real', async () => {
  const store = new SqliteEventStore(':memory:');
  try {
    const clock = new FakeClock();
    const service = new WebhookService(store, clock, new SimulatedConsumer());
    service.submit(fixture('retry-event', 'fail-once'));
    assert.equal((await service.dispatch()).processed, 1);
    assert.equal(store.get('retry-event')?.nextAttemptAt, 2_000);
    clock.time = 1_999;
    assert.equal((await service.dispatch()).processed, 0);
    clock.time = 2_000;
    await service.dispatch();
    const result = store.get('retry-event')!;
    assert.equal(result.status, 'delivered');
    assert.equal(result.attempts, 2);
    assert.deepEqual(result.history.map(item => item.outcome), ['failed', 'succeeded']);
    assert.equal((await service.dispatch()).processed, 0);
  } finally { store.close(); }
});

test('fallo permanente termina en dead tras tres intentos; no se reintenta sin límite', async () => {
  const store = new SqliteEventStore(':memory:');
  try {
    const clock = new FakeClock();
    const service = new WebhookService(store, clock, new SimulatedConsumer());
    service.submit(fixture('dead-event', 'always-fail'));
    await service.dispatch();
    clock.time = 2_000; await service.dispatch();
    assert.equal(store.get('dead-event')?.nextAttemptAt, 4_000);
    clock.time = 4_000; await service.dispatch();
    assert.equal(store.get('dead-event')?.status, 'dead');
    assert.equal(store.get('dead-event')?.attempts, 3);
    clock.time = 999_999;
    assert.equal((await service.dispatch()).processed, 0);
  } finally { store.close(); }
});

test('SQLite conserva evento/outbox tras cerrar y reabrir; duplicado sigue reconocido', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'reliable-webhooks-test-'));
  const path = join(directory, 'test.sqlite');
  let store = new SqliteEventStore(path);
  try {
    let service = new WebhookService(store, new FakeClock(), new SimulatedConsumer());
    service.submit(fixture('durable-event'));
    store.close();
    store = new SqliteEventStore(path);
    service = new WebhookService(store, new FakeClock(), new SimulatedConsumer());
    assert.equal(service.submit(fixture('durable-event')).duplicate, true);
    await service.dispatch();
    assert.equal(store.get('durable-event')?.status, 'delivered');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('si falla insertar outbox, la transacción también revierte el evento', () => {
  const directory = mkdtempSync(join(tmpdir(), 'reliable-webhooks-test-'));
  const path = join(directory, 'test.sqlite');
  const store = new SqliteEventStore(path);
  const inspection = new DatabaseSync(path);
  try {
    inspection.exec("CREATE TRIGGER force_outbox_failure BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
    const service = new WebhookService(store, new FakeClock(), new SimulatedConsumer());
    assert.throws(() => service.submit(fixture('atomic-event')), /synthetic failure/);
    assert.equal(inspection.prepare('SELECT COUNT(*) AS total FROM events').get()?.total, 0);
    assert.equal(inspection.prepare('SELECT COUNT(*) AS total FROM outbox').get()?.total, 0);
  } finally { inspection.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('lease expirada se recupera tras reinicio y rechaza finalización del worker anterior', () => {
  const directory = mkdtempSync(join(tmpdir(), 'reliable-webhooks-test-'));
  const path = join(directory, 'test.sqlite');
  let store = new SqliteEventStore(path);
  try {
    new WebhookService(store, new FakeClock(), new SimulatedConsumer()).submit(fixture('lease-event'));
    const oldJob = store.claim(1_000)!;
    store.close(); store = new SqliteEventStore(path);
    assert.equal(store.claim(1_000 + LEASE_MS - 1), undefined);
    const recovered = store.claim(1_000 + LEASE_MS)!;
    assert.equal(recovered.attempt, 2);
    assert.equal(store.finish(oldJob, 1_000 + LEASE_MS), false);
    assert.equal(store.finish(recovered, 1_000 + LEASE_MS), true);
    assert.deepEqual(store.get('lease-event')?.history.map(a => a.outcome), ['lease-expired', 'succeeded']);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('tres leases abandonadas terminan en dead sin crear un cuarto intento', () => {
  const store = new SqliteEventStore(':memory:');
  try {
    new WebhookService(store, new FakeClock(), new SimulatedConsumer()).submit(fixture('crash-event'));
    for (let i = 0; i < 3; i++) assert.equal(store.claim(1_000 + LEASE_MS * i)?.attempt, i + 1);
    assert.equal(store.claim(1_000 + LEASE_MS * 3), undefined);
    assert.equal(store.get('crash-event')?.status, 'dead');
    assert.equal(store.get('crash-event')?.attempts, 3);
  } finally { store.close(); }
});
