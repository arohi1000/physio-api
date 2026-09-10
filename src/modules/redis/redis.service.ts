import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { EnvironmentVariables } from '../../config/environment';

/**
 * Owns the Redis connection and exposes the narrow set of operations the
 * application needs. The client itself stays private so no consumer can reach
 * past this surface (ISP — EXECUTION-PLAN §4.3).
 */
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

  async readJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async writeJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async delete(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  /**
   * Deletes every key matching `prefix*`, via `SCAN` rather than `KEYS` so a
   * large keyspace never blocks the Redis event loop. Used to flush the whole
   * availability-cache namespace on an availability-block write, which can
   * affect any service on any date the block (or its recurrence) touches.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  async addToSet(
    key: string,
    member: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.multi().sadd(key, member).expire(key, ttlSeconds).exec();
  }

  async readSetMembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async readCounter(key: string): Promise<number> {
    const raw = await this.client.get(key);
    return raw === null ? 0 : Number.parseInt(raw, 10);
  }

  /**
   * Increments a counter, setting its expiry on first write. Returns the value
   * after the increment so callers can compare it against a limit.
   */
  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    const results = await this.client
      .multi()
      .incr(key)
      .expire(key, ttlSeconds, 'NX')
      .exec();
    const incremented = results?.[0]?.[1];
    return typeof incremented === 'number' ? incremented : 0;
  }
}
