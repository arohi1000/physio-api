import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import { RescheduleTokenInvalidException } from '../../common/exceptions/app.exception';
import type { RedisService } from '../redis/redis.service';
import { RescheduleTokenService } from './reschedule-token.service';

const SECRET = 'a-test-secret-at-least-32-characters-long';

function buildFakeRedis(): jest.Mocked<RedisService> {
  const store = new Map<string, unknown>();
  return {
    readJson: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    writeJson: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  } as unknown as jest.Mocked<RedisService>;
}

function buildService(ttlSeconds = 3600): {
  service: RescheduleTokenService;
  redis: jest.Mocked<RedisService>;
} {
  const redis = buildFakeRedis();
  const configService = {
    get: jest.fn().mockReturnValue(ttlSeconds),
  } as unknown as ConfigService;
  const jwtService = new JwtService({ secret: SECRET });

  return {
    service: new RescheduleTokenService(
      jwtService,
      redis,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for a generic ConfigService<T, true>
      configService as any,
    ),
    redis,
  };
}

describe('RescheduleTokenService', () => {
  it('resolves a token it issued to the original payload', async () => {
    const { service } = buildService();
    const token = await service.issue({
      previousAppointmentId: 'appt-1',
      patientName: 'Asha Kumar',
      patientPhone: '+919876543210',
      suggestedServiceId: 'service-1',
    });

    const resolved = await service.resolveAndConsume(token);

    expect(resolved).toEqual({
      previousAppointmentId: 'appt-1',
      patientName: 'Asha Kumar',
      patientPhone: '+919876543210',
      suggestedServiceId: 'service-1',
    });
  });

  it('rejects a second resolution of the same token as already-consumed', async () => {
    const { service } = buildService();
    const token = await service.issue({
      previousAppointmentId: 'appt-1',
      patientName: 'Asha Kumar',
      patientPhone: '+919876543210',
      suggestedServiceId: 'service-1',
    });

    await service.resolveAndConsume(token);

    await expect(service.resolveAndConsume(token)).rejects.toBeInstanceOf(
      RescheduleTokenInvalidException,
    );
  });

  it('rejects an expired token', async () => {
    const { service } = buildService(-1);
    const token = await service.issue({
      previousAppointmentId: 'appt-1',
      patientName: 'Asha Kumar',
      patientPhone: '+919876543210',
      suggestedServiceId: 'service-1',
    });

    await expect(service.resolveAndConsume(token)).rejects.toBeInstanceOf(
      RescheduleTokenInvalidException,
    );
  });

  it('rejects a tampered token', async () => {
    const { service } = buildService();
    const token = await service.issue({
      previousAppointmentId: 'appt-1',
      patientName: 'Asha Kumar',
      patientPhone: '+919876543210',
      suggestedServiceId: 'service-1',
    });

    const tampered = `${token.slice(0, -1)}${token.at(-1) === 'a' ? 'b' : 'a'}`;

    await expect(service.resolveAndConsume(tampered)).rejects.toBeInstanceOf(
      RescheduleTokenInvalidException,
    );
  });

  it('rejects a garbage token', async () => {
    const { service } = buildService();
    await expect(
      service.resolveAndConsume('not-a-real-token'),
    ).rejects.toBeInstanceOf(RescheduleTokenInvalidException);
  });
});
