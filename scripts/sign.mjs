import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Uso: node scripts/sign.mjs examples/event.json'); process.exit(1); }
const signature = createHmac('sha256', process.env.DEMO_SECRET ?? 'local-demo-secret-not-for-production')
  .update(readFileSync(file)).digest('hex');
console.log(`sha256=${signature}`);
