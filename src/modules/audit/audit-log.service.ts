import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogEntryDto, AuditLogPageDto } from './dto/audit-log.dto';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

export interface AuditLogEntry {
  readonly userId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string;
  readonly metadata?: Prisma.InputJsonValue;
  readonly ipAddress?: string;
}

/** Owns the `audit_logs` table (TRD §4.14, §7.5). */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditLogEntry): Promise<void> {
    await this.prisma.db.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }

  async list(query: QueryAuditLogsDto): Promise<AuditLogPageDto> {
    const where: Prisma.AuditLogWhereInput = {
      userId: query.userId,
      action: query.action,
      entityType: query.entityType,
    };

    const [total, rows] = await Promise.all([
      this.prisma.db.auditLog.count({ where }),
      this.prisma.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

    return new AuditLogPageDto(
      rows.map((row) => new AuditLogEntryDto(row)),
      total,
      query.page,
      query.pageSize,
    );
  }
}
