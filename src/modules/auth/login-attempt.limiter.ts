import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const KEY_PREFIX = 'auth:login-attempts';
const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS_PER_EMAIL = 5;

/**
 * Per-email attempt limiting for the credential routes.
 *
 * `@nestjs/throttler` covers the per-IP dimension; it cannot key on a request
 * body field, and an attacker spreading attempts across IPs would otherwise
 * walk a single account's password unimpeded.
 */
@Injectable()
export class LoginAttemptLimiter {
  constructor(private readonly redis: RedisService) {}

  async isLockedOut(email: string): Promise<boolean> {
    const attempts = await this.redis.readCounter(keyFor(email));
    return attempts >= MAX_ATTEMPTS_PER_EMAIL;
  }

  async recordFailure(email: string): Promise<void> {
    await this.redis.incrementWithExpiry(keyFor(email), WINDOW_SECONDS);
  }

  async clear(email: string): Promise<void> {
    await this.redis.delete(keyFor(email));
  }
}

function keyFor(email: string): string {
  return `${KEY_PREFIX}:${email}`;
}
