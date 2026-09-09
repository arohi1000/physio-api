import { ApiProperty } from '@nestjs/swagger';
import { UserRole, type User } from '@prisma/client';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty({ format: 'email' })
  readonly email: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  readonly role: UserRole;

  constructor(user: Pick<User, 'id' | 'name' | 'email' | 'role'>) {
    this.id = user.id;
    this.name = user.name;
    this.email = user.email;
    this.role = user.role;
  }
}

export class AuthSessionDto {
  @ApiProperty({ description: 'Bearer token for the Authorization header.' })
  readonly accessToken: string;

  @ApiProperty({ description: 'Access-token lifetime in seconds.' })
  readonly expiresIn: number;

  @ApiProperty({ type: AuthUserDto })
  readonly user: AuthUserDto;

  constructor(accessToken: string, expiresIn: number, user: AuthUserDto) {
    this.accessToken = accessToken;
    this.expiresIn = expiresIn;
    this.user = user;
  }
}
