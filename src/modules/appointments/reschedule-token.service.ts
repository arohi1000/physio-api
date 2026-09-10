import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RescheduleTokenInvalidException } from '../../common/exceptions/app.exception';
import type { EnvironmentVariables } from '../../config/environment';
import { RedisService } from '../redis/redis.service';

const RESCHEDULE_TOKEN_AUDIENCE = 'reschedule';
const CONSUMED_KEY_PREFIX = 'reschedule-token:consumed:';

interface RescheduleTokenClaims {
  readonly sub: string;
  readonly patientName: string;
  readonly patientPhone: string;
  readonly suggestedServiceId: string;
  readonly jti: string;
}

export interface RescheduleTokenPayload {
  readonly previousAppointmentId: string;
  readonly patientName: string;
  readonly patientPhone: string;
  readonly suggestedServiceId: string;
}

/**
 * Signs and resolves reschedule links (`GET /appointments/reschedule/:token`,
 * M2-CONTRACT.md §2). No creation endpoint exists in this milestone's
 * contract — `issue()` is here for Milestone 4 (the WhatsApp cancellation
 * message's `{{rebooking_link}}`) to call once messaging exists, and is
 * exercised directly by this service's own unit tests in the meantime.
 */
@Injectable()
export class RescheduleTokenService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ttlSeconds = configService.get('RESCHEDULE_TOKEN_TTL_SECONDS', {
      infer: true,
    });
  }

  async issue(payload: RescheduleTokenPayload): Promise<string> {
    return this.jwtService.signAsync(
      {
        patientName: payload.patientName,
        patientPhone: payload.patientPhone,
        suggestedServiceId: payload.suggestedServiceId,
        jti: randomUUID(),
      },
      {
        subject: payload.previousAppointmentId,
        audience: RESCHEDULE_TOKEN_AUDIENCE,
        expiresIn: this.ttlSeconds,
      },
    );
  }

  /**
   * Resolves a token to its prefill data and marks it consumed. A second
   * resolution of the same token — or a bad, tampered or expired one — is
   * `RESCHEDULE_TOKEN_INVALID`: the error table's "already-consumed" case is
   * exactly what this guards, since this is the only endpoint that ever
   * touches a reschedule token.
   */
  async resolveAndConsume(token: string): Promise<RescheduleTokenPayload> {
    let claims: RescheduleTokenClaims;
    try {
      claims = await this.jwtService.verifyAsync<RescheduleTokenClaims>(token, {
        audience: RESCHEDULE_TOKEN_AUDIENCE,
      });
    } catch {
      throw new RescheduleTokenInvalidException();
    }

    const consumedKey = `${CONSUMED_KEY_PREFIX}${claims.jti}`;
    const alreadyConsumed = await this.redis.readJson<boolean>(consumedKey);
    if (alreadyConsumed) {
      throw new RescheduleTokenInvalidException();
    }
    await this.redis.writeJson(consumedKey, true, this.ttlSeconds);

    return {
      previousAppointmentId: claims.sub,
      patientName: claims.patientName,
      patientPhone: claims.patientPhone,
      suggestedServiceId: claims.suggestedServiceId,
    };
  }
}
