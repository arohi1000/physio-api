import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const TTL_SECONDS = 60;
const KEY_PREFIX = 'site-content:';

/**
 * Public-read cache for `site_content`, mirroring `AvailabilityCacheService`:
 * short TTL as a safety net, with a write invalidating its key immediately
 * so the doctor's edit reaches the public site without waiting out the TTL
 * (M5-CONTRACT.md §6.3).
 */
@Injectable()
export class SiteContentCacheService {
  constructor(private readonly redis: RedisService) {}

  async read<T>(key: string): Promise<T | null> {
    return this.redis.readJson<T>(cacheKey(key));
  }

  async write<T>(key: string, value: T): Promise<void> {
    await this.redis.writeJson(cacheKey(key), value, TTL_SECONDS);
  }

  async invalidate(key: string): Promise<void> {
    await this.redis.delete(cacheKey(key));
  }
}

function cacheKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}
