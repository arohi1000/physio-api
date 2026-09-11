import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import type { PaginatedBlogPostsDto, BlogPostDto } from './dto/blog-post.dto';

const TTL_SECONDS = 60;
const KEY_PREFIX = 'blog:';

/**
 * Public-read cache for the blog, mirroring `AvailabilityCacheService`'s
 * pattern: a short TTL as a safety net, with any admin write flushing the
 * whole namespace so an edit reaches the public site immediately
 * (M5-CONTRACT.md §6.3) rather than waiting out the TTL. The list is keyed
 * per page/limit; there are few enough admin edits that flushing the whole
 * namespace on any write is simpler than computing the affected pages.
 */
@Injectable()
export class BlogCacheService {
  constructor(private readonly redis: RedisService) {}

  async readList(
    page: number,
    limit: number,
  ): Promise<PaginatedBlogPostsDto | null> {
    return this.redis.readJson<PaginatedBlogPostsDto>(listKey(page, limit));
  }

  async writeList(
    page: number,
    limit: number,
    value: PaginatedBlogPostsDto,
  ): Promise<void> {
    await this.redis.writeJson(listKey(page, limit), value, TTL_SECONDS);
  }

  async readBySlug(slug: string): Promise<BlogPostDto | null> {
    return this.redis.readJson<BlogPostDto>(slugKey(slug));
  }

  async writeBySlug(slug: string, value: BlogPostDto): Promise<void> {
    await this.redis.writeJson(slugKey(slug), value, TTL_SECONDS);
  }

  async invalidateAll(): Promise<void> {
    await this.redis.deleteByPrefix(KEY_PREFIX);
  }
}

function listKey(page: number, limit: number): string {
  return `${KEY_PREFIX}list:${page}:${limit}`;
}

function slugKey(slug: string): string {
  return `${KEY_PREFIX}slug:${slug}`;
}
