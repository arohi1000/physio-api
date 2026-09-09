import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class DevLoginDto {
  @ApiProperty({
    format: 'email',
    description:
      'Must already exist in `users` and be active — the allow-list applies exactly as it does to Google sign-in.',
  })
  @IsEmail()
  @MaxLength(320)
  readonly email: string;
}
