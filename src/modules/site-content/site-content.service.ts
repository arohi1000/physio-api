import { BadRequestException, Injectable, Type } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Prisma } from '@prisma/client';
import { SiteContentKeyUnknownException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { SiteContentCacheService } from './site-content-cache.service';
import { AboutContentDto } from './dto/about-content.dto';
import { ReviewsContentDto } from './dto/reviews-content.dto';

type SiteContentShape = AboutContentDto | ReviewsContentDto;

/** Allowed keys and the shape each one validates against — M5-CONTRACT.md §4. */
const CONTENT_SCHEMA = new Map<string, Type<SiteContentShape>>([
  ['about', AboutContentDto],
  ['reviews', ReviewsContentDto],
]);

/**
 * Owns the `site_content` table (M5-CONTRACT.md §2). Key-value rather than
 * one service per content block, since both `about` and `reviews` share the
 * same read/write/cache/invalidate shape and a third block needs no new code.
 */
@Injectable()
export class SiteContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SiteContentCacheService,
  ) {}

  /** `GET /site-content/:key` and `/admin/site-content/:key`. */
  async get(key: string): Promise<SiteContentShape> {
    this.assertKnownKey(key);

    const cached = await this.cache.read<SiteContentShape>(key);
    if (cached) {
      return cached;
    }

    const row = await this.prisma.db.siteContent.findUnique({
      where: { key },
    });
    if (!row) {
      // Seeded at M5; a missing row for a known key means a broken deploy,
      // not a client error, but the contract only defines this one 404 code.
      throw new SiteContentKeyUnknownException();
    }

    const value = row.value as unknown as SiteContentShape;
    await this.cache.write(key, value);
    return value;
  }

  /** `PUT /admin/site-content/:key`. */
  async update(
    key: string,
    rawValue: unknown,
    updatedByUserId: string,
  ): Promise<SiteContentShape> {
    const value = await this.validateValue(key, rawValue);

    await this.prisma.db.siteContent.upsert({
      where: { key },
      update: {
        value: value as unknown as Prisma.InputJsonValue,
        updatedByUserId,
      },
      create: {
        key,
        value: value as unknown as Prisma.InputJsonValue,
        updatedByUserId,
      },
    });

    // Invalidate before returning: the doctor's own next read, and every
    // public reader after her, must see the edit (M5-CONTRACT.md §6.3).
    await this.cache.invalidate(key);
    return value;
  }

  private assertKnownKey(key: string): void {
    if (!CONTENT_SCHEMA.has(key)) {
      throw new SiteContentKeyUnknownException();
    }
  }

  private async validateValue(
    key: string,
    rawValue: unknown,
  ): Promise<SiteContentShape> {
    const dtoClass = CONTENT_SCHEMA.get(key);
    if (!dtoClass) {
      throw new SiteContentKeyUnknownException();
    }

    const instance = plainToInstance(dtoClass, rawValue);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }
    return instance;
  }
}
