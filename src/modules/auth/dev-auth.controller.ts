import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { AuthSessionDto } from './dto/auth-session.dto';
import { DevLoginDto } from './dto/dev-login.dto';
import { RefreshCookieWriter } from './refresh-cookie.writer';

/**
 * DEVELOPMENT ONLY. Registered by `AuthModule.register()` only when
 * `AUTH_DEV_BYPASS=true` and `NODE_ENV !== 'production'`; the application
 * refuses to boot if the flag is set in production.
 *
 * It stands in for Google sign-in until an OAuth client exists
 * (EXECUTION-PLAN decision B6) and must be removed before any deployment.
 */
@ApiTags('auth')
@Controller('auth')
export class DevAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: RefreshCookieWriter,
  ) {}

  @Public()
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: '[DEV ONLY] Issue a session without proving identity',
    description:
      'Skips identity verification only. The email must still exist in `users` and be active.',
  })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  async devLogin(
    @Body() dto: DevLoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionDto> {
    const established = await this.authService.signInWithDevBypass(dto.email);
    this.cookies.write(response, established.refreshToken);
    return established.session;
  }
}
