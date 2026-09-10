import { BadRequestException, Injectable } from '@nestjs/common';
import type { AvailabilityBlock } from '@prisma/client';
import { AvailabilityCacheService } from './availability-cache.service';
import { expandBlock } from './rrule-expander';
import type {
  AffectedAppointmentDto,
  AvailabilityBlockDto,
  AvailabilityBlockWithWarningsDto,
} from './dto/availability-block.dto';
import type { CreateAvailabilityBlockDto } from './dto/create-availability-block.dto';
import type { UpdateAvailabilityBlockDto } from './dto/update-availability-block.dto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * How far past `endsAt` (for a bounded/unbounded recurring block) we look
 * when reporting which currently-booked appointments a new or edited block
 * would overlap. A demo clinic's booking horizon does not realistically
 * extend past this, and an unbounded weekly block is otherwise unbounded by
 * definition — the warning is necessarily a snapshot, not an exhaustive
 * lifetime list.
 */
const AFFECTED_LOOKAHEAD_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Owns the `availability_blocks` table. Creating or editing a block that
 * overlaps existing bookings always succeeds — it returns the overlapping
 * appointments as a warning and never cancels them (PRD §12).
 */
@Injectable()
export class AvailabilityBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AvailabilityCacheService,
  ) {}

  async list(from: string, to: string): Promise<AvailabilityBlockDto[]> {
    const rangeStart = new Date(from);
    const rangeEnd = new Date(to);
    const blocks = await this.prisma.db.availabilityBlock.findMany({
      orderBy: { startDatetime: 'asc' },
    });

    return blocks
      .filter((block) => expandBlock(block, rangeStart, rangeEnd).length > 0)
      .map(toDto);
  }

  async create(
    dto: CreateAvailabilityBlockDto,
    createdByUserId: string,
  ): Promise<AvailabilityBlockWithWarningsDto> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    assertOrdered(startsAt, endsAt);

    const block = await this.prisma.db.availabilityBlock.create({
      data: {
        startDatetime: startsAt,
        endDatetime: endsAt,
        reason: dto.reason ?? null,
        recurringRule: dto.recurringRule ?? null,
        createdByUserId,
      },
    });

    await this.cache.invalidateAll();

    return {
      ...toDto(block),
      affectedAppointments: await this.findAffectedAppointments(block),
    };
  }

  async update(
    id: string,
    dto: UpdateAvailabilityBlockDto,
  ): Promise<AvailabilityBlockWithWarningsDto> {
    const existing = await this.prisma.db.availabilityBlock.findUniqueOrThrow({
      where: { id },
    });

    const startsAt = dto.startsAt
      ? new Date(dto.startsAt)
      : existing.startDatetime;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endDatetime;
    assertOrdered(startsAt, endsAt);

    const block = await this.prisma.db.availabilityBlock.update({
      where: { id },
      data: {
        startDatetime: startsAt,
        endDatetime: endsAt,
        reason: dto.reason !== undefined ? dto.reason : existing.reason,
        recurringRule:
          dto.recurringRule !== undefined
            ? dto.recurringRule
            : existing.recurringRule,
      },
    });

    await this.cache.invalidateAll();

    return {
      ...toDto(block),
      affectedAppointments: await this.findAffectedAppointments(block),
    };
  }

  async remove(id: string): Promise<void> {
    await this.prisma.db.availabilityBlock.delete({ where: { id } });
    await this.cache.invalidateAll();
  }

  private async findAffectedAppointments(
    block: AvailabilityBlock,
  ): Promise<AffectedAppointmentDto[]> {
    const horizonEnd = new Date(
      Math.max(block.endDatetime.getTime(), Date.now()) + AFFECTED_LOOKAHEAD_MS,
    );
    const occurrences = expandBlock(block, block.startDatetime, horizonEnd);
    if (occurrences.length === 0) {
      return [];
    }

    const earliestStart = occurrences[0].startsAt;
    const latestEnd = occurrences.reduce(
      (latest, occurrence) =>
        occurrence.endsAt > latest ? occurrence.endsAt : latest,
      occurrences[0].endsAt,
    );

    const candidates = await this.prisma.db.appointment.findMany({
      where: {
        status: 'booked',
        scheduledAt: { gte: earliestStart, lt: latestEnd },
      },
      include: { patient: true, service: true },
    });

    const affected = candidates.filter((appointment) => {
      const appointmentEnd = new Date(
        appointment.scheduledAt.getTime() +
          appointment.service.durationMinutes * 60_000,
      );
      return occurrences.some(
        (occurrence) =>
          appointment.scheduledAt < occurrence.endsAt &&
          occurrence.startsAt < appointmentEnd,
      );
    });

    return affected.map((appointment) => ({
      id: appointment.id,
      startsAt: appointment.scheduledAt.toISOString(),
      patientName: appointment.patient.name,
    }));
  }
}

function assertOrdered(startsAt: Date, endsAt: Date): void {
  if (startsAt >= endsAt) {
    throw new BadRequestException('startsAt must be before endsAt');
  }
}

function toDto(block: AvailabilityBlock): AvailabilityBlockDto {
  return {
    id: block.id,
    startsAt: block.startDatetime.toISOString(),
    endsAt: block.endDatetime.toISOString(),
    reason: block.reason,
    recurringRule: block.recurringRule,
  };
}
