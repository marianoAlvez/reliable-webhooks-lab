import { CanActivate, ExecutionContext, Inject, Injectable, RawBodyRequest, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

export const DEMO_SECRET = Symbol('DEMO_SECRET');
export const LOCAL_DEMO_SECRET = 'local-demo-secret-not-for-production';

@Injectable()
export class SignatureGuard implements CanActivate {
  constructor(@Inject(DEMO_SECRET) private readonly secret: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const header = request.headers['x-demo-signature'];
    if (typeof header !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(header) || !request.rawBody) {
      throw new UnauthorizedException('Firma HMAC requerida: x-demo-signature.');
    }
    const expected = createHmac('sha256', this.secret).update(request.rawBody).digest();
    const received = Buffer.from(header.slice(7), 'hex');
    if (!timingSafeEqual(expected, received)) throw new UnauthorizedException('Firma HMAC inválida.');
    return true;
  }
}
