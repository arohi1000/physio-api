import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/environment';
import { RedisService } from '../redis/redis.service';

const TOKEN_KEY_PREFIX = 'auth:refresh:token';
const FAMILY_KEY_PREFIX = 'auth:refresh:family';
const TOKEN_PART_COUNT = 3;

interface StoredRefreshToken {
  readonly userId: string;
  readonly secretHash: string;
  /** Set once the token has been exchanged. A second exchange is a reuse. */
  rotatedAt: string | null;
}

export interface IssuedRefreshToken {
  /** Opaque value placed in the httpOnly cookie. */
  readonly token: string;
  readonly expiresInSeconds: number;
}

export type RefreshTokenExchange =
  | {
      readonly outcome: 'rotated';
      readonly userId: string;
      readonly refreshToken: IssuedRefreshToken;
    }
  | { readonly outcome: 'rejected'; readonly familyRevoked: boolean };

interface ParsedRefreshToken {
  readonly familyId: string;
  readonly tokenId: string;
  readonly secret: string;
}

/**
 * Rotating refresh tokens with reuse detection (TRD §7.2).
 *
 * A sign-in opens a *family*. Every exchange issues a new token in that family
 * and marks the presented one as rotated. Presenting an already-rotated token
 * means the cookie was captured and replayed, so the entire family is revoked
 * and the legitimate session is forced to sign in again.
 *
 * Only hashes of the token secrets are stored, so a Redis dump does not yield
 * usable sessions.
 */
@Injectable()
export class RefreshTokenStore {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ttlSeconds = configService.get('JWT_REFRESH_TTL_SECONDS', {
      infer: true,
    });
  }

  /** Opens a new token family for a fresh sign-in. */
  issueForNewFamily(userId: string): Promise<IssuedRefreshToken> {
    return this.issueInFamily(userId, randomUUID());
  }

  async exchange(presentedToken: string): Promise<RefreshTokenExchange> {
    const parsed = parseToken(presentedToken);
    if (!parsed) {
      return { outcome: 'rejected', familyRevoked: false };
    }

    const stored = await this.redis.readJson<StoredRefreshToken>(
      tokenKey(parsed.familyId, parsed.tokenId),
    );
    if (!stored || !matchesSecret(parsed.secret, stored.secretHash)) {
      return { outcome: 'rejected', familyRevoked: false };
    }

    if (stored.rotatedAt !== null) {
      await this.revokeFamily(parsed.familyId);
      return { outcome: 'rejected', familyRevoked: true };
    }

    await this.redis.writeJson(
      tokenKey(parsed.familyId, parsed.tokenId),
      { ...stored, rotatedAt: new Date().toISOString() },
      this.ttlSeconds,
    );

    const refreshToken = await this.issueInFamily(
      stored.userId,
      parsed.familyId,
    );
    return { outcome: 'rotated', userId: stored.userId, refreshToken };
  }

  /** Ends the session the token belongs to. Unparseable tokens are ignored. */
  async revokeFamilyOf(presentedToken: string): Promise<void> {
    const parsed = parseToken(presentedToken);
    if (parsed) {
      await this.revokeFamily(parsed.familyId);
    }
  }

  private async issueInFamily(
    userId: string,
    familyId: string,
  ): Promise<IssuedRefreshToken> {
    const tokenId = randomUUID();
    const secret = randomBytes(32).toString('base64url');

    const record: StoredRefreshToken = {
      userId,
      secretHash: hashSecret(secret),
      rotatedAt: null,
    };

    await this.redis.writeJson(
      tokenKey(familyId, tokenId),
      record,
      this.ttlSeconds,
    );
    await this.redis.addToSet(familyKey(familyId), tokenId, this.ttlSeconds);

    return {
      token: [familyId, tokenId, secret].join('.'),
      expiresInSeconds: this.ttlSeconds,
    };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    const tokenIds = await this.redis.readSetMembers(familyKey(familyId));
    await this.redis.delete(
      familyKey(familyId),
      ...tokenIds.map((tokenId) => tokenKey(familyId, tokenId)),
    );
  }
}

function tokenKey(familyId: string, tokenId: string): string {
  return `${TOKEN_KEY_PREFIX}:${familyId}:${tokenId}`;
}

function familyKey(familyId: string): string {
  return `${FAMILY_KEY_PREFIX}:${familyId}`;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function matchesSecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashSecret(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseToken(value: string): ParsedRefreshToken | null {
  const parts = value.split('.');
  if (parts.length !== TOKEN_PART_COUNT || parts.some((part) => part === '')) {
    return null;
  }
  const [familyId, tokenId, secret] = parts;
  return { familyId, tokenId, secret };
}
