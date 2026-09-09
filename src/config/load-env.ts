import { config } from 'dotenv';

/**
 * Loads `.env` into `process.env` at module-evaluation time.
 *
 * `ConfigModule.forRoot()` does the same thing, but only once Nest starts
 * resolving modules — which is after `@Module({ imports: [...] })` decorators
 * have run. `AuthModule.register()` has to read `AUTH_DEV_BYPASS` inside that
 * decorator to decide whether the dev-login route exists at all, so the file
 * has to be on `process.env` before then. Existing variables are never
 * overwritten, so a real environment always wins over the file.
 */
config({ quiet: true });
