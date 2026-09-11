import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class ReviewItemDto {
  @ApiProperty()
  @IsString()
  readonly name: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  readonly rating: number;

  @ApiProperty()
  @IsString()
  readonly comment: string;
}

/**
 * `site-content/reviews` — static replacement for the deferred reviews
 * module (M5-CONTRACT.md §4). Not the `reviews` table: that model exists in
 * the schema but is unused this milestone, per §1's "reviews management
 * module" being out of scope.
 */
export class ReviewsContentDto {
  @ApiProperty({ type: [ReviewItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReviewItemDto)
  readonly items: ReviewItemDto[];
}
