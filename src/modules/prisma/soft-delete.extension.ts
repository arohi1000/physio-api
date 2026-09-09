import { Prisma } from '@prisma/client';

/**
 * Models carrying `deleted_at` (TRD §4: legal/audit retention needs).
 */
const SOFT_DELETABLE_MODELS: ReadonlySet<string> = new Set<Prisma.ModelName>([
  'Patient',
  'Appointment',
  'Prescription',
  'Receipt',
]);

function isSoftDeletable(model: string): boolean {
  return SOFT_DELETABLE_MODELS.has(model);
}

type QueryArgs = { where?: Record<string, unknown> };

function scopeToLiveRows<T extends QueryArgs>(args: T): T {
  return { ...args, where: { ...args.where, deletedAt: null } };
}

/**
 * `findUnique` addresses a single row by a unique key, so a non-unique
 * `deletedAt` predicate cannot be pushed into its `where`. Discarding a
 * soft-deleted result afterwards is equivalent: the query returns at most one
 * row either way.
 */
function discardIfDeleted<T>(row: T): T | null {
  const deletedAt = (row as { deletedAt?: Date | null } | null)?.deletedAt;
  return deletedAt == null ? row : null;
}

/**
 * Hides soft-deleted rows from every default read and from the bulk write
 * operations that can express a non-unique predicate.
 *
 * Single-row `update`/`delete` are deliberately untouched: they address a row
 * by unique key that the caller has already resolved through a filtered read,
 * and Prisma cannot express the extra predicate on them.
 *
 * The escape hatch for admin and erasure paths is
 * `PrismaService.includingDeleted` — the unextended client.
 */
export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: {
      async findUnique({ model, args, query }) {
        const row: unknown = await query(args);
        return isSoftDeletable(model) ? discardIfDeleted(row) : row;
      },
      async findUniqueOrThrow({ model, args, query }) {
        const row: unknown = await query(args);
        if (isSoftDeletable(model) && discardIfDeleted(row) === null) {
          throw new Prisma.PrismaClientKnownRequestError(`No ${model} found`, {
            code: 'P2025',
            clientVersion: Prisma.prismaVersion.client,
          });
        }
        return row;
      },
      findFirst({ model, args, query }) {
        return query(isSoftDeletable(model) ? scopeToLiveRows(args) : args);
      },
      findFirstOrThrow({ model, args, query }) {
        return query(isSoftDeletable(model) ? scopeToLiveRows(args) : args);
      },
      findMany({ model, args, query }) {
        return query(isSoftDeletable(model) ? scopeToLiveRows(args) : args);
      },
      count({ model, args, query }) {
        return query(isSoftDeletable(model) ? scopeToLiveRows(args) : args);
      },
      aggregate({ model, args, query }) {
        return query(isSoftDeletable(model) ? scopeToLiveRows(args) : args);
      },
      groupBy({ model, args, query }) {
        return query(isSoftDeletable(model) ? scopeToLiveRows(args) : args);
      },
      updateMany({ model, args, query }) {
        return query(isSoftDeletable(model) ? scopeToLiveRows(args) : args);
      },
      deleteMany({ model, args, query }) {
        return query(isSoftDeletable(model) ? scopeToLiveRows(args) : args);
      },
    },
  },
});
