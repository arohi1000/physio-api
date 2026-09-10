import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { AuditLogService } from '../../modules/audit/audit-log.service';
import { AuditRecorder } from '../audit/audit-recorder';
import { AUDIT_ACTION_KEY } from '../decorators/audit-action.decorator';
import type { AuthenticatedRequest } from '../http/authenticated-request';

/**
 * Path segment → entity type. TRD §7.5 requires an audit row for every
 * create/update/delete on these tables. `follow-ups` added in M3
 * (M3-CONTRACT.md §7.2: "confirm follow-ups are included too") — the M1 set
 * only covered the tables that existed when the interceptor was written.
 */
const AUDITED_ENTITY_BY_SEGMENT: ReadonlyMap<string, string> = new Map([
  ['patients', 'patient'],
  ['appointments', 'appointment'],
  ['prescriptions', 'prescription'],
  ['receipts', 'receipt'],
  ['follow-ups', 'follow_up'],
  ['users', 'user'],
]);

const ACTION_BY_METHOD: ReadonlyMap<string, string> = new Map([
  ['POST', 'create'],
  ['PUT', 'update'],
  ['PATCH', 'update'],
  ['DELETE', 'delete'],
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Writes an `audit_logs` row for every successful non-GET request touching
 * patient, medical or financial data.
 *
 * The row is written before the response is emitted, so a client that sees a
 * success has a corresponding audit entry. A failed write is logged and does
 * not fail the request: the mutation has already committed, and returning an
 * error would tell the caller their change was rejected when it was not.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly reflector: Reflector,
    @InjectPinoLogger(AuditLogInterceptor.name)
    private readonly logger: PinoLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const entityType = resolveEntityType(request.path);

    if (!entityType || !ACTION_BY_METHOD.has(request.method)) {
      return next.handle();
    }

    const recorder = new AuditRecorder();
    request.auditRecorder = recorder;

    return next.handle().pipe(
      concatMap(async (body: unknown) => {
        await this.write(request, entityType, recorder, body, context);
        return body;
      }),
    );
  }

  private async write(
    request: AuthenticatedRequest,
    entityType: string,
    recorder: AuditRecorder,
    responseBody: unknown,
    context: ExecutionContext,
  ): Promise<void> {
    // Audited routes sit behind JwtAuthGuard, which runs first; an
    // unauthenticated request never reaches an interceptor.
    if (!request.user) {
      return;
    }

    const overriddenAction = this.reflector.getAllAndOverride<string>(
      AUDIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    try {
      await this.auditLogService.record({
        userId: request.user.id,
        action:
          overriddenAction ??
          `${entityType}.${ACTION_BY_METHOD.get(request.method) ?? 'update'}`,
        entityType,
        entityId: resolveEntityId(request, recorder, responseBody),
        metadata: recorder.buildMetadata(),
        ipAddress: request.ip,
      });
    } catch (error) {
      this.logger.error(
        { err: error, entityType, userId: request.user.id },
        'Failed to write audit log entry for a completed mutation',
      );
    }
  }
}

/**
 * The *last* matching segment wins, not the first: M3 introduced nested
 * routes like `/admin/patients/:id/follow-ups`, where `patients` matches
 * before `follow-ups` does but the record actually being written is the
 * follow-up, not the patient. Every route this API has still resolves the
 * same way under this rule — a flat route like `/admin/patients/:id` has
 * only one matching segment either way.
 */
function resolveEntityType(path: string): string | undefined {
  let resolved: string | undefined;
  for (const segment of path.split('/')) {
    const entityType = AUDITED_ENTITY_BY_SEGMENT.get(segment);
    if (entityType) {
      resolved = entityType;
    }
  }
  return resolved;
}

/**
 * Preference order: what the handler recorded, then the route parameter, then
 * the id of the resource just created.
 */
function resolveEntityId(
  request: AuthenticatedRequest,
  recorder: AuditRecorder,
  responseBody: unknown,
): string | undefined {
  const candidates = [
    recorder.recordedEntityId,
    request.params?.id,
    (responseBody as { id?: unknown } | null | undefined)?.id,
  ];

  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && UUID_PATTERN.test(candidate),
  );
}
