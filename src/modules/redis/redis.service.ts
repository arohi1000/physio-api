import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { EnvironmentVariables } from '../../config/environment';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(
    configService: ConfigService<EnvironmentVariables, true>,
    @InjectPinoLogger(RedisService.name)
    private readonly logger: PinoLogger,
  ) {
    this.client = new Redis(configService.get('REDIS_URL', { infer: true }), {
      // Fail commands immediately while disconnected so /health reports the
      // outage instead of queueing the ping until Redis returns.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });

    this.client.on('error', (error: Error) => {
      this.logger.warn({ err: error }, 'Redis connection error');
    });
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }
}
