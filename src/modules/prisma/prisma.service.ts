import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { softDeleteExtension } from './soft-delete.extension';

function applySoftDeleteFilter(client: PrismaClient) {
  return client.$extends(softDeleteExtension);
}

export type FilteredPrismaClient = ReturnType<typeof applySoftDeleteFilter>;

/**
 * The type of the `tx` callback parameter for `FilteredPrismaClient.$transaction`.
 *
 * `Prisma.TransactionClient` (the unextended base type) looks like it should
 * fit here, but does not: a `$extends`-wrapped client's interactive
 * transaction callback carries the extension's generic marker in its type,
 * which is not structurally assignable to the plain base type even though
 * the soft-delete extension changes no method's runtime signature. Inferring
 * the type directly from `FilteredPrismaClient` itself — rather than naming
 * it — keeps every module that runs code inside a transaction (appointments,
 * coupons, patients, availability) correctly typed against the client they
 * actually receive.
 */
export type PrismaTransactionClient = FilteredPrismaClient extends {
  $transaction(
    fn: (client: infer Client) => unknown,
    ...args: never[]
  ): unknown;
}
  ? Client
  : never;

/**
 * Owns the Prisma connection and exposes two views of it.
 *
 * Composition rather than inheritance: a `PrismaService extends PrismaClient`
 * would put the unfiltered model delegates on the same object as the filtered
 * ones, making it far too easy to read soft-deleted rows by accident.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** Default client for application code. Soft-deleted rows are invisible. */
  readonly db: FilteredPrismaClient;

  /**
   * Escape hatch: soft-deleted rows are visible and hard deletes are possible.
   * Reserved for admin restore and DPDP erasure paths (TRD §7.4).
   */
  readonly includingDeleted: PrismaClient;

  constructor(
    @InjectPinoLogger(PrismaService.name)
    private readonly logger: PinoLogger,
  ) {
    this.includingDeleted = new PrismaClient();
    this.db = applySoftDeleteFilter(this.includingDeleted);
  }

  /**
   * A failed initial connection is logged rather than thrown: the API must
   * still boot so that /health can report the database as unreachable.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.includingDeleted.$connect();
    } catch (error) {
      this.logger.error({ err: error }, 'Initial database connection failed');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.includingDeleted.$disconnect();
  }

  async ping(): Promise<void> {
    await this.includingDeleted.$queryRaw`SELECT 1`;
  }
}
