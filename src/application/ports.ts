import { DeliveryJob, EventSnapshot, WebhookEvent } from '../domain/webhook';

export interface Clock { now(): number }

export interface EventStore {
  accept(event: WebhookEvent, contentHash: string, now: number): boolean;
  get(eventId: string): EventSnapshot | undefined;
  list(limit: number): EventSnapshot[];
  claim(now: number): DeliveryJob | undefined;
  finish(job: DeliveryJob, now: number, failure?: string): boolean;
  isHealthy(): boolean;
  close(): void;
}

export interface DeliveryConsumer {
  deliver(job: DeliveryJob): Promise<void>;
}
