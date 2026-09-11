import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  BookingSource,
  PatientSource,
  Prisma,
} from '@prisma/client';
import {
  AppointmentNotCancellableException,
  ConsentRequiredException,
  CouponNotFoundException,
  SlotOutsideAvailabilityException,
  SlotUnavailableException,
} from '../../common/exceptions/app.exception';
import { isPhase2FeatureEnabled } from '../../config/phase2-features';
import { AvailabilityCacheService } from '../availability/availability-cache.service';
import { AvailabilityService } from '../availability/availability.service';
import { localDateOfInstant } from '../availability/timezone.util';
import { ClinicSettingsService } from '../clinic-settings/clinic-settings.service';
import { CouponsService } from '../coupons/coupons.service';
import { PatientsService } from '../patients/patients.service';
import {
  PrismaService,
  type PrismaTransactionClient,
} from '../prisma/prisma.service';
import { ServicesService } from '../services/services.service';
import type {
  AdminAppointmentDetailDto,
  AdminAppointmentListItemDto,
  PaginatedAdminAppointmentsDto,
} from './dto/admin-appointment.dto';
import type { AppointmentResponseDto } from './dto/appointment-response.dto';
import type { CreateAdminAppointmentDto } from './dto/create-admin-appointment.dto';
import type { CreateAppointmentDto } from './dto/create-appointment.dto';
import type { QueryAdminAppointmentsDto } from './dto/query-admin-appointments.dto';
import type { UpdateAppointmentDto } from './dto/update-appointment.dto';

