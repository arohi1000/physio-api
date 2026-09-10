import { Injectable } from '@nestjs/common';
import { ClinicSettingsService } from '../clinic-settings/clinic-settings.service';
import {
  PrismaService,
  type PrismaTransactionClient,
} from '../prisma/prisma.service';
import { ServicesService } from '../services/services.service';
import { AvailabilityCacheService } from './availability-cache.service';
import type { AvailabilityResponseDto } from './dto/availability-response.dto';
import { expandBlock } from './rrule-expander';
import { computeAvailableSlots, isWithinAvailability } from './slot-engine';
import type { SlotEngineInput, TimeInterval } from './slot-engine.types';
import { startOfLocalDayUtc, startOfNextLocalDayUtc } from './timezone.util';

/** The subset of the Prisma client this module reads from — satisfied by
 * both `PrismaService.db` (cache-miss path) and a transaction client (the
 * booking transaction's in-lock re-verification), so the same query logic
 * serves both without duplicating it. */
type DbReader = Pick<
  PrismaTransactionClient,
  'availabilityBlock' | 'appointment'
>;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servicesService: ServicesService,
    private readonly clinicSettingsService: ClinicSettingsService,
    private readonly cache: AvailabilityCacheService,
  ) {}

  async getAvailability(
    serviceId: string,
    date: string,
  ): Promise<AvailabilityResponseDto> {
    const service = await this.servicesService.findActiveByIdOrThrow(serviceId);
    const settings = await this.clinicSettingsService.getWorkingHours();

    let slots = await this.cache.read(serviceId, date);
    if (!slots) {
      const { blocks, bookedAppointments } = await this.loadDayInputs(
        this.prisma.db,
        date,
        settings.timezone,
      );
      const engineInput: SlotEngineInput = {
        date,
        timezone: settings.timezone,
        durationMinutes: service.durationMinutes,
        bufferMinutes: settings.slotBufferMinutes,
        workingHours: settings.workingHours,
        blocks,
        bookedAppointments,
      };
      slots = computeAvailableSlots(engineInput);
      await this.cache.write(serviceId, date, slots);
    }

    return {
      date,
      timezone: settings.timezone,
      serviceId,
      durationMinutes: service.durationMinutes,
      slots: slots.map((slot) => ({
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })),
    };
  }

  /**
   * The booking transaction's in-lock check: is `candidate` a real slot for
   * this service, reading through `tx` so it sees exactly the committed-plus-
   * in-flight state the advisory lock is protecting — never the Redis cache,
   * and never the booked-appointments list (occupancy is checked separately;
   * this only asks "is this a legitimate slot boundary at all").
   */
  async isWithinAvailabilityInTransaction(
    tx: PrismaTransactionClient,
    candidate: TimeInterval,
    date: string,
    durationMinutes: number,
  ): Promise<boolean> {
    const settings = await this.clinicSettingsService.getWorkingHours();
    const { blocks } = await this.loadDayInputs(tx, date, settings.timezone);

    return isWithinAvailability(candidate, {
      date,
      timezone: settings.timezone,
      durationMinutes,
      bufferMinutes: settings.slotBufferMinutes,
      workingHours: settings.workingHours,
      blocks,
    });
  }

  private async loadDayInputs(
    client: DbReader,
    date: string,
    timezone: string,
  ): Promise<{
    blocks: TimeInterval[];
    bookedAppointments: TimeInterval[];
  }> {
    const rangeStart = startOfLocalDayUtc(date, timezone);
    const rangeEnd = startOfNextLocalDayUtc(date, timezone);

    // Recurring blocks may start well outside this window and still recur
    // into it, so any block carrying a rule is fetched regardless of its own
    // start/end; a non-recurring block is prefiltered to ones that overlap.
    const blockRows = await client.availabilityBlock.findMany({
      where: {
        OR: [
          { recurringRule: { not: null } },
          {
            recurringRule: null,
            startDatetime: { lt: rangeEnd },
            endDatetime: { gt: rangeStart },
          },
        ],
      },
    });

    const blocks = blockRows.flatMap((block) =>
      expandBlock(block, rangeStart, rangeEnd),
    );

    const appointmentRows = await client.appointment.findMany({
      where: {
        status: 'booked',
        deletedAt: null,
        scheduledAt: { gte: rangeStart, lt: rangeEnd },
      },
      include: { service: true },
    });

    const bookedAppointments: TimeInterval[] = appointmentRows.map((row) => ({
      startsAt: row.scheduledAt,
      endsAt: new Date(
        row.scheduledAt.getTime() + row.service.durationMinutes * 60_000,
      ),
    }));

    return { blocks, bookedAppointments };
  }
}
