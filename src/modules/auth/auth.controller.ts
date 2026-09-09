import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { AuthService, EstablishedSession } from './auth.service';
import { AuthSessionDto, AuthUserDto } from './dto/auth-session.dto';
import { GoogleSignInDto } from './dto/google-sign-in.dto';
import { PasswordLoginDto } from './dto/password-login.dto';
import { RefreshCookieWriter } from './refresh-cookie.writer';

/**
 * Per-IP ceiling for sign-in attempts. A whole clinic can share one NAT
 * address, so this is deliberately looser than the per-email lockout in
 * AuthService (5 failures in 15 minutes), which is what actually stops
 * credential guessing.
 */
const CREDENTIAL_ROUTE_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

/**
 * Refreshing is not a guessing route — the cookie is opaque and replaying a
 * rotated one revokes the family — so several staff behind one address must
 * not throttle each other out of their sessions.
 */
const REFRESH_ROUTE_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: RefreshCookieWriter,
  ) {}

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_ROUTE_THROTTLE)
  @ApiOperation({
    summary: 'Exchange a Google ID token for a CRM session',
    description:
      'The email must already exist in `users` and be active. Users are never created just in time.',
  })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  async signInWithGoogle(
    @Body() dto: GoogleSignInDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionDto> {
    return this.respondWithSession(
      await this.authService.signInWithGoogle(dto.idToken),
      response,
    );
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(CREDENTIAL_ROUTE_THROTTLE)
  @ApiOperation({
    summary: 'Break-glass password sign-in',
    description:
      'Kept so a lost Google account cannot lock the practice out of its own CRM.',
  })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  async signInWithPassword(
    @Body() dto: PasswordLoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionDto> {
    return this.respondWithSession(
      await this.authService.signInWithPassword(dto.email, dto.password),
      response,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle(REFRESH_ROUTE_THROTTLE)
  @ApiOperation({
    summary: 'Rotate the refresh cookie and issue a new access token',
    description:
      'Presenting an already-rotated token revokes every token in its family.',
  })
  @ApiResponse({ status: 200, type: AuthSessionDto })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionDto> {
    const presentedToken = this.cookies.read(request);
    if (!presentedToken) {
      throw new UnauthorizedException('Authentication failed');
    }

    return this.respondWithSession(
      await this.authService.refreshSession(presentedToken),
      response,
    );
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current refresh-token family' })
  @ApiResponse({ status: 204, description: 'Session ended' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.signOut(this.cookies.read(request));
    this.cookies.clear(response);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in CRM user' })
  @ApiResponse({ status: 200, type: AuthUserDto })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  describeCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuthUserDto> {
    return this.authService.describeCurrentUser(user.id);
  }

  private respondWithSession(
    established: EstablishedSession,
    response: Response,
  ): AuthSessionDto {
    this.cookies.write(response, established.refreshToken);
    return established.session;
  }
}
