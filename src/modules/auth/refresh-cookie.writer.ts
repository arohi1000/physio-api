import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import {
  EnvironmentVariables,
  NodeEnvironment,
} from '../../config/environment';
import { API_PREFIX } from '../../swagger';
import type { IssuedRefreshToken } from './refresh-token.store';

export const REFRESH_COOKIE_NAME = 'physio_refresh_token';

/**
 * Scoped to the auth path so the refresh token is never attached to any other
 * API call. Nothing outside `/auth/*` can read it back, and it does not travel
 * with ordinary CRM requests.
 */
const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth`;

/** Reads and writes the httpOnly refresh cookie. */
@Injectable()
export class RefreshCookieWriter {
  private readonly baseOptions: CookieOptions;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    const nodeEnv = configService.get('NODE_ENV', { infer: true });
    this.baseOptions = {
      httpOnly: true,
      // Plain HTTP is only ever used on localhost; everything else is TLS.
      secure: nodeEnv !== NodeEnvironment.Development,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    };
  }

  read(request: Request): string | undefined {
    const value: unknown = request.cookies?.[REFRESH_COOKIE_NAME];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  write(response: Response, refreshToken: IssuedRefreshToken): void {
    response.cookie(REFRESH_COOKIE_NAME, refreshToken.token, {
      ...this.baseOptions,
      maxAge: refreshToken.expiresInSeconds * 1000,
    });
  }

  clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.baseOptions);
  }
}
