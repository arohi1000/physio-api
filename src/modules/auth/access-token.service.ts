import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, type User } from '@prisma/client';
import type { EnvironmentVariables } from '../../config/environment';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';

/**
 * Audience claim on CRM access tokens. The patient portal (Phase 6) issues
 * tokens with a different audience, and each guard rejects the other's.
 */
export const CRM_TOKEN_AUDIENCE = 'crm';

interface AccessTokenClaims {
  readonly sub: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly aud: string;
}

export interface IssuedAccessToken {
  readonly accessToken: string;
  readonly expiresIn: number;
}

/** Signs and verifies the short-lived CRM access token. */
@Injectable()
export class AccessTokenService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ttlSeconds = configService.get('JWT_ACCESS_TTL_SECONDS', {
      infer: true,
    });
  }

  async issue(user: User): Promise<IssuedAccessToken> {
    const accessToken = await this.jwtService.signAsync(
      {
        name: user.name,
        email: user.email,
        role: user.role,
      },
      {
        subject: user.id,
        audience: CRM_TOKEN_AUDIENCE,
        expiresIn: this.ttlSeconds,
      },
    );

    return { accessToken, expiresIn: this.ttlSeconds };
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    let claims: AccessTokenClaims;
    try {
      claims = await this.jwtService.verifyAsync<AccessTokenClaims>(token, {
        audience: CRM_TOKEN_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Authentication required');
    }

    if (!isUserRole(claims.role)) {
      throw new UnauthorizedException('Authentication required');
    }

    return {
      id: claims.sub,
      name: claims.name,
      email: claims.email,
      role: claims.role,
    };
  }
}

function isUserRole(value: string): value is UserRole {
  return (Object.values(UserRole) as string[]).includes(value);
}
