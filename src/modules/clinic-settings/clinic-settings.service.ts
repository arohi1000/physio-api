import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { WeeklyWorkingHours } from './clinic-settings.types';
import type { ClinicSettingsDto } from './dto/clinic-settings.dto';
import type { UpdateClinicSettingsDto } from './dto/update-clinic-settings.dto';

/**
 * Owns the singleton `clinic_settings` row. Other modules (the slot engine,
 * booking) read the weekly working-hours template and buffer through here.
 */
@Injectable()
export class ClinicSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * There is exactly one settings row, seeded at M1/M2. `findFirstOrThrow`
   * makes that invariant explicit rather than silently handling a null case
   * that should never occur outside a broken deployment.
   */
  async getSettings(): Promise<ClinicSettingsDto> {
    const settings = await this.prisma.db.clinicSettings.findFirstOrThrow();
    return toDto(settings);
  }

  /** Internal accessor for other modules — the raw working-hours template
   * plus the follow-up reminder lead time the follow-ups module needs. */
  async getWorkingHours(): Promise<{
    timezone: string;
    workingHours: WeeklyWorkingHours;
    slotBufferMinutes: number;
    followUpReminderLeadDays: number;
  }> {
    const settings = await this.prisma.db.clinicSettings.findFirstOrThrow();
    return {
      timezone: settings.timezone,
      workingHours: settings.workingHours as unknown as WeeklyWorkingHours,
      slotBufferMinutes: settings.slotBufferMinutes,
      followUpReminderLeadDays: settings.followUpReminderLeadDays,
    };
  }

  async updateSettings(
    dto: UpdateClinicSettingsDto,
  ): Promise<ClinicSettingsDto> {
    const existing = await this.prisma.db.clinicSettings.findFirstOrThrow();

    const data: Prisma.ClinicSettingsUpdateInput = {};
    if (dto.workingHours !== undefined) {
      data.workingHours = dto.workingHours as unknown as Prisma.InputJsonValue;
    }
    if (dto.slotBufferMinutes !== undefined) {
      data.slotBufferMinutes = dto.slotBufferMinutes;
    }
    if (dto.timezone !== undefined) {
      data.timezone = dto.timezone;
    }

    const updated = await this.prisma.db.clinicSettings.update({
      where: { id: existing.id },
      data,
    });

    return toDto(updated);
  }
}

function toDto(settings: {
  timezone: string;
  workingHours: Prisma.JsonValue;
  slotBufferMinutes: number;
}): ClinicSettingsDto {
  return {
    timezone: settings.timezone,
    workingHours:
      settings.workingHours as unknown as ClinicSettingsDto['workingHours'],
    slotBufferMinutes: settings.slotBufferMinutes,
  };
}
