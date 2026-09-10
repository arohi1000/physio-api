import { config } from 'dotenv';

config({ quiet: true });

/**
 * Integration tests run against the dedicated `physio_test` database so they
 * never touch development data. Create it and apply migrations with:
 *
 *   DATABASE_URL=postgresql://physio:physio@localhost:5433/physio_test \
 *     npx prisma migrate deploy
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://physio:physio@localhost:5433/physio_test?schema=public';
// Logical database 1 keeps test sessions and login-attempt counters out of the
// development instance on database 0 — a failed login in a test must not lock
// the seeded account out of the running dev API.
process.env.REDIS_URL =
  process.env.TEST_REDIS_URL ?? 'redis://localhost:6380/1';
process.env.LOG_LEVEL = 'fatal';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ??
  'integration-test-signing-key-not-used-anywhere-else';
process.env.RESCHEDULE_TOKEN_SECRET =
  process.env.RESCHEDULE_TOKEN_SECRET ??
  'integration-test-reschedule-signing-key-unused-elsewhere';
process.env.AUTH_DEV_BYPASS = 'true';
