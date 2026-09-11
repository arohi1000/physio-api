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
process.env.FILE_STORAGE_SIGNING_SECRET =
  process.env.FILE_STORAGE_SIGNING_SECRET ??
  'integration-test-file-storage-signing-key-unused-elsewhere';
// Isolated from dev's ./storage/files so a test run's PDFs never mix with
// (or delete) files a developer is looking at locally.
process.env.FILE_STORAGE_DIR =
  process.env.FILE_STORAGE_DIR ?? './storage/files-test';
process.env.AUTH_DEV_BYPASS = 'true';

// Phase 2 features are disconnected in normal runs but their tests still run
// here (TRD.md §9). Those tests are what make reconnection safe — a deferred
// feature whose suite stopped running would quietly rot until someone tried to
// sell it as an add-on.
process.env.FEATURE_COUPONS = 'true';
process.env.FEATURE_PRESCRIPTIONS = 'true';
process.env.FEATURE_RECEIPTS = 'true';
process.env.FEATURE_RESCHEDULE_LINK = 'true';
