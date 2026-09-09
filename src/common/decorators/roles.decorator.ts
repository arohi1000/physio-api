import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'auth:roles';

/**
 * Restricts a route to the listed roles. Absent, a route is open to any
 * authenticated user.
 *
 * Per PLAN.md decision 4: `staff` may manage patients, follow-ups, receipts,
 * prescriptions and appointments; coupons, patient deletion, user management,
 * the activity log and clinic settings are `doctor_admin` only.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