const APPOINTMENT_RELATIONS = {
  patient: true,
  service: true,
  coupon: true,
  cancelledBy: true,
} satisfies Prisma.AppointmentInclude;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof APPOINTMENT_RELATIONS;
}>;

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/**
 * Owns the booking transaction — the highest-risk code in the project
 * (M2-CONTRACT.md §5). Every write path that claims a slot (guest booking,
 * admin walk-in, admin reschedule) funnels through
 * {@link AppointmentsService.runSlotTransaction}, so the lock, the
 * availability re-check and the unique-index backstop are exercised exactly
 * once, not reimplemented per call site.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servicesService: ServicesService,
    private readonly patientsService: PatientsService,
    private readonly couponsService: CouponsService,
    private readonly availabilityService: AvailabilityService,
    private readonly availabilityCache: AvailabilityCacheService,
    private readonly clinicSettingsService: ClinicSettingsService,
  ) {}

  async bookGuest(dto: CreateAppointmentDto): Promise<AppointmentResponseDto> {
    return this.createBooking(
      dto,
      BookingSource.website,
      PatientSource.website,
    );
  }

  async bookAdmin(
    dto: CreateAdminAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.createBooking(dto, BookingSource.manual, PatientSource.manual);
  }

  async list(
    query: QueryAdminAppointmentsDto,
  ): Promise<PaginatedAdminAppointmentsDto> {
    const where = buildListFilter(query);

    const [rows, total] = await Promise.all([
      this.prisma.db.appointment.findMany({
        where,
        include: APPOINTMENT_RELATIONS,
        orderBy: { scheduledAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.db.appointment.count({ where }),
    ]);

    return {
      data: rows.map(toListItemDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async getById(id: string): Promise<AdminAppointmentDetailDto> {
    const appointment = await this.prisma.db.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_RELATIONS,
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return toDetailDto(appointment);
  }

  async update(
    id: string,
    dto: UpdateAppointmentDto,
  ): Promise<AdminAppointmentDetailDto> {
    const existing = await this.prisma.db.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_RELATIONS,
    });
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }

    if (dto.status) {
      const updated = await this.prisma.db.appointment.update({
        where: { id },
        data: { status: dto.status },
        include: APPOINTMENT_RELATIONS,
      });

      // Any status change moves a row into or out of the booked set the slot
      // engine reads, so the cached day is stale either way.
      const settings = await this.clinicSettingsService.getWorkingHours();
      await this.availabilityCache.invalidateOne(
        updated.serviceId,
        localDateOfInstant(updated.scheduledAt, settings.timezone),
      );

      return toDetailDto(updated);
    }

    if (dto.startsAt) {
      // Only a live booking can move. Rescheduling a cancelled, completed or
      // no-show appointment would silently rewrite history: the timestamp moves
      // while the status stays, and the partial unique index does not object
      // because it only constrains `booked` rows.
      if (existing.status !== AppointmentStatus.booked) {
        throw new AppointmentNotCancellableException(
          'Only a booked appointment can be rescheduled.',
        );
      }
      const updated = await this.reschedule(existing, new Date(dto.startsAt));
      return toDetailDto(updated);
    }

    return toDetailDto(existing);
  }

  async cancel(
    id: string,
    reason: string,
    cancelledByUserId: string,
  ): Promise<AdminAppointmentDetailDto> {
    const existing = await this.prisma.db.appointment.findUnique({
      where: { id },
      include: APPOINTMENT_RELATIONS,
    });
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }
    if (existing.status !== AppointmentStatus.booked) {
      throw new AppointmentNotCancellableException();
    }

    const updated = await this.prisma.db.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.cancelled,
        cancellationReason: reason,
        cancelledByUserId,
      },
      include: APPOINTMENT_RELATIONS,
    });

    const settings = await this.clinicSettingsService.getWorkingHours();
    await this.availabilityCache.invalidateOne(
      updated.serviceId,
      localDateOfInstant(updated.scheduledAt, settings.timezone),
    );

    return toDetailDto(updated);
  }

  private async createBooking(
    dto: CreateAppointmentDto | CreateAdminAppointmentDto,
    bookingSource: BookingSource,
    patientSource: PatientSource,
  ): Promise<AppointmentResponseDto> {
    if (dto.consentGiven !== true) {
      throw new ConsentRequiredException();
    }

    // Coupons are deferred to Phase 2 (PRD.md §6). Un-registering
    // `/coupons/validate` does not close this path: booking accepts a code
    // directly, and the seeded codes live in a public repository — so without
    // this, anyone could still claim a discount. Rejected as unknown, which is
    // what it is from the caller's side, rather than silently ignored: a patient
    // who believes a discount applied should not discover otherwise at the desk.
    if (dto.couponCode && !isPhase2FeatureEnabled('coupons')) {
      throw new CouponNotFoundException();
    }

    const service = await this.servicesService.findActiveByIdOrThrow(
      dto.serviceId,
    );
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(
      startsAt.getTime() + service.durationMinutes * 60_000,
    );
    const settings = await this.clinicSettingsService.getWorkingHours();
    const localDate = localDateOfInstant(startsAt, settings.timezone);

    const appointment = await this.prisma.db.$transaction(async (tx) => {
      await this.lockSlot(tx, startsAt);
      await this.assertWithinAvailability(
        tx,
        startsAt,
        endsAt,
        localDate,
        service.durationMinutes,
      );
      await this.assertSlotFree(tx, startsAt);

      const patient = await this.patientsService.findOrCreateByPhone(tx, {
        name: dto.patient.name,
        phone: dto.patient.phone,
        email: dto.patient.email ?? null,
        source: patientSource,
      });
      await this.patientsService.stampConsent(tx, patient.id);

      let couponId: string | null = null;
      let priceCharged = service.price;
      if (dto.couponCode) {
        const applied = await this.couponsService.applyWithinTransaction(
          tx,
          dto.couponCode,
          service.price,
        );
        couponId = applied.couponId;
        priceCharged = applied.finalPrice;
      }

      const reference = await generateReference(tx);

      try {
        return await tx.appointment.create({
          data: {
            reference,
            patientId: patient.id,
            serviceId: service.id,
            scheduledAt: startsAt,
            status: AppointmentStatus.booked,
            bookingSource,
            reasonForVisit: dto.reasonForVisit,
            paymentPreference: dto.paymentPreference,
            couponId,
            priceCharged,
            paymentStatus: 'pending',
          },
          include: APPOINTMENT_RELATIONS,
        });
      } catch (error) {
        // Backstop: the partial unique index on (scheduled_at) WHERE
        // status='booked' AND deleted_at IS NULL is the last line of defence
        // if two transactions ever raced past the advisory lock.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_CONSTRAINT_VIOLATION
        ) {
          throw new SlotUnavailableException();
        }
        throw error;
      }
    });

    await this.availabilityCache.invalidateOne(service.id, localDate);

    return toBookingResponseDto(appointment, discountAmountOf(appointment));
  }

  private async reschedule(
    existing: AppointmentWithRelations,
    newStartsAt: Date,
  ): Promise<AppointmentWithRelations> {
    const durationMinutes = existing.service.durationMinutes;
    const newEndsAt = new Date(
      newStartsAt.getTime() + durationMinutes * 60_000,
    );
    const settings = await this.clinicSettingsService.getWorkingHours();
    const oldLocalDate = localDateOfInstant(
      existing.scheduledAt,
      settings.timezone,
    );
    const newLocalDate = localDateOfInstant(newStartsAt, settings.timezone);

    const updated = await this.prisma.db.$transaction(async (tx) => {
      await this.lockSlot(tx, newStartsAt);
      await this.assertWithinAvailability(
        tx,
        newStartsAt,
        newEndsAt,
        newLocalDate,
        durationMinutes,
      );
      await this.assertSlotFree(tx, newStartsAt, existing.id);

      try {
        return await tx.appointment.update({
          where: { id: existing.id },
          data: { scheduledAt: newStartsAt },
          include: APPOINTMENT_RELATIONS,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_CONSTRAINT_VIOLATION
        ) {
          throw new SlotUnavailableException();
        }
        throw error;
      }
    });

    await this.availabilityCache.invalidateOne(
      existing.serviceId,
      oldLocalDate,
    );
    await this.availabilityCache.invalidateOne(
      existing.serviceId,
      newLocalDate,
    );

    return updated;
  }

  /** Postgres advisory lock keyed on the slot timestamp, held for the
   * lifetime of the transaction (`pg_advisory_xact_lock` releases itself on
   * commit or rollback — no manual unlock). `hashtext` collapses the ISO
   * string to a 32-bit key; `::bigint` matches the single-argument overload. */
  private async lockSlot(
    tx: PrismaTransactionClient,
    startsAt: Date,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${startsAt.toISOString()})::bigint)`;
  }

  private async assertWithinAvailability(
    tx: PrismaTransactionClient,
    startsAt: Date,
    endsAt: Date,
    localDate: string,
    durationMinutes: number,
  ): Promise<void> {
    // The slot engine answers "is this a real slot in the weekly pattern", which
    // is true of last Tuesday as much as next Tuesday. Wall-clock time is
    // deliberately kept out of that pure function, so the "not in the past"
    // rule lives here — covering guest booking, walk-ins and reschedules alike.
    if (startsAt.getTime() < Date.now()) {
      throw new SlotOutsideAvailabilityException(
        'That time has already passed.',
      );
    }

    const withinAvailability =
      await this.availabilityService.isWithinAvailabilityInTransaction(
        tx,
        { startsAt, endsAt },
        localDate,
        durationMinutes,
      );
    if (!withinAvailability) {
      throw new SlotOutsideAvailabilityException();
    }
  }

  private async assertSlotFree(
    tx: PrismaTransactionClient,
    startsAt: Date,
    excludeAppointmentId?: string,
  ): Promise<void> {
    const conflict = await tx.appointment.findFirst({
      where: {
        scheduledAt: startsAt,
        status: AppointmentStatus.booked,
        deletedAt: null,
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
    });
    if (conflict) {
      throw new SlotUnavailableException();
    }
  }
}

async function generateReference(tx: PrismaTransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<
    { nextval: bigint }[]
  >`SELECT nextval('appointment_reference_seq') AS nextval`;
  const sequence = rows[0].nextval.toString().padStart(4, '0');
  return `PH-${new Date().getUTCFullYear()}-${sequence}`;
}

function buildListFilter(
  query: QueryAdminAppointmentsDto,
): Prisma.AppointmentWhereInput {
  const where: Prisma.AppointmentWhereInput = {};
  if (query.status) {
    where.status = query.status;
  }
  if (query.serviceId) {
    where.serviceId = query.serviceId;
  }
  if (query.from || query.to) {
    where.scheduledAt = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lt: new Date(query.to) } : {}),
    };
  }
  if (query.search) {
    where.patient = {
      is: {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
        ],
      },
    };
  }
  return where;
}

/**
 * `priceCharged` is the only pricing figure this milestone's schema persists
 * (TRD §4.5); the original price and discount are derived from the service's
 * *current* price at read time. If a service's price changes after a booking,
 * a historical detail view's discount breakdown will drift from what was
 * actually charged — `priceCharged` itself always stays correct. Documented
 * limitation rather than an extra schema column for a figure the create
 * response can compute in-flight without persisting it.
 */
function discountAmountOf(
  appointment: AppointmentWithRelations,
): Prisma.Decimal {
  return appointment.service.price.minus(appointment.priceCharged);
}

function toBookingResponseDto(
  appointment: AppointmentWithRelations,
  discountAmount: Prisma.Decimal,
): AppointmentResponseDto {
  const endsAt = new Date(
    appointment.scheduledAt.getTime() +
      appointment.service.durationMinutes * 60_000,
  );
  return {
    id: appointment.id,
    reference: appointment.reference,
    startsAt: appointment.scheduledAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: appointment.status,
    service: {
      id: appointment.service.id,
      name: appointment.service.name,
      durationMinutes: appointment.service.durationMinutes,
    },
    patient: {
      id: appointment.patient.id,
      name: appointment.patient.name,
      phone: appointment.patient.phone,
    },
    pricing: {
      originalPrice: appointment.service.price.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      priceCharged: appointment.priceCharged.toFixed(2),
    },
    paymentStatus: appointment.paymentStatus,
  };
}

function toListItemDto(
  appointment: AppointmentWithRelations,
): AdminAppointmentListItemDto {
  const endsAt = new Date(
    appointment.scheduledAt.getTime() +
      appointment.service.durationMinutes * 60_000,
  );
  return {
    id: appointment.id,
    reference: appointment.reference,
    startsAt: appointment.scheduledAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: appointment.status,
    service: {
      id: appointment.service.id,
      name: appointment.service.name,
      durationMinutes: appointment.service.durationMinutes,
    },
    patient: {
      id: appointment.patient.id,
      name: appointment.patient.name,
      phone: appointment.patient.phone,
      email: appointment.patient.email,
    },
    priceCharged: appointment.priceCharged.toFixed(2),
    paymentStatus: appointment.paymentStatus,
    bookingSource: appointment.bookingSource,
  };
}

function toDetailDto(
  appointment: AppointmentWithRelations,
): AdminAppointmentDetailDto {
  return {
    ...toListItemDto(appointment),
    originalPrice: appointment.service.price.toFixed(2),
    discountAmount: discountAmountOf(appointment).toFixed(2),
    couponCode: appointment.coupon?.code ?? null,
    reasonForVisit: appointment.reasonForVisit,
    paymentPreference: appointment.paymentPreference,
    cancellationReason: appointment.cancellationReason,
    cancelledBy: appointment.cancelledBy
      ? { id: appointment.cancelledBy.id, name: appointment.cancelledBy.name }
      : null,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}
