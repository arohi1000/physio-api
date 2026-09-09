import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { normalizeEmail, UsersService } from '../users/users.service';
import { AccessTokenService } from './access-token.service';
import { AuthSessionDto, AuthUserDto } from './dto/auth-session.dto';
import {
  GoogleIdentity,
  GoogleTokenVerifier,
} from './google/google-token-verifier';
import { LoginAttemptLimiter } from './login-attempt.limiter';
import { IssuedRefreshToken, RefreshTokenStore } from './refresh-token.store';

/**
 * One message for every failure mode. Distinguishing "unknown email" from
 * "wrong password" or "deactivated account" would tell an attacker which
 * addresses belong to clinic staff.
 */
const GENERIC_FAILURE = 'Authentication failed';

/** TRD §7.2 mandates Argon2id; `verify` reads its parameters from the digest. */
const ARGON2_HASH_OPTIONS: argon2.HashOptions = { type: argon2.argon2id };

export interface EstablishedSession {
  readonly session: AuthSessionDto;
  readonly refreshToken: IssuedRefreshToken;
}

/**
 * CRM sign-in, session issuance and refresh rotation.
 *
 * The rule this service exists to enforce: Google (or the dev bypass) proves
 * *who* someone is; the `users` table decides *whether they are allowed in*.
 * No path here creates a user just in time.
 */
@Injectable()
export class AuthService {
  /**
   * Verifying a real hash for an unknown email keeps the response time of
   * "no such user" indistinguishable from "wrong password". Computed once and
   * reused; the plaintext is irrelevant because nothing ever matches it.
   */
  private readonly decoyPasswordHash: Promise<string>;

  constructor(
    private readonly users: UsersService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenStore,
    private readonly loginAttempts: LoginAttemptLimiter,
    private readonly googleVerifier: GoogleTokenVerifier,
    @InjectPinoLogger(AuthService.name)
    private readonly logger: PinoLogger,
  ) {
    this.decoyPasswordHash = argon2.hash(
      'decoy-value-that-is-never-a-real-password',
      ARGON2_HASH_OPTIONS,
    );
  }

  async signInWithGoogle(idToken: string): Promise<EstablishedSession> {
    const identity = await this.verifyGoogleToken(idToken);
    if (!identity.emailVerified) {
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    const user = await this.resolveAllowListedGoogleUser(identity);
    if (!user) {
      this.logger.warn(
        { email: identity.email },
        'Google sign-in refused: email is not an active CRM user',
      );
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    return this.establishSession(user);
  }

  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<EstablishedSession> {
    const normalizedEmail = normalizeEmail(email);
    if (await this.loginAttempts.isLockedOut(normalizedEmail)) {
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    const user = await this.users.findByEmail(normalizedEmail);
    const isValid = await this.verifyPassword(user, password);
    if (!isValid || !user) {
      await this.loginAttempts.recordFailure(normalizedEmail);
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    await this.loginAttempts.clear(normalizedEmail);
    return this.establishSession(user);
  }

  /**
   * Approved temporary stand-in for Google sign-in (EXECUTION-PLAN decision
   * B6). It skips identity proof and nothing else: the allow-list, the active
   * check and the session it issues are identical to the Google path.
   *
   * Reachable only when `AUTH_DEV_BYPASS=true` outside production — the route
   * that calls it is not registered otherwise (src/config/dev-bypass.ts).
   */
  async signInWithDevBypass(email: string): Promise<EstablishedSession> {
    const normalizedEmail = normalizeEmail(email);
    if (await this.loginAttempts.isLockedOut(normalizedEmail)) {
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    const user = await this.users.findByEmail(normalizedEmail);
    if (!user || !user.active) {
      await this.loginAttempts.recordFailure(normalizedEmail);
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    await this.loginAttempts.clear(normalizedEmail);
    this.logger.warn(
      { userId: user.id },
      'Session issued through the dev auth bypass',
    );
    return this.establishSession(user);
  }

  async refreshSession(presentedToken: string): Promise<EstablishedSession> {
    const exchange = await this.refreshTokens.exchange(presentedToken);
    if (exchange.outcome === 'rejected') {
      if (exchange.familyRevoked) {
        this.logger.error(
          'Refresh token reuse detected — the whole token family was revoked',
        );
      }
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    const user = await this.users.findById(exchange.userId);
    if (!user || !user.active) {
      await this.refreshTokens.revokeFamilyOf(presentedToken);
      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    const { accessToken, expiresIn } = await this.accessTokens.issue(user);
    return {
      session: new AuthSessionDto(
        accessToken,
        expiresIn,
        new AuthUserDto(user),
      ),
      refreshToken: exchange.refreshToken,
    };
  }

  async signOut(presentedToken: string | undefined): Promise<void> {
    if (presentedToken) {
      await this.refreshTokens.revokeFamilyOf(presentedToken);
    }
  }

  /**
   * Re-reads the account so a user deactivated mid-session loses access at the
   * next request rather than when their access token happens to expire.
   */
  async describeCurrentUser(userId: string): Promise<AuthUserDto> {
    const user = await this.users.findById(userId);
    if (!user || !user.active) {
      throw new UnauthorizedException(GENERIC_FAILURE);
    }
    return new AuthUserDto(user);
  }

  private async verifyGoogleToken(idToken: string): Promise<GoogleIdentity> {
    try {
      return await this.googleVerifier.verify(idToken);
    } catch (error) {
      this.logger.warn({ err: error }, 'Google ID token verification failed');
      throw new UnauthorizedException(GENERIC_FAILURE);
    }
  }

  /**
   * Matches on `google_sub` once it is known, because email addresses can be
   * reassigned within a Google Workspace while the subject id cannot.
   */
  private async resolveAllowListedGoogleUser(
    identity: GoogleIdentity,
  ): Promise<User | null> {
    const bySubject = await this.users.findByGoogleSub(identity.subject);
    if (bySubject) {
      return bySubject.active ? bySubject : null;
    }

    const byEmail = await this.users.findByEmail(identity.email);
    if (!byEmail || !byEmail.active) {
      return null;
    }

    // The address is already bound to a different Google account.
    if (byEmail.googleSub !== null) {
      return null;
    }

    return this.users.linkGoogleSub(byEmail.id, identity.subject);
  }

  private async verifyPassword(
    user: User | null,
    password: string,
  ): Promise<boolean> {
    const hash = user?.passwordHash ?? (await this.decoyPasswordHash);
    const matches = await argon2.verify(hash, password);
    return (
      matches && user !== null && user.active && user.passwordHash !== null
    );
  }

  private async establishSession(user: User): Promise<EstablishedSession> {
    const [{ accessToken, expiresIn }, refreshToken] = await Promise.all([
      this.accessTokens.issue(user),
      this.refreshTokens.issueForNewFamily(user.id),
    ]);
    await this.users.recordSuccessfulLogin(user.id);

    return {
      session: new AuthSessionDto(
        accessToken,
        expiresIn,
        new AuthUserDto(user),
      ),
      refreshToken,
    };
  }
}
