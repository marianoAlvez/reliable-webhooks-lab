import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { EventStore } from '../application/ports';
import { DeliveryJob, EventSnapshot, IdempotencyConflict, LEASE_MS,
  MAX_ATTEMPTS, retryDelay, WebhookEvent } from '../domain/webhook';

type Row = Record<string, string | number | null>;

export class SqliteEventStore implements EventStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        received_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outbox (
        event_id TEXT PRIMARY KEY REFERENCES events(event_id),
        status TEXT NOT NULL CHECK(status IN ('pending','processing','delivered','dead')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
        due_at INTEGER NOT NULL,
        lease_until INTEGER,
        lease_token TEXT,
        last_error TEXT,
        delivered_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS outbox_due ON outbox(status, due_at);
      CREATE TABLE IF NOT EXISTS delivery_attempts (
        event_id TEXT NOT NULL REFERENCES events(event_id),
        attempt INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('started','succeeded','failed','lease-expired')),
        error TEXT,
        PRIMARY KEY (event_id, attempt)
      );
    `);
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  accept(event: WebhookEvent, contentHash: string, now: number): boolean {
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT content_hash FROM events WHERE event_id = ?')
        .get(event.eventId);
      if (existing) {
        if (existing.content_hash !== contentHash) throw new IdempotencyConflict();
        return false;
      }
      this.db.prepare('INSERT INTO events VALUES (?, ?, ?, ?)')
        .run(event.eventId, contentHash, JSON.stringify(event), now);
      this.db.prepare("INSERT INTO outbox(event_id,status,due_at) VALUES (?, 'pending', ?)")
        .run(event.eventId, now);
      return true;
    });
  }

  get(eventId: string): EventSnapshot | undefined {
    const row = this.db.prepare(`SELECT e.payload_json, e.received_at, o.*
      FROM events e JOIN outbox o USING(event_id) WHERE e.event_id = ?`).get(eventId) as Row | undefined;
    if (!row) return;
    const history = this.db.prepare(`SELECT attempt, started_at AS startedAt, outcome, error
      FROM delivery_attempts WHERE event_id = ? ORDER BY attempt`).all(eventId);
    return {
      event: JSON.parse(String(row.payload_json)) as WebhookEvent,
      receivedAt: Number(row.received_at), status: row.status as EventSnapshot['status'],
      attempts: Number(row.attempts),
      nextAttemptAt: row.status === 'pending' ? Number(row.due_at) : null,
      deliveredAt: row.delivered_at === null ? null : Number(row.delivered_at),
      lastError: row.last_error as string | null,
      history: history as unknown as EventSnapshot['history'],
    };
  }

  list(limit: number): EventSnapshot[] {
    return this.db.prepare('SELECT event_id FROM events ORDER BY received_at DESC, event_id LIMIT ?')
      .all(limit).map(row => this.get(String(row.event_id))!);
  }

  claim(now: number): DeliveryJob | undefined {
    return this.transaction(() => {
      // A crashed worker leaves a lease. Expiration counts as an attempted delivery,
      // because a real receiver might already have processed it before the crash.
      this.db.prepare(`UPDATE delivery_attempts SET outcome='lease-expired', error='lease-expired'
        WHERE outcome='started' AND EXISTS (SELECT 1 FROM outbox o
        WHERE o.event_id=delivery_attempts.event_id AND o.attempts=delivery_attempts.attempt
        AND o.status='processing' AND o.lease_until <= ?)`).run(now);
      this.db.prepare(`UPDATE outbox SET status='dead', last_error='lease-expired',
        lease_until=NULL, lease_token=NULL
        WHERE status='processing' AND lease_until <= ? AND attempts >= ?`).run(now, MAX_ATTEMPTS);
      const row = this.db.prepare(`SELECT o.*, e.payload_json FROM outbox o JOIN events e USING(event_id)
        WHERE (o.status='pending' AND o.due_at <= ?) OR (o.status='processing' AND o.lease_until <= ?)
        ORDER BY o.due_at, o.event_id LIMIT 1`).get(now, now) as Row | undefined;
      if (!row) return;
      const token = randomUUID();
      const attempt = Number(row.attempts) + 1;
      this.db.prepare(`UPDATE outbox SET status='processing', attempts=?, lease_until=?, lease_token=?
        WHERE event_id=?`).run(attempt, now + LEASE_MS, token, String(row.event_id));
      this.db.prepare(`INSERT INTO delivery_attempts VALUES (?, ?, ?, 'started', NULL)`)
        .run(String(row.event_id), attempt, now);
      return { event: JSON.parse(String(row.payload_json)) as WebhookEvent, attempt, leaseToken: token };
    });
  }

  finish(job: DeliveryJob, now: number, failure?: string): boolean {
    return this.transaction(() => {
      const current = this.db.prepare(`SELECT 1 FROM outbox WHERE event_id=?
        AND status='processing' AND lease_token=?`).get(job.event.eventId, job.leaseToken);
      if (!current) return false; // A reclaimed lease rejects late completion.
      const state = failure ? (job.attempt >= MAX_ATTEMPTS ? 'dead' : 'pending') : 'delivered';
      this.db.prepare(`UPDATE outbox SET status=?, due_at=?, lease_until=NULL, lease_token=NULL,
        last_error=?, delivered_at=? WHERE event_id=?`).run(state,
        failure ? now + retryDelay(job.attempt) : now, failure ?? null,
        failure ? null : now, job.event.eventId);
      this.db.prepare(`UPDATE delivery_attempts SET outcome=?, error=? WHERE event_id=? AND attempt=?`)
        .run(failure ? 'failed' : 'succeeded', failure ?? null, job.event.eventId, job.attempt);
      return true;
    });
  }

  isHealthy() { return this.db.prepare('SELECT 1 AS ok').get()?.ok === 1; }
  close() { this.db.close(); }
}
