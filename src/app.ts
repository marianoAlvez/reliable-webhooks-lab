import 'reflect-metadata';
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Clock, DeliveryConsumer } from './application/ports';
import { WebhookService } from './application/webhook-service';
import { SqliteEventStore } from './adapters/sqlite-event-store';
import { SimulatedConsumer, SystemClock } from './adapters/simulated-consumer';
import { WebhookController, SERVICE } from './http/controller';
import { DEMO_SECRET, LOCAL_DEMO_SECRET, SignatureGuard } from './http/signature-guard';
import { SubmitEventDto } from './http/dto';

@Module({})
class AppModule {}

export async function createApp(options: {
  databasePath: string; clock?: Clock; consumer?: DeliveryConsumer; secret?: string;
}) {
  const store = new SqliteEventStore(options.databasePath);
  const service = new WebhookService(store, options.clock ?? new SystemClock(),
    options.consumer ?? new SimulatedConsumer());
  const app = await NestFactory.create<NestExpressApplication>({
    module: AppModule, controllers: [WebhookController], providers: [
      { provide: SERVICE, useValue: service },
      { provide: DEMO_SECRET, useValue: options.secret ?? LOCAL_DEMO_SECRET }, SignatureGuard,
      { provide: 'STORE_LIFECYCLE', useValue: { onModuleDestroy: () => store.close() } },
    ],
  }, { rawBody: true, logger: false });
  app.useBodyParser('json', { limit: '16kb' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
    forbidNonWhitelisted: true, forbidUnknownValues: true }));
  const config = new DocumentBuilder().setTitle('Reliable Webhooks Lab')
    .setDescription('API local sintética. No es una integración con proveedores reales ni una plantilla de producción.')
    .setVersion('1.0.0').build();
  const document = SwaggerModule.createDocument(app, config, { extraModels: [SubmitEventDto] });
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'openapi.json' });
  await app.init();
  return { app, service, store };
}
