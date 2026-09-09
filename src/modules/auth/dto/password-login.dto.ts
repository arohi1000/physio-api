import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Break-glass credentials for the seeded admin (physio-api-PLAN §3.3). */
export class PasswordLoginDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(320)
  readonly email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  readonly password: string;
}
