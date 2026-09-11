import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

/** `site-content/about` — M5-CONTRACT.md §4. */
export class AboutContentDto {
  @ApiProperty()
  @IsString()
  readonly headline: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  readonly bioParagraphs: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  readonly credentials: string[];

  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsUrl()
  readonly photoUrl: string | null;

  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  readonly clinicAddress: string | null;
}
