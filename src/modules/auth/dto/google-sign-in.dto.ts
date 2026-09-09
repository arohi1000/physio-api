import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleSignInDto {
  @ApiProperty({ description: 'Google ID token obtained by the CRM.' })
  @IsString()
  @IsNotEmpty()
  readonly idToken: string;
}
