import { ApiProperty } from '@nestjs/swagger';

/** `Blog post` — M5-CONTRACT.md §4. */
class BlogAuthorDto {
  @ApiProperty()
  readonly name: string;
}

export class BlogPostDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly title: string;

  @ApiProperty()
  readonly slug: string;

  @ApiProperty({ description: 'Markdown, sanitised on render by the website' })
  readonly content: string;

  @ApiProperty({ type: String, nullable: true })
  readonly coverImageUrl: string | null;

  @ApiProperty()
  readonly published: boolean;

  @ApiProperty({ type: String, nullable: true })
  readonly publishedAt: string | null;

  @ApiProperty({ type: BlogAuthorDto })
  readonly author: BlogAuthorDto;

  @ApiProperty()
  readonly createdAt: string;

  @ApiProperty()
  readonly updatedAt: string;
}

class PaginationMetaDto {
  @ApiProperty()
  readonly page: number;

  @ApiProperty()
  readonly limit: number;

  @ApiProperty()
  readonly total: number;

  @ApiProperty()
  readonly totalPages: number;
}

export class PaginatedBlogPostsDto {
  @ApiProperty({ type: [BlogPostDto] })
  readonly data: BlogPostDto[];

  @ApiProperty({ type: PaginationMetaDto })
  readonly meta: PaginationMetaDto;
}
