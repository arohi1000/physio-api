import type { UserRole } from '@prisma/client';
import type { Request } from 'express';
import type { AuditRecorder } from '../audit/audit-recorder';

/** The authenticated principal, as carried on the request by JwtAuthGuard. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  auditRecorder?: AuditRecorder;
}
