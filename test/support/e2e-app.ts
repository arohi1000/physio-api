import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import cookieParser from 'cookie-parser';
import type { Response } from 'supertest';
import { AppModule } from '../../src/app.module';
import { REFRESH_COOKIE_NAME } from '../../src/modules/auth/refresh-cookie.writer';
import { API_PREFIX } from '../../src/swagger';

export interface E2eContext {
  readonly app: INestApplication;
  readonly prisma: PrismaClient;
}

export async function createE2eApp(
  extraControllers: Type<unknown>[] = [],
): Promise<E2eContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  await app.init();

  return { app, prisma: new PrismaClient() };
}

export async function destroyE2eApp(context: E2eContext): Promise<void> {
  await context.prisma.$disconnect();
  await context.app.close();
}

/**
 * Creates an allow-listed CRM user for a test. Emails are namespaced per test
 * so files can run without coordinating fixtures.
 */
export async function createTestUser(
  prisma: PrismaClient,
  options: {
    email: string;
    role: UserRole;
    active?: boolean;
    passwordHash?: string;
  },
): Promise<{ id: string; email: string }> {
  const user = await prisma.user.upsert({
    where: { email: options.email },
    update: {
      role: options.role,
      active: options.active ?? true,
      passwordHash: options.passwordHash ?? null,
    },
    create: {
      name: `Test ${options.role}`,
      email: options.email,
      role: options.role,
      active: options.active ?? true,
      passwordHash: options.passwordHash ?? null,
    },
  });

  return { id: user.id, email: user.email };
}

/**
 * Cookies are handled by hand rather than through a supertest agent: the
 * refresh cookie is marked Secure outside development, and an agent's jar
 * would refuse to replay it over plain HTTP.
 */
export function readRefreshCookie(response: Response): string {
  const cookie = rawRefreshCookie(response);
  if (!cookie) {
    throw new Error('Response did not set a refresh cookie');
  }
  const value = cookie.split(';')[0].split('=')[1];
  return value;
}

export function rawRefreshCookie(response: Response): string | undefined {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  return cookies.find((cookie) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));
}

export function refreshCookieHeader(token: string): string {
  return `${REFRESH_COOKIE_NAME}=${token}`;
}
