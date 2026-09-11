import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * `PATCH /admin/blog/:id`. Slug is editable here (M5-CONTRACT.md §4) but is
 * never regenerated from a changed title — the CRM must warn the doctor
 * before changing the slug of a published post, since it breaks its links.
 */
export class UpdateBlogPostDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(SLUG_PATTERN, {
    message: 'slug must be lowercase, alphanumeric, hyphen-separated',
  })
  readonly slug?: string;

  @ApiPropertyOptional({ description: 'Markdown' })
  @IsOptional()
  @IsString()
  readonly content?: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUrl()
  readonly coverImageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readonly published?: boolean;
}
