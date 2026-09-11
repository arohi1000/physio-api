/**
 * Features built during the original full-scope build and deferred to Phase 2
 * when scope was trimmed on 2026-09-12 (see ../../../Clinic_Demo/PRD.md §6).
 *
 * The code is **disconnected, not deleted**. Services, DTOs and tests stay
 * intact and keep compiling; only the HTTP entry point disappears. Turning a
 * feature back on is setting an environment variable, not a rebuild — which is
 * the whole point, since each of these returns as a paid add-on.
 *
 * Default is off. An unset variable means the feature is unreachable.
 */
export const PHASE_2_FEATURES = [
  'coupons',
  'prescriptions',
  'receipts',
  'rescheduleLink',
] as const;

export type Phase2Feature = (typeof PHASE_2_FEATURES)[number];

export const PHASE_2_FEATURE_ENV_KEYS: Record<Phase2Feature, string> = {
  coupons: 'FEATURE_COUPONS',
  prescriptions: 'FEATURE_PRESCRIPTIONS',
  receipts: 'FEATURE_RECEIPTS',
  rescheduleLink: 'FEATURE_RESCHEDULE_LINK',
};

export function isPhase2FeatureEnabled(
  feature: Phase2Feature,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[PHASE_2_FEATURE_ENV_KEYS[feature]] === 'true';
}
