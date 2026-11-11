import { Clock, DeliveryConsumer } from '../application/ports';
import { DeliveryJob } from '../domain/webhook';

export class SystemClock implements Clock { now() { return Date.now(); } }

/** This adapter performs no HTTP calls and no real-world side effects. */
export class SimulatedConsumer implements DeliveryConsumer {
  async deliver(job: DeliveryJob): Promise<void> {
    if (job.event.deliveryMode === 'always-fail' ||
      (job.event.deliveryMode === 'fail-once' && job.attempt === 1)) {
      throw new Error('synthetic failure');
    }
  }
}
