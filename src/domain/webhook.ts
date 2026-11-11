export const DELIVERY_MODES = ['success', 'fail-once', 'always-fail'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];
export type DeliveryStatus = 'pending' | 'processing' | 'delivered' | 'dead';

export interface WebhookEvent {
  eventId: string;
  type: 'demo.created' | 'demo.updated';
  payload: { reference: string; message: string };
  deliveryMode: DeliveryMode;
}

export interface DeliveryAttempt {
  attempt: number;
  startedAt: number;
  outcome: 'started' | 'succeeded' | 'failed' | 'lease-expired';
  error: string | null;
}

export interface EventSnapshot {
  event: WebhookEvent;
  receivedAt: number;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt: number | null;
  deliveredAt: number | null;
  lastError: string | null;
  history: DeliveryAttempt[];
}

export interface DeliveryJob {
  event: WebhookEvent;
  attempt: number;
  leaseToken: string;
}

export class IdempotencyConflict extends Error {
  constructor() { super('El eventId ya existe con contenido diferente.'); }
}

export const MAX_ATTEMPTS = 3;
export const LEASE_MS = 30_000;
export const retryDelay = (attempt: number): number => 1_000 * 2 ** (attempt - 1);
