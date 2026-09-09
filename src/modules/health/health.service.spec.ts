import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  DependencyStatus,
  HealthStatus,
} from './dto/health-check-response.dto';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let healthService: HealthService;
  let prismaPing: jest.Mock;
  let redisPing: jest.Mock;

  beforeEach(async () => {
    prismaPing = jest.fn().mockResolvedValue(undefined);
    redisPing = jest.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { ping: prismaPing } },
        { provide: RedisService, useValue: { ping: redisPing } },
        {
          provide: getLoggerToken(HealthService.name),
          useValue: { error: jest.fn() },
        },
      ],
    }).compile();

    healthService = moduleRef.get(HealthService);
  });

  it('reports ok when both dependencies respond', async () => {
    const result = await healthService.check();

    expect(result.status).toBe(HealthStatus.Ok);
    expect(result.dependencies.database.status).toBe(DependencyStatus.Up);
    expect(result.dependencies.redis.status).toBe(DependencyStatus.Up);
  });

  it('reports the database as down without failing the whole probe', async () => {
    prismaPing.mockRejectedValue(new Error('connection refused'));

    const result = await healthService.check();

    expect(result.status).toBe(HealthStatus.Error);
    expect(result.dependencies.database.status).toBe(DependencyStatus.Down);
    expect(result.dependencies.redis.status).toBe(DependencyStatus.Up);
  });

  it('reports redis as down when its ping rejects', async () => {
    redisPing.mockRejectedValue(new Error('connection refused'));

    const result = await healthService.check();

    expect(result.status).toBe(HealthStatus.Error);
    expect(result.dependencies.redis.status).toBe(DependencyStatus.Down);
  });

  it('never surfaces the underlying driver error to the caller', async () => {
    redisPing.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6380'));

    const result = await healthService.check();

    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED');
  });
});
