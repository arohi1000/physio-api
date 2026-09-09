import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { API_PREFIX } from '../src/swagger';

// Never a seeded address: a failed login here increments that email's lockout
// counter, and the counter is keyed by email alone.
const UNKNOWN_EMAIL = `absent.${randomUUID().slice(0, 8)}@physio.test`;

/**
 * The dev bypass must be absent, not merely refused, when the flag is off.
 * The env var is set before `app.module` is imported because
 * `AuthModule.register()` reads it while that module is being evaluated.
 */
describe('Dev login route with AUTH_DEV_BYPASS off (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.AUTH_DEV_BYPASS = 'false';

    // Deliberately deferred to after the env mutation above; a top-level
    // import would evaluate AuthModule.register() with the flag still on.
    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 404 — the route is not registered at all', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/dev-login')
      .send({ email: UNKNOWN_EMAIL })
      .expect(404);
  });

  it('still serves the real auth routes', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: UNKNOWN_EMAIL, password: 'wrong' })
      .expect(401);
  });
});
