import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export type BlogStatusFilter = 'all' | 'published' | 'draft';

const STATUS_VALUES: BlogStatusFilter[] = ['all', 'published', 'draft'];

/** `GET /admin/blog?status=&page=&limit=` — M5-CONTRACT.md §3. */
export class QueryAdminBlogPostsDto {
  @ApiPropertyOptional({ enum: STATUS_VALUES, default: 'all' })
  @IsOptional()
  @IsIn(STATUS_VALUES)
  readonly status: BlogStatusFilter = 'all';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit: number = 20;
}
