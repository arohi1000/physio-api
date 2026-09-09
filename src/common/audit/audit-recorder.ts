import type { Prisma } from '@prisma/client';

/** A before/after snapshot. Stored verbatim in `audit_logs.metadata` (JSONB). */
export type AuditSnapshot = Prisma.InputJsonValue | null;

/**
 * Per-request scratch space a handler uses to hand the audit interceptor
 * details it cannot infer from the HTTP envelope: the affected entity's id and
 * a before/after diff.
 *
 * The interceptor attaches one to every audited request; handlers that record
 * nothing simply produce an audit row without a diff.
 */
export class AuditRecorder {
  private entityId?: string;
  private before?: AuditSnapshot;
  private after?: AuditSnapshot;

  recordEntityId(id: string): void {
    this.entityId = id;
  }

  recordChange(before: AuditSnapshot, after: AuditSnapshot): void {
    this.before = before;
    this.after = after;
  }

  get recordedEntityId(): string | undefined {
    return this.entityId;
  }

  /** `undefined` when the handler recorded no diff, so no metadata is stored. */
  buildMetadata(): Prisma.InputJsonObject | undefined {
    if (this.before === undefined && this.after === undefined) {
      return undefined;
    }
    return { before: this.before ?? null, after: this.after ?? null };
  }
}
