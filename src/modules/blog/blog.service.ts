import { Injectable } from '@nestjs/common';
import type { BlogPost, Prisma } from '@prisma/client';
import {
  BlogPostNotFoundException,
  BlogSlugTakenException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { BlogCacheService } from './blog-cache.service';
import type { BlogPostDto, PaginatedBlogPostsDto } from './dto/blog-post.dto';
import type { BlogStatusFilter } from './dto/query-admin-blog-posts.dto';
import type { CreateBlogPostDto } from './dto/create-blog-post.dto';
import type { UpdateBlogPostDto } from './dto/update-blog-post.dto';

type BlogPostWithAuthor = BlogPost & { author: { name: string } };

const AUTHOR_SELECT = { author: { select: { name: true } } } as const;

/** Owns the `blog_posts` table. */
@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: BlogCacheService,
  ) {}

  /** `GET /blog` — published only, newest first. Public reads are cached. */
  async listPublished(
    page: number,
    limit: number,
  ): Promise<PaginatedBlogPostsDto> {
    const cached = await this.cache.readList(page, limit);
    if (cached) {
      return cached;
    }

    const where: Prisma.BlogPostWhereInput = { published: true };
    const [rows, total] = await Promise.all([
      this.prisma.db.blogPost.findMany({
        where,
        include: AUTHOR_SELECT,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.db.blogPost.count({ where }),
    ]);

    const result: PaginatedBlogPostsDto = {
      data: rows.map(toDto),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
    await this.cache.writeList(page, limit, result);
    return result;
  }

  /**
   * `GET /blog/:slug` — a draft is never publicly readable
   * (M5-CONTRACT.md §6.1): it 404s exactly like a slug that does not exist.
   */
  async getPublishedBySlug(slug: string): Promise<BlogPostDto> {
    const cached = await this.cache.readBySlug(slug);
    if (cached) {
      return cached;
    }

    const post = await this.prisma.db.blogPost.findFirst({
      where: { slug, published: true },
      include: AUTHOR_SELECT,
    });
    if (!post) {
      throw new BlogPostNotFoundException();
    }

    const dto = toDto(post);
    await this.cache.writeBySlug(slug, dto);
    return dto;
  }

  /** `GET /admin/blog?status=` — drafts included. */
  async listForAdmin(
    status: BlogStatusFilter,
    page: number,
    limit: number,
  ): Promise<PaginatedBlogPostsDto> {
    const where: Prisma.BlogPostWhereInput =
      status === 'all' ? {} : { published: status === 'published' };

    const [rows, total] = await Promise.all([
      this.prisma.db.blogPost.findMany({
        where,
        include: AUTHOR_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.db.blogPost.count({ where }),
    ]);

    return {
      data: rows.map(toDto),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  /** `GET /admin/blog/:id` — drafts included. */
  async getByIdForAdmin(id: string): Promise<BlogPostDto> {
    const post = await this.prisma.db.blogPost.findUnique({
      where: { id },
      include: AUTHOR_SELECT,
    });
    if (!post) {
      throw new BlogPostNotFoundException();
    }
    return toDto(post);
  }

  async create(
    dto: CreateBlogPostDto,
    authorUserId: string,
  ): Promise<BlogPostDto> {
    const slug = await this.uniqueSlugFromTitle(dto.title);
    const published = dto.published ?? false;

    const created = await this.prisma.db.blogPost.create({
      data: {
        title: dto.title,
        slug,
        content: dto.content,
        coverImageUrl: dto.coverImageUrl ?? null,
        published,
        publishedAt: published ? new Date() : null,
        authorUserId,
      },
      include: AUTHOR_SELECT,
    });

    await this.cache.invalidateAll();
    return toDto(created);
  }

  async update(id: string, dto: UpdateBlogPostDto): Promise<BlogPostDto> {
    const existing = await this.prisma.db.blogPost.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new BlogPostNotFoundException();
    }

    if (dto.slug !== undefined && dto.slug !== existing.slug) {
      await this.assertSlugAvailable(dto.slug);
    }

    // Stamped once, the first time `published` flips true, and never reset
    // by a later edit — including a later unpublish/republish cycle
    // (M5-CONTRACT.md §4).
    const nowPublishing =
      dto.published === true && existing.publishedAt === null;

    const updated = await this.prisma.db.blogPost.update({
      where: { id },
      data: {
        title: dto.title,
        slug: dto.slug,
        content: dto.content,
        coverImageUrl: dto.coverImageUrl,
        published: dto.published,
        publishedAt: nowPublishing ? new Date() : undefined,
      },
      include: AUTHOR_SELECT,
    });

    await this.cache.invalidateAll();
    return toDto(updated);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.prisma.db.blogPost.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new BlogPostNotFoundException();
    }

    // A blog post is not a medical record — hard delete (M5-CONTRACT.md §3).
    await this.prisma.db.blogPost.delete({ where: { id } });
    await this.cache.invalidateAll();
  }

  private async uniqueSlugFromTitle(title: string): Promise<string> {
    const slug = slugify(title);
    await this.assertSlugAvailable(slug);
    return slug;
  }

  private async assertSlugAvailable(slug: string): Promise<void> {
    const existing = await this.prisma.db.blogPost.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new BlogSlugTakenException();
    }
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toDto(post: BlogPostWithAuthor): BlogPostDto {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    content: post.content,
    coverImageUrl: post.coverImageUrl,
    published: post.published,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    author: { name: post.author.name },
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}
