import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ValidateCouponDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @IsNotEmpty()
  readonly code: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  readonly serviceId: string;
}
