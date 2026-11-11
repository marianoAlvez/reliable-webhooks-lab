import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Inject,
  NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiHeader, ApiOkResponse,
  ApiOperation, ApiParam, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { WebhookService } from '../application/webhook-service';
import { IdempotencyConflict } from '../domain/webhook';
import { SubmitEventDto } from './dto';
import { SignatureGuard } from './signature-guard';

export const SERVICE = Symbol('WEBHOOK_SERVICE');
const snapshotSchema = {
  type: 'object' as const,
  properties: {
    event: { $ref: '#/components/schemas/SubmitEventDto' },
    receivedAt: { type: 'integer', description: 'Unix milliseconds' },
    status: { type: 'string', enum: ['pending', 'processing', 'delivered', 'dead'] },
    attempts: { type: 'integer', minimum: 0, maximum: 3 },
    nextAttemptAt: { type: 'integer', nullable: true },
    deliveredAt: { type: 'integer', nullable: true },
    lastError: { type: 'string', nullable: true },
    history: { type: 'array', items: { type: 'object', properties: {
      attempt: { type: 'integer' }, startedAt: { type: 'integer' },
      outcome: { type: 'string', enum: ['started', 'succeeded', 'failed', 'lease-expired'] },
      error: { type: 'string', nullable: true },
    } } },
  },
};

@ApiTags('Laboratorio de webhooks')
@Controller()
export class WebhookController {
  constructor(@Inject(SERVICE) private readonly service: WebhookService) {}

  @Get('health')
  @ApiOperation({ summary: 'Verifica acceso a SQLite; sin servicio externo.' })
  health() { return { status: this.service.store.isHealthy() ? 'ok' : 'error', mode: 'synthetic-local-demo' }; }

  @Post('events') @HttpCode(200) @UseGuards(SignatureGuard)
  @ApiOperation({ summary: 'Acepta un evento y su outbox en una sola transacción.' })
  @ApiHeader({ name: 'x-demo-signature', required: true, description: 'sha256= + HMAC-SHA256 hexadecimal del JSON exacto.' })
  @ApiOkResponse({ description: 'Evento nuevo o duplicado idéntico.', schema: {
    ...snapshotSchema, properties: { duplicate: { type: 'boolean' }, ...snapshotSchema.properties },
  } })
  @ApiUnauthorizedResponse({ description: 'Firma ausente o inválida.' })
  @ApiBadRequestResponse({ description: 'DTO inválido o campos desconocidos.' })
  @ApiConflictResponse({ description: 'eventId reutilizado con contenido diferente.' })
  submit(@Body() dto: SubmitEventDto) {
    try { return this.service.submit(dto); }
    catch (error) {
      if (error instanceof IdempotencyConflict) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Get('events')
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Entero entre 1 y 100.' })
  @ApiOkResponse({ schema: { type: 'array', items: snapshotSchema } })
  list(@Query('limit') rawLimit?: string) {
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('limit debe ser un entero entre 1 y 100.');
    return this.service.store.list(limit);
  }

  @Get('events/:eventId')
  @ApiParam({ name: 'eventId', example: 'demo-001' })
  @ApiOkResponse({ schema: snapshotSchema })
  status(@Param('eventId') id: string) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new BadRequestException('eventId inválido.');
    const event = this.service.store.get(id);
    if (!event) throw new NotFoundException('Evento no encontrado.');
    return event;
  }

  @Post('demo/dispatch') @HttpCode(200)
  @ApiOperation({ summary: 'Control local del laboratorio: procesa hasta 20 entregas vencidas.',
    description: 'No hay scheduler en background. Llamar nuevamente al vencer nextAttemptAt. Sólo consumidor simulado.' })
  dispatch() { return this.service.dispatch(); }
}
