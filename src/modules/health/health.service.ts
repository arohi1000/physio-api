import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  DependencyHealthDto,
  DependencyStatus,
  HealthCheckResponseDto,
  HealthStatus,
} from './dto/health-check-response.dto';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectPinoLogger(HealthService.name)
    private readonly logger: PinoLogger,
  ) {}

  async check(): Promise<HealthCheckResponseDto> {
    const [database, redis] = await Promise.all([
      this.probe('database', () => this.prisma.ping()),
      this.probe('redis', () => this.redis.ping()),
    ]);

    const isHealthy =
      database.status === DependencyStatus.Up &&
      redis.status === DependencyStatus.Up;

    return {
      status: isHealthy ? HealthStatus.Ok : HealthStatus.Error,
      dependencies: { database, redis },
    };
  }

  private async probe(
    name: string,
    ping: () => Promise<void>,
  ): Promise<DependencyHealthDto> {
    const startedAt = Date.now();

    try {
      await ping();
      return {
        status: DependencyStatus.Up,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      this.logger.error(
        { err: error, dependency: name },
        'Dependency probe failed',
      );
      return {
        status: DependencyStatus.Down,
        latencyMs: Date.now() - startedAt,
      };
    }
  }
}
