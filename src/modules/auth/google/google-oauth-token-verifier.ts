import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { EnvironmentVariables } from '../../../config/environment';
import { GoogleIdentity, GoogleTokenVerifier } from './google-token-verifier';

/**
 * Production implementation. `verifyIdToken` fetches Google's JWKS (cached by
 * the library), checks the RS256 signature, the `iss` claim against Google's
 * two accepted issuers, `aud` against our OAuth client ID, and `exp`.
 */
@Injectable()
export class GoogleOAuthTokenVerifier extends GoogleTokenVerifier {
  private readonly client = new OAuth2Client();
  private readonly clientId: string;

  constructor(
    configService: ConfigService<EnvironmentVariables, true>,
    @InjectPinoLogger(GoogleOAuthTokenVerifier.name)
    private readonly logger: PinoLogger,
  ) {
    super();
    this.clientId = configService.get('GOOGLE_OAUTH_CLIENT_ID', {
      infer: true,
    });
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (this.clientId === '') {
      this.logger.error(
        'GOOGLE_OAUTH_CLIENT_ID is unset — every Google sign-in will be rejected',
      );
      throw new UnauthorizedException('Authentication failed');
    }

    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: this.clientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new UnauthorizedException('Authentication failed');
    }

    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name,
    };
  }
}
