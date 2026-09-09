import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { AuditRecorder } from '../audit/audit-recorder';
import type { AuthenticatedRequest } from '../http/authenticated-request';

export const AUDIT_ACTION_KEY = 'audit:action';

/**
 * Overrides the action name the audit interceptor would otherwise derive from
 * the HTTP method, for routes whose meaning is not create/update/delete —
 * `appointment.cancel`, for example.
 */
export const AuditAction = (action: string) =>
  SetMetadata(AUDIT_ACTION_KEY, action);

/** The request's AuditRecorder, so a handler can supply a before/after diff. */
export const Audit = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuditRecorder => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auditRecorder) {
      throw new Error(
        '@Audit() used on a route the AuditLogInterceptor does not cover',
      );
    }
    return request.auditRecorder;
  },
);
