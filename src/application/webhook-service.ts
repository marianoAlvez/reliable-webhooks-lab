import { createHash } from 'node:crypto';
import { WebhookEvent } from '../domain/webhook';
import { Clock, DeliveryConsumer, EventStore } from './ports';

export class WebhookService {
  constructor(readonly store: EventStore, private readonly clock: Clock,
    private readonly consumer: DeliveryConsumer) {}

  submit(input: WebhookEvent) {
    // Explicit canonical order: different JSON key order represents the same event.
    const event: WebhookEvent = {
      eventId: input.eventId, type: input.type,
      payload: { reference: input.payload.reference, message: input.payload.message },
      deliveryMode: input.deliveryMode,
    };
    const hash = createHash('sha256').update(JSON.stringify(event)).digest('hex');
    const created = this.store.accept(event, hash, this.clock.now());
    return { duplicate: !created, ...this.store.get(event.eventId)! };
  }

  async dispatch() {
    const results: { eventId: string; attempt: number; stateCommitted: boolean }[] = [];
    // Fixed upper bound prevents a single request from draining an unbounded queue.
    for (let i = 0; i < 20; i++) {
      const job = this.store.claim(this.clock.now());
      if (!job) break;
      let failure: string | undefined;
      try { await this.consumer.deliver(job); }
      catch { failure = 'simulated-consumer-failure'; }
      results.push({ eventId: job.event.eventId, attempt: job.attempt,
        stateCommitted: this.store.finish(job, this.clock.now(), failure) });
    }
    return { processed: results.length, results, now: this.clock.now() };
  }
}
