import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/**
 * `POST /admin/blog`. The slug is never accepted here — M5-CONTRACT.md §4
 * generates it from the title on create; it only becomes editable afterwards.
 */
export class CreateBlogPostDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  readonly title: string;

  @ApiProperty({ description: 'Markdown' })
  @IsString()
  readonly content: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUrl()
  readonly coverImageUrl?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  readonly published?: boolean;
}
