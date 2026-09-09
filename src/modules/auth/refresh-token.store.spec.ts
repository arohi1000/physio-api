import type { ConfigService } from '@nestjs/config';
import type { RedisService } from '../redis/redis.service';
import { RefreshTokenStore } from './refresh-token.store';

/** Minimal in-memory stand-in for the operations the store uses. */
class FakeRedis {
  private readonly values = new Map<string, unknown>();
  private readonly sets = new Map<string, Set<string>>();

  readJson<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.values.get(key) as T) ?? null);
  }

  writeJson(key: string, value: unknown): Promise<void> {
    this.values.set(key, JSON.parse(JSON.stringify(value)));
    return Promise.resolve();
  }

  delete(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.values.delete(key);
      this.sets.delete(key);
    }
    return Promise.resolve();
  }

  addToSet(key: string, member: string): Promise<void> {
    const members = this.sets.get(key) ?? new Set<string>();
    members.add(member);
    this.sets.set(key, members);
    return Promise.resolve();
  }

  readSetMembers(key: string): Promise<string[]> {
    return Promise.resolve([...(this.sets.get(key) ?? [])]);
  }

  get storedKeyCount(): number {
    return this.values.size;
  }
}

const USER_ID = '00000000-0000-4000-8000-000000000001';

describe('RefreshTokenStore', () => {
  let redis: FakeRedis;
  let store: RefreshTokenStore;

  beforeEach(() => {
    redis = new FakeRedis();
    const configService = {
      get: () => 3600,
    } as unknown as ConfigService<never, true>;
    store = new RefreshTokenStore(
      redis as unknown as RedisService,
      configService,
    );
  });

  it('issues a token that exchanges once for a different token', async () => {
    const first = await store.issueForNewFamily(USER_ID);
    const exchange = await store.exchange(first.token);

    expect(exchange.outcome).toBe('rotated');
    if (exchange.outcome !== 'rotated') {
      return;
    }
    expect(exchange.userId).toBe(USER_ID);
    expect(exchange.refreshToken.token).not.toBe(first.token);
  });

  it('keeps the family id across rotations', async () => {
    const first = await store.issueForNewFamily(USER_ID);
    const exchange = await store.exchange(first.token);

    if (exchange.outcome !== 'rotated') {
      throw new Error('expected a rotation');
    }
    expect(exchange.refreshToken.token.split('.')[0]).toBe(
      first.token.split('.')[0],
    );
  });

  it('revokes the whole family when a rotated token is presented again', async () => {
    const first = await store.issueForNewFamily(USER_ID);
    const second = await store.exchange(first.token);
    if (second.outcome !== 'rotated') {
      throw new Error('expected a rotation');
    }

    const replay = await store.exchange(first.token);

    expect(replay).toEqual({ outcome: 'rejected', familyRevoked: true });
    // The successor issued to the legitimate client is dead too.
    await expect(store.exchange(second.refreshToken.token)).resolves.toEqual({
      outcome: 'rejected',
      familyRevoked: false,
    });
    expect(redis.storedKeyCount).toBe(0);
  });

  it('rejects a token whose secret does not match the stored hash', async () => {
    const issued = await store.issueForNewFamily(USER_ID);
    const [familyId, tokenId] = issued.token.split('.');

    await expect(
      store.exchange(`${familyId}.${tokenId}.forged-secret`),
    ).resolves.toEqual({ outcome: 'rejected', familyRevoked: false });
  });

  it.each(['', 'not-a-token', 'only.two'])(
    'rejects the malformed token %p without touching Redis',
    async (value) => {
      await expect(store.exchange(value)).resolves.toEqual({
        outcome: 'rejected',
        familyRevoked: false,
      });
    },
  );

  it('ends the session on logout', async () => {
    const issued = await store.issueForNewFamily(USER_ID);
    await store.revokeFamilyOf(issued.token);

    await expect(store.exchange(issued.token)).resolves.toEqual({
      outcome: 'rejected',
      familyRevoked: false,
    });
  });
});
