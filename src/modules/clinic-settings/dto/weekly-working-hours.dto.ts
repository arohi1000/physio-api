import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { WorkingIntervalDto } from './working-interval.dto';

/**
 * `{ "mon": [...], "sun": [] }` — three-letter weekday keys fixed by
 * M2-CONTRACT.md §3. One property per day rather than a `Record` so each day
 * gets its own nested validation.
 */
export class WeeklyWorkingHoursDto {
  @ApiProperty({ type: [WorkingIntervalDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingIntervalDto)
  readonly mon: WorkingIntervalDto[];

  @ApiProperty({ type: [WorkingIntervalDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingIntervalDto)
  readonly tue: WorkingIntervalDto[];

  @ApiProperty({ type: [WorkingIntervalDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingIntervalDto)
  readonly wed: WorkingIntervalDto[];

  @ApiProperty({ type: [WorkingIntervalDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingIntervalDto)
  readonly thu: WorkingIntervalDto[];

  @ApiProperty({ type: [WorkingIntervalDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingIntervalDto)
  readonly fri: WorkingIntervalDto[];

  @ApiProperty({ type: [WorkingIntervalDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingIntervalDto)
  readonly sat: WorkingIntervalDto[];

  @ApiProperty({ type: [WorkingIntervalDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingIntervalDto)
  readonly sun: WorkingIntervalDto[];
}
