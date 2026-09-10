import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import type { Slot } from './slot-engine.types';

const TTL_SECONDS = 60;
const KEY_PREFIX = 'availability:';

interface CachedSlot {
  readonly startsAt: string;
  readonly endsAt: string;
}

/**
 * The ~60s availability cache (M2-CONTRACT.md §2), keyed on service + local
 * date. Isolated behind this service so `AvailabilityService` (reads),
 * `AppointmentsService` (booking/cancellation writes) and
 * `AvailabilityBlocksService` (block writes) share one invalidation policy
 * instead of each poking Redis keys directly.
 */
@Injectable()
export class AvailabilityCacheService {
  constructor(private readonly redis: RedisService) {}

  async read(serviceId: string, date: string): Promise<Slot[] | null> {
    const cached = await this.redis.readJson<CachedSlot[]>(
      cacheKey(serviceId, date),
    );
    if (!cached) {
      return null;
    }
    return cached.map((slot) => ({
      startsAt: new Date(slot.startsAt),
      endsAt: new Date(slot.endsAt),
    }));
  }

  async write(serviceId: string, date: string, slots: Slot[]): Promise<void> {
    const serializable: CachedSlot[] = slots.map((slot) => ({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
    }));
    await this.redis.writeJson(
      cacheKey(serviceId, date),
      serializable,
      TTL_SECONDS,
    );
  }

  /** A booking or cancellation affects exactly one service+date pair. */
  async invalidateOne(serviceId: string, date: string): Promise<void> {
    await this.redis.delete(cacheKey(serviceId, date));
  }

  /**
   * An availability-block write can affect any service on any date the block
   * (or its recurrence) touches — flushing the whole namespace is simpler and
   * safer than computing the exact affected set, and the cache is only ever
   * ~60s stale to begin with.
   */
  async invalidateAll(): Promise<void> {
    await this.redis.deleteByPrefix(KEY_PREFIX);
  }
}

function cacheKey(serviceId: string, date: string): string {
  return `${KEY_PREFIX}${serviceId}:${date}`;
}
