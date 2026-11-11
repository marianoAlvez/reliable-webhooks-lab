import { resolve } from 'node:path';
import { createApp } from './app';

async function main() {
  const port = Number(process.env.PORT ?? '4311');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT inválido.');
  const { app } = await createApp({ databasePath: resolve('data', 'demo.sqlite'), secret: process.env.DEMO_SECRET });
  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
  console.log(`Laboratorio sintético en http://127.0.0.1:${port}/docs`);
}

void main().catch(() => { console.error('No se pudo iniciar el laboratorio. Verificá Node 24, puerto y carpeta data.'); process.exitCode = 1; });
