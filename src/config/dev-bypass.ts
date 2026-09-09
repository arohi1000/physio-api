import { NodeEnvironment } from './environment';

export const DEV_BYPASS_ENV_KEY = 'AUTH_DEV_BYPASS';

/**
 * `POST /auth/dev-login` stands in for Google sign-in until an OAuth client
 * exists (EXECUTION-PLAN decision B6). It is a bypass of identity proof and a
 * serious liability if it ever reaches production, so it is fenced twice:
 * the route is only registered when this returns true, and
 * `assertDevBypassIsNotProduction` throws at bootstrap if the flag is set in a
 * production environment.
 */
export function isDevBypassEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env[DEV_BYPASS_ENV_KEY] === 'true' &&
    env.NODE_ENV !== NodeEnvironment.Production
  );
}

export function assertDevBypassIsNotProduction(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (
    env[DEV_BYPASS_ENV_KEY] === 'true' &&
    env.NODE_ENV === NodeEnvironment.Production
  ) {
    throw new Error(
      `${DEV_BYPASS_ENV_KEY}=true is not permitted when NODE_ENV=production: ` +
        'the dev-login route bypasses identity verification. Unset it before deploying.',
    );
  }
}
