import { ApiProperty } from '@nestjs/swagger';
import type { AuditLog } from '@prisma/client';

type AuditLogWithActor = AuditLog & {
  user: { name: string; email: string };
};

export class AuditLogActorDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty()
  readonly name: string;

  @ApiProperty({ format: 'email' })
  readonly email: string;

  constructor(id: string, name: string, email: string) {
    this.id = id;
    this.name = name;
    this.email = email;
  }
}

export class AuditLogEntryDto {
  @ApiProperty({ format: 'uuid' })
  readonly id: string;

  @ApiProperty({ type: AuditLogActorDto })
  readonly actor: AuditLogActorDto;

  @ApiProperty({ example: 'patient.delete' })
  readonly action: string;

  @ApiProperty({ example: 'patient' })
  readonly entityType: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  readonly entityId: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Before/after diff, when the handler recorded one.',
    additionalProperties: true,
    type: 'object',
  })
  readonly metadata: unknown;

  @ApiProperty({ nullable: true })
  readonly ipAddress: string | null;

  @ApiProperty({ format: 'date-time' })
  readonly createdAt: string;

  constructor(row: AuditLogWithActor) {
    this.id = row.id;
    this.actor = new AuditLogActorDto(
      row.userId,
      row.user.name,
      row.user.email,
    );
    this.action = row.action;
    this.entityType = row.entityType;
    this.entityId = row.entityId;
    this.metadata = row.metadata ?? null;
    this.ipAddress = row.ipAddress;
    this.createdAt = row.createdAt.toISOString();
  }
}

export class AuditLogPageDto {
  @ApiProperty({ type: [AuditLogEntryDto] })
  readonly items: AuditLogEntryDto[];

  @ApiProperty()
  readonly total: number;

  @ApiProperty()
  readonly page: number;

  @ApiProperty()
  readonly pageSize: number;

  constructor(
    items: AuditLogEntryDto[],
    total: number,
    page: number,
    pageSize: number,
  ) {
    this.items = items;
    this.total = total;
    this.page = page;
    this.pageSize = pageSize;
  }
}
