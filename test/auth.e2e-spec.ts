import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import {
  createE2eApp,
  createTestUser,
  destroyE2eApp,
  rawRefreshCookie,
  readRefreshCookie,
  refreshCookieHeader,
} from './support/e2e-app';

const SUITE = randomUUID().slice(0, 8);
const DOCTOR_EMAIL = `doctor.${SUITE}@physio.test`;
const INACTIVE_EMAIL = `inactive.${SUITE}@physio.test`;
const BREAK_GLASS_PASSWORD = 'break-glass-password-for-tests';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const context = await createE2eApp();
    app = context.app;
    prisma = context.prisma;

    await createTestUser(prisma, {
      email: DOCTOR_EMAIL,
      role: UserRole.doctor_admin,
      passwordHash: await argon2.hash(BREAK_GLASS_PASSWORD, {
        type: argon2.argon2id,
      }),
    });
    await createTestUser(prisma, {
      email: INACTIVE_EMAIL,
      role: UserRole.staff,
      active: false,
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [DOCTOR_EMAIL, INACTIVE_EMAIL] } },
    });
    await destroyE2eApp({ app, prisma });
  });

  function post(path: string) {
    return request(app.getHttpServer()).post(`/api/v1${path}`);
  }

  describe('POST /auth/dev-login', () => {
    it('issues a session for an allow-listed user and sets a scoped httpOnly cookie', async () => {
      const response = await post('/auth/dev-login')
        .send({ email: DOCTOR_EMAIL })
        .expect(200);

      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        expiresIn: 900,
        user: {
          id: expect.any(String),
          email: DOCTOR_EMAIL,
          role: UserRole.doctor_admin,
        },
      });

      const cookie = rawRefreshCookie(response);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/v1/auth');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Secure');
    });

    it('updates last_login_at', async () => {
      await post('/auth/dev-login').send({ email: DOCTOR_EMAIL }).expect(200);

      const user = await prisma.user.findUnique({
        where: { email: DOCTOR_EMAIL },
      });
      expect(user?.lastLoginAt).not.toBeNull();
    });

    it('rejects an email that is not in users', async () => {
      const response = await post('/auth/dev-login')
        .send({ email: `stranger.${SUITE}@gmail.com` })
        .expect(401);

      expect(response.body).toMatchObject({
        statusCode: 401,
        message: 'Authentication failed',
      });
    });

    it('rejects a deactivated user', async () => {
      await post('/auth/dev-login').send({ email: INACTIVE_EMAIL }).expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the signed-in user for a valid access token', async () => {
      const signIn = await post('/auth/dev-login')
        .send({ email: DOCTOR_EMAIL })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${signIn.body.accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        email: DOCTOR_EMAIL,
        role: UserRole.doctor_admin,
      });
    });

    it('rejects a missing token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });

    it('rejects a malformed token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the cookie and issues a new access token', async () => {
      const signIn = await post('/auth/dev-login')
        .send({ email: DOCTOR_EMAIL })
        .expect(200);
      const firstToken = readRefreshCookie(signIn);

      const refreshed = await post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(firstToken))
        .expect(200);

      const secondToken = readRefreshCookie(refreshed);
      expect(secondToken).not.toBe(firstToken);
      expect(refreshed.body.user.email).toBe(DOCTOR_EMAIL);

      // The rotated successor still works.
      await post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(secondToken))
        .expect(200);
    });

    it('revokes the entire family when an already-rotated token is replayed', async () => {
      const signIn = await post('/auth/dev-login')
        .send({ email: DOCTOR_EMAIL })
        .expect(200);
      const firstToken = readRefreshCookie(signIn);

      const refreshed = await post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(firstToken))
        .expect(200);
      const secondToken = readRefreshCookie(refreshed);

      // Replaying the consumed token is the signal that it was captured.
      await post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(firstToken))
        .expect(401);

      // The legitimate client's current token is revoked along with it.
      await post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(secondToken))
        .expect(401);
    });

    it('rejects a request with no cookie', async () => {
      await post('/auth/refresh').expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('returns 204, clears the cookie and kills the session', async () => {
      const signIn = await post('/auth/dev-login')
        .send({ email: DOCTOR_EMAIL })
        .expect(200);
      const token = readRefreshCookie(signIn);

      const logout = await post('/auth/logout')
        .set('Cookie', refreshCookieHeader(token))
        .expect(204);

      expect(rawRefreshCookie(logout)).toContain('physio_refresh_token=;');

      await post('/auth/refresh')
        .set('Cookie', refreshCookieHeader(token))
        .expect(401);
    });

    it('is a no-op without a cookie', async () => {
      await post('/auth/logout').expect(204);
    });
  });

  describe('POST /auth/login (break-glass)', () => {
    it('accepts the seeded password', async () => {
      const response = await post('/auth/login')
        .send({ email: DOCTOR_EMAIL, password: BREAK_GLASS_PASSWORD })
        .expect(200);

      expect(response.body.user.email).toBe(DOCTOR_EMAIL);
      expect(readRefreshCookie(response)).toBeTruthy();
    });

    it('rejects a wrong password with the same body as an unknown email', async () => {
      const wrongPassword = await post('/auth/login')
        .send({ email: DOCTOR_EMAIL, password: 'not-the-password' })
        .expect(401);
      const unknownEmail = await post('/auth/login')
        .send({ email: `nobody.${SUITE}@physio.test`, password: 'anything' })
        .expect(401);

      expect(wrongPassword.body.message).toBe('Authentication failed');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    });
  });

  describe('POST /auth/google', () => {
    it('rejects an unverifiable ID token', async () => {
      await post('/auth/google')
        .send({ idToken: 'not-a-google-token' })
        .expect(401);
    });

    it('rejects a request with no ID token', async () => {
      await post('/auth/google').send({}).expect(400);
    });
  });
});
