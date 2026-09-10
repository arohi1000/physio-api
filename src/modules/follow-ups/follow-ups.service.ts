import { Injectable } from '@nestjs/common';
import type { FollowUp, Prisma } from '@prisma/client';
import {
  localDateOfInstant,
  zonedWallClockToUtc,
} from '../availability/timezone.util';
import { ClinicSettingsService } from '../clinic-settings/clinic-settings.service';
import {
  FollowUpDateInPastException,
  FollowUpNotFoundException,
} from '../../common/exceptions/app.exception';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateFollowUpDto } from './dto/create-follow-up.dto';
import type {
  FollowUpResponseDto,
  PaginatedFollowUpsDto,
} from './dto/follow-up-response.dto';
import type { QueryFollowUpsDto } from './dto/query-follow-ups.dto';
import type { UpdateFollowUpDto } from './dto/update-follow-up.dto';

/** The reminder fires at this local wall-clock time on the computed date —
 * business hours, chosen because the contract fixes only the date arithmetic
 * (`revisitTargetDate − lead days`), not a time of day. */
const REMINDER_LOCAL_TIME = '09:00';

/**
 * Owns the `follow_ups` table. Computes and stores `reminderScheduledFor`;
 * enqueues nothing — the messaging worker that actually sends a reminder is
 * Milestone 4 (M3-CONTRACT.md §1, §7.4). Building that here would be
 * building ahead.
 */
@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly clinicSettingsService: ClinicSettingsService,
  ) {}

  async create(
    patientId: string,
    dto: CreateFollowUpDto,
    createdByUserId: string,
  ): Promise<FollowUpResponseDto> {
    // §2.1: a soft-deleted patient must 404 a follow-up write, not accept one.
    await this.patientsService.assertLiveOrThrow(patientId);

    const settings = await this.clinicSettingsService.getWorkingHours();
    const today = localDateOfInstant(new Date(), settings.timezone);
    if (dto.revisitTargetDate < today) {
      throw new FollowUpDateInPastException();
    }

    const reminderScheduledFor = computeReminderScheduledFor(
      dto.revisitTargetDate,
      settings.timezone,
      settings.followUpReminderLeadDays,
    );

    const created = await this.prisma.db.followUp.create({
      data: {
        patientId,
        appointmentId: dto.appointmentId ?? null,
        purpose: dto.purpose,
        revisitTargetDate: new Date(dto.revisitTargetDate),
        reminderScheduledFor,
        createdByUserId,
      },
    });

    return toResponseDto(created);
  }

  async list(query: QueryFollowUpsDto): Promise<PaginatedFollowUpsDto> {
    const where: Prisma.FollowUpWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.dueBefore) {
      where.revisitTargetDate = { lte: new Date(query.dueBefore) };
    }

    const [rows, total] = await Promise.all([
      this.prisma.db.followUp.findMany({
        where,
        orderBy: { revisitTargetDate: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.db.followUp.count({ where }),
    ]);

    return {
      data: rows.map(toResponseDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async update(
    id: string,
    dto: UpdateFollowUpDto,
  ): Promise<FollowUpResponseDto> {
    const existing = await this.prisma.db.followUp.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new FollowUpNotFoundException();
    }

    const data: Prisma.FollowUpUpdateInput = {};
    if (dto.purpose !== undefined) {
      data.purpose = dto.purpose;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }
    if (dto.revisitTargetDate !== undefined) {
      const settings = await this.clinicSettingsService.getWorkingHours();
      const today = localDateOfInstant(new Date(), settings.timezone);
      if (dto.revisitTargetDate < today) {
        throw new FollowUpDateInPastException();
      }
      data.revisitTargetDate = new Date(dto.revisitTargetDate);
      data.reminderScheduledFor = computeReminderScheduledFor(
        dto.revisitTargetDate,
        settings.timezone,
        settings.followUpReminderLeadDays,
      );
    }

    const updated = await this.prisma.db.followUp.update({
      where: { id },
      data,
    });

    return toResponseDto(updated);
  }
}

function computeReminderScheduledFor(
  revisitTargetDate: string,
  timezone: string,
  leadDays: number,
): Date {
  const reminderDate = subtractDays(revisitTargetDate, leadDays);
  return zonedWallClockToUtc(reminderDate, REMINDER_LOCAL_TIME, timezone);
}

function subtractDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  instant.setUTCDate(instant.getUTCDate() - days);
  return instant.toISOString().slice(0, 10);
}

function toResponseDto(followUp: FollowUp): FollowUpResponseDto {
  return {
    id: followUp.id,
    patientId: followUp.patientId,
    appointmentId: followUp.appointmentId,
    purpose: followUp.purpose,
    revisitTargetDate: followUp.revisitTargetDate.toISOString().slice(0, 10),
    reminderScheduledFor: followUp.reminderScheduledFor.toISOString(),
    status: followUp.status,
    createdAt: followUp.createdAt.toISOString(),
  };
}
