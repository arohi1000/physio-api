import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { WeeklyWorkingHoursDto } from './weekly-working-hours.dto';

export class UpdateClinicSettingsDto {
  @ApiPropertyOptional({ type: WeeklyWorkingHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WeeklyWorkingHoursDto)
  readonly workingHours?: WeeklyWorkingHoursDto;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  readonly slotBufferMinutes?: number;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  readonly timezone?: string;
}
