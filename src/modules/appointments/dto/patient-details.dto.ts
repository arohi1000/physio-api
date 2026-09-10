import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PatientDetailsDto {
  @ApiProperty({ example: 'Asha Kumar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  readonly name: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  readonly phone: string;

  @ApiPropertyOptional({
    example: 'a@example.com',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @IsEmail()
  readonly email?: string | null;
}
