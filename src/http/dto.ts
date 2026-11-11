import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsObject, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { DELIVERY_MODES, DeliveryMode } from '../domain/webhook';

export class PayloadDto {
  @ApiProperty({ example: 'synthetic-order-001', maxLength: 64 })
  @IsString() @IsNotEmpty() @MaxLength(64)
  reference!: string;

  @ApiProperty({ example: 'Evento de prueba sin datos personales', maxLength: 500 })
  @IsString() @IsNotEmpty() @MaxLength(500)
  message!: string;
}

export class SubmitEventDto {
  @ApiProperty({ example: 'demo-001', maxLength: 80, pattern: '^[a-zA-Z0-9_-]+$' })
  @IsString() @MaxLength(80) @Matches(/^[a-zA-Z0-9_-]+$/)
  eventId!: string;

  @ApiProperty({ enum: ['demo.created', 'demo.updated'] })
  @IsIn(['demo.created', 'demo.updated'])
  type!: 'demo.created' | 'demo.updated';

  @ApiProperty({ type: PayloadDto })
  @IsObject() @ValidateNested() @Type(() => PayloadDto)
  payload!: PayloadDto;

  @ApiProperty({ enum: DELIVERY_MODES, description: 'Control sintético del consumidor; no envía a URLs.' })
  @IsIn(DELIVERY_MODES)
  deliveryMode!: DeliveryMode;
}
