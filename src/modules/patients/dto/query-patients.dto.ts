import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** `GET /admin/patients?search=&page=&limit=` — search across name, phone,
 * email (M3-CONTRACT.md §3). */
export class QueryPatientsDto {
  @ApiPropertyOptional({ description: 'Matches patient name, phone or email' })
  @IsOptional()
  @IsString()
  readonly search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly limit: number = 20;
}
