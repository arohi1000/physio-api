import { UnauthorizedException } from '@nestjs/common';
import { UserRole, type User } from '@prisma/client';
import * as argon2 from 'argon2';
import type { PinoLogger } from 'nestjs-pino';
import type { UsersService } from '../users/users.service';
import type { AccessTokenService } from './access-token.service';
import { AuthService } from './auth.service';
import type {
  GoogleIdentity,
  GoogleTokenVerifier,
} from './google/google-token-verifier';
import type { LoginAttemptLimiter } from './login-attempt.limiter';
import type { RefreshTokenStore } from './refresh-token.store';

const GOOGLE_SUBJECT = '110248495921238986420';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Dr. Meera Sharma',
    email: 'doctor@physioclinic.local',
    googleSub: null,
    passwordHash: null,
    role: UserRole.doctor_admin,
    active: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildIdentity(
  overrides: Partial<GoogleIdentity> = {},
): GoogleIdentity {
  return {
    subject: GOOGLE_SUBJECT,
    email: 'doctor@physioclinic.local',
    emailVerified: true,
    name: 'Dr. Meera Sharma',
    ...overrides,
  };
}

describe('AuthService', () => {
  let users: jest.Mocked<UsersService>;
  let accessTokens: jest.Mocked<AccessTokenService>;
  let refreshTokens: jest.Mocked<RefreshTokenStore>;
  let loginAttempts: jest.Mocked<LoginAttemptLimiter>;
  let googleVerifier: jest.Mocked<GoogleTokenVerifier>;
  let service: AuthService;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findByGoogleSub: jest.fn(),
      findById: jest.fn(),
      linkGoogleSub: jest.fn(),
      recordSuccessfulLogin: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UsersService>;

    accessTokens = {
      issue: jest
        .fn()
        .mockResolvedValue({ accessToken: 'access-token', expiresIn: 900 }),
    } as unknown as jest.Mocked<AccessTokenService>;

    refreshTokens = {
      issueForNewFamily: jest.fn().mockResolvedValue({
        token: 'family.token.secret',
        expiresInSeconds: 60,
      }),
      exchange: jest.fn(),
      revokeFamilyOf: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RefreshTokenStore>;

    loginAttempts = {
      isLockedOut: jest.fn().mockResolvedValue(false),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<LoginAttemptLimiter>;

    googleVerifier = {
      verify: jest.fn(),
    };

    const logger = {
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as PinoLogger;

    service = new AuthService(
      users,
      accessTokens,
      refreshTokens,
      loginAttempts,
      googleVerifier,
      logger,
    );
  });

  describe('signInWithGoogle', () => {
    it('issues a session and links google_sub on the first successful sign-in', async () => {
      const user = buildUser();
      googleVerifier.verify.mockResolvedValue(buildIdentity());
      users.findByGoogleSub.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(user);
      users.linkGoogleSub.mockResolvedValue({
        ...user,
        googleSub: GOOGLE_SUBJECT,
      });

      const { session } = await service.signInWithGoogle('id-token');

      expect(users.linkGoogleSub).toHaveBeenCalledWith(user.id, GOOGLE_SUBJECT);
      expect(session.user.email).toBe(user.email);
      expect(session.accessToken).toBe('access-token');
      expect(users.recordSuccessfulLogin).toHaveBeenCalledWith(user.id);
    });

    it('matches on google_sub once known, without touching the email lookup', async () => {
      const user = buildUser({ googleSub: GOOGLE_SUBJECT });
      googleVerifier.verify.mockResolvedValue(buildIdentity());
      users.findByGoogleSub.mockResolvedValue(user);

      await service.signInWithGoogle('id-token');

      expect(users.findByEmail).not.toHaveBeenCalled();
      expect(users.linkGoogleSub).not.toHaveBeenCalled();
    });

    it('rejects an email that is not in users and never creates one', async () => {
      googleVerifier.verify.mockResolvedValue(
        buildIdentity({ email: 'stranger@gmail.com' }),
      );
      users.findByGoogleSub.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(null);

      await expect(service.signInWithGoogle('id-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(users.linkGoogleSub).not.toHaveBeenCalled();
    });

    it('rejects a deactivated user', async () => {
      googleVerifier.verify.mockResolvedValue(buildIdentity());
      users.findByGoogleSub.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(buildUser({ active: false }));

      await expect(service.signInWithGoogle('id-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(users.linkGoogleSub).not.toHaveBeenCalled();
    });

    it('rejects a deactivated user matched by google_sub', async () => {
      googleVerifier.verify.mockResolvedValue(buildIdentity());
      users.findByGoogleSub.mockResolvedValue(
        buildUser({ googleSub: GOOGLE_SUBJECT, active: false }),
      );

      await expect(service.signInWithGoogle('id-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an unverified Google email', async () => {
      googleVerifier.verify.mockResolvedValue(
        buildIdentity({ emailVerified: false }),
      );

      await expect(service.signInWithGoogle('id-token')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(users.findByGoogleSub).not.toHaveBeenCalled();
    });

    it('rejects when the address is already bound to a different Google account', async () => {
      googleVerifier.verify.mockResolvedValue(buildIdentity());
      users.findByGoogleSub.mockResolvedValue(null);
      users.findByEmail.mockResolvedValue(
        buildUser({ googleSub: 'a-different-subject' }),
      );

      await expect(service.signInWithGoogle('id-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('translates a token verification failure into a generic 401', async () => {
      googleVerifier.verify.mockRejectedValue(new Error('Invalid signature'));

      await expect(service.signInWithGoogle('id-token')).rejects.toThrow(
        new UnauthorizedException('Authentication failed'),
      );
    });
  });

  describe('signInWithPassword', () => {
    it('accepts the seeded admin password', async () => {
      const passwordHash = await argon2.hash('correct horse battery staple', {
        type: argon2.argon2id,
      });
      users.findByEmail.mockResolvedValue(buildUser({ passwordHash }));

      const { session } = await service.signInWithPassword(
        'Doctor@PhysioClinic.local',
        'correct horse battery staple',
      );

      expect(session.user.role).toBe(UserRole.doctor_admin);
      expect(loginAttempts.clear).toHaveBeenCalledWith(
        'doctor@physioclinic.local',
      );
    });

    it('records a failed attempt and rejects a wrong password', async () => {
      const passwordHash = await argon2.hash('correct horse battery staple', {
        type: argon2.argon2id,
      });
      users.findByEmail.mockResolvedValue(buildUser({ passwordHash }));

      await expect(
        service.signInWithPassword('doctor@physioclinic.local', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
      expect(loginAttempts.recordFailure).toHaveBeenCalled();
    });

    it('rejects a Google-only user that has no password hash', async () => {
      users.findByEmail.mockResolvedValue(buildUser({ passwordHash: null }));

      await expect(
        service.signInWithPassword('doctor@physioclinic.local', 'anything'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown email with the same message as a wrong password', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.signInWithPassword('stranger@gmail.com', 'anything'),
      ).rejects.toThrow(new UnauthorizedException('Authentication failed'));
    });

    it('refuses while the email is locked out', async () => {
      loginAttempts.isLockedOut.mockResolvedValue(true);

      await expect(
        service.signInWithPassword('doctor@physioclinic.local', 'anything'),
      ).rejects.toThrow(UnauthorizedException);
      expect(users.findByEmail).not.toHaveBeenCalled();
    });
  });

  describe('signInWithDevBypass', () => {
    it('applies the same allow-list as Google sign-in', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.signInWithDevBypass('stranger@gmail.com'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a deactivated user', async () => {
      users.findByEmail.mockResolvedValue(buildUser({ active: false }));

      await expect(
        service.signInWithDevBypass('doctor@physioclinic.local'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('issues a real session for an active allow-listed user', async () => {
      users.findByEmail.mockResolvedValue(buildUser());

      const { session, refreshToken } = await service.signInWithDevBypass(
        'doctor@physioclinic.local',
      );

      expect(session.accessToken).toBe('access-token');
      expect(refreshToken.token).toBe('family.token.secret');
    });
  });

  describe('refreshSession', () => {
    it('rejects and revokes the family when the store reports reuse', async () => {
      refreshTokens.exchange.mockResolvedValue({
        outcome: 'rejected',
        familyRevoked: true,
      });

      await expect(service.refreshSession('replayed')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(users.findById).not.toHaveBeenCalled();
    });

    it('revokes the family when the account was deactivated mid-session', async () => {
      refreshTokens.exchange.mockResolvedValue({
        outcome: 'rotated',
        userId: 'user-id',
        refreshToken: { token: 'new.token.value', expiresInSeconds: 60 },
      });
      users.findById.mockResolvedValue(buildUser({ active: false }));

      await expect(service.refreshSession('valid')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshTokens.revokeFamilyOf).toHaveBeenCalledWith('valid');
    });
  });
});
