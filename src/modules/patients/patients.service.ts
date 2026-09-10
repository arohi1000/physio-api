import { Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  FollowUpStatus,
  type Patient,
  PatientSource,
  type Prisma,
} from '@prisma/client';
import {
  PatientNotFoundException,
  PatientPhoneTakenException,
} from '../../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import type { PrismaTransactionClient } from '../prisma/prisma.service';
import type { CreatePatientDto } from './dto/create-patient.dto';
import type {
  PaginatedPatientsDto,
  PatientListItemDto,
} from './dto/patient-list-item.dto';
import { PatientDetailDto } from './dto/patient-detail.dto';
import type { QueryPatientsDto } from './dto/query-patients.dto';
import type {
  TimelineAppointmentItemDto,
  TimelineFollowUpItemDto,
  TimelineItemDto,
  TimelinePrescriptionItemDto,
  TimelineReceiptItemDto,
} from './dto/timeline-item.dto';
import type { UpdatePatientDto } from './dto/update-patient.dto';

export interface FindOrCreatePatientInput {
  readonly name: string;
  readonly phone: string;
  readonly email: string | null;
  readonly source: PatientSource;
}

/**
 * Owns the `patients` table. `findOrCreateByPhone`/`stampConsent` back the
 * booking transaction (M2-CONTRACT.md §2 — phone is the patient identity
 * key); everything else is Milestone 3 CRUD and the history aggregate
 * (M3-CONTRACT.md §3, §4).
 *
 * M3-CONTRACT.md §2.1: every write that targets a patient by route-param id
 * reads it through the filtered client first, confirms it exists and is not
 * soft-deleted, and only then writes — the soft-delete extension cannot scope
 * a single-row `update`/`delete`, so skipping the read would silently
 * resurrect and edit a deleted record.
 */
@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * An existing patient's name/source are left untouched — a later guest
   * booking under the same number should not silently overwrite a record the
   * clinic may since have corrected. A missing email is backfilled, since
   * that can only ever add information, never contradict it.
   */
  async findOrCreateByPhone(
    tx: PrismaTransactionClient,
    input: FindOrCreatePatientInput,
  ): Promise<Patient> {
    const normalizedPhone = normalizePhone(input.phone);
    const existing = await tx.patient.findFirst({
      where: { phone: normalizedPhone, deletedAt: null },
    });

    if (existing) {
      if (!existing.email && input.email) {
        return tx.patient.update({
          where: { id: existing.id },
          data: { email: input.email },
        });
      }
      return existing;
    }

    return tx.patient.create({
      data: {
        name: input.name,
        phone: normalizedPhone,
        email: input.email,
        source: input.source,
      },
    });
  }

  async stampConsent(
    tx: PrismaTransactionClient,
    patientId: string,
  ): Promise<void> {
    await tx.patient.update({
      where: { id: patientId },
      data: { consentGivenAt: new Date() },
    });
  }

  /** Search across name, phone and email, paginated (M3-CONTRACT.md §3). */
  async search(query: QueryPatientsDto): Promise<PaginatedPatientsDto> {
    const where = buildSearchFilter(query.search);

    const [rows, total] = await Promise.all([
      this.prisma.db.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.db.patient.count({ where }),
    ]);

    const summaries = await this.computeSummaries(rows.map((row) => row.id));

    return {
      data: rows.map((row) => toListItemDto(row, summaries.get(row.id))),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async create(
    dto: CreatePatientDto,
    createdByUserId: string,
  ): Promise<PatientDetailDto> {
    const normalizedPhone = normalizePhone(dto.phone);
    await this.assertPhoneAvailable(normalizedPhone);

    const created = await this.prisma.db.patient.create({
      data: {
        name: dto.name,
        phone: normalizedPhone,
        email: dto.email ?? null,
        dob: dto.dob ? new Date(dto.dob) : null,
        gender: dto.gender ?? null,
        notes: dto.notes ?? null,
        source: PatientSource.manual,
        createdByUserId,
        consentGivenAt: dto.consentGiven ? new Date() : null,
      },
    });

    return this.getAggregate(created.id);
  }

  /** Full history aggregate — appointments, follow-ups, prescriptions and
   * receipts merged into one newest-first timeline (M3-CONTRACT.md §4). */
  async getAggregate(id: string): Promise<PatientDetailDto> {
    const patient = await this.assertLiveOrThrow(id);

    const [appointments, followUps, prescriptions, receipts] =
      await Promise.all([
        this.prisma.db.appointment.findMany({
          where: { patientId: id },
          include: { service: true },
        }),
        this.prisma.db.followUp.findMany({ where: { patientId: id } }),
        this.prisma.db.prescription.findMany({ where: { patientId: id } }),
        this.prisma.db.receipt.findMany({ where: { patientId: id } }),
      ]);

    const timeline: TimelineItemDto[] = [
      ...appointments.map((appointment): TimelineAppointmentItemDto => ({
        kind: 'appointment',
        id: appointment.id,
        at: appointment.scheduledAt.toISOString(),
        status: appointment.status,
        serviceName: appointment.service.name,
        reference: appointment.reference,
      })),
      ...followUps.map((followUp): TimelineFollowUpItemDto => ({
        kind: 'follow_up',
        id: followUp.id,
        at: followUp.createdAt.toISOString(),
        status: followUp.status,
        purpose: followUp.purpose,
        revisitTargetDate: followUp.revisitTargetDate
          .toISOString()
          .slice(0, 10),
      })),
      ...prescriptions.map((prescription): TimelinePrescriptionItemDto => ({
        kind: 'prescription',
        id: prescription.id,
        at: prescription.issuedAt.toISOString(),
        summary: summarizePrescription(prescription.content),
      })),
      ...receipts.map((receipt): TimelineReceiptItemDto => ({
        kind: 'receipt',
        id: receipt.id,
        number: receipt.number,
        at: receipt.issuedAt.toISOString(),
        amount: receipt.amount.toFixed(2),
        paymentMethod: receipt.paymentMethod,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    return toDetailDto(patient, timeline);
  }

  async update(id: string, dto: UpdatePatientDto): Promise<PatientDetailDto> {
    // §2.1: read through the filtered client first — a soft-deleted patient
    // must 404 here, never be silently resurrected by the write below.
    const existing = await this.assertLiveOrThrow(id);

    let normalizedPhone: string | undefined;
    if (dto.phone !== undefined) {
      normalizedPhone = normalizePhone(dto.phone);
      if (normalizedPhone !== existing.phone) {
        await this.assertPhoneAvailable(normalizedPhone, id);
      }
    }

    const data: Prisma.PatientUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (normalizedPhone !== undefined) data.phone = normalizedPhone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.dob !== undefined) data.dob = dto.dob ? new Date(dto.dob) : null;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.consentGiven === true) data.consentGivenAt = new Date();

    await this.prisma.db.patient.update({ where: { id }, data });

    return this.getAggregate(id);
  }

  /** Soft delete — `doctor_admin` only, enforced by `@Roles` on the route. */
  async softDelete(id: string): Promise<void> {
    await this.assertLiveOrThrow(id);
    await this.prisma.db.patient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * The read-first half of the §2.1 pattern, shared with the follow-ups,
   * prescriptions and receipts services: confirms a patient exists and is
   * not soft-deleted before any child record is written under it.
   */
  async assertLiveOrThrow(id: string): Promise<Patient> {
    const patient = await this.prisma.db.patient.findUnique({ where: { id } });
    if (!patient) {
      throw new PatientNotFoundException();
    }
    return patient;
  }

  private async assertPhoneAvailable(
    normalizedPhone: string,
    excludePatientId?: string,
  ): Promise<void> {
    const conflict = await this.prisma.db.patient.findFirst({
      where: {
        phone: normalizedPhone,
        ...(excludePatientId ? { id: { not: excludePatientId } } : {}),
      },
    });
    if (conflict) {
      throw new PatientPhoneTakenException();
    }
  }

  private async computeSummaries(
    patientIds: string[],
  ): Promise<Map<string, PatientSummary>> {
    if (patientIds.length === 0) {
      return new Map();
    }

    const now = new Date();
    const [appointments, followUps] = await Promise.all([
      this.prisma.db.appointment.findMany({
        where: { patientId: { in: patientIds } },
        select: { patientId: true, scheduledAt: true, status: true },
      }),
      this.prisma.db.followUp.findMany({
        where: {
          patientId: { in: patientIds },
          status: FollowUpStatus.scheduled,
        },
        select: { patientId: true, revisitTargetDate: true },
      }),
    ]);

    const summaries = new Map<string, PatientSummary>();
    const ensure = (patientId: string): PatientSummary => {
      let summary = summaries.get(patientId);
      if (!summary) {
        summary = {
          lastVisitAt: null,
          nextAppointmentAt: null,
          followUpDueAt: null,
        };
        summaries.set(patientId, summary);
      }
      return summary;
    };

    for (const appointment of appointments) {
      const summary = ensure(appointment.patientId);
      if (
        appointment.status === AppointmentStatus.completed &&
        (summary.lastVisitAt === null ||
          appointment.scheduledAt > summary.lastVisitAt)
      ) {
        summary.lastVisitAt = appointment.scheduledAt;
      }
      if (
        appointment.status === AppointmentStatus.booked &&
        appointment.scheduledAt > now &&
        (summary.nextAppointmentAt === null ||
          appointment.scheduledAt < summary.nextAppointmentAt)
      ) {
        summary.nextAppointmentAt = appointment.scheduledAt;
      }
    }

    for (const followUp of followUps) {
      const summary = ensure(followUp.patientId);
      if (
        summary.followUpDueAt === null ||
        followUp.revisitTargetDate < summary.followUpDueAt
      ) {
        summary.followUpDueAt = followUp.revisitTargetDate;
      }
    }

    return summaries;
  }
}

interface PatientSummary {
  lastVisitAt: Date | null;
  nextAppointmentAt: Date | null;
  followUpDueAt: Date | null;
}

/** Strips whitespace and separators so equivalent numbers share one record. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}

function buildSearchFilter(search?: string): Prisma.PatientWhereInput {
  if (!search) {
    return {};
  }
  return {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ],
  };
}

function summarizePrescription(content: unknown): string {
  const parsed = content as {
    medicines?: unknown[];
    exercises?: unknown[];
  } | null;
  const medicineCount = parsed?.medicines?.length ?? 0;
  const exerciseCount = parsed?.exercises?.length ?? 0;
  return `${medicineCount} medicine${medicineCount === 1 ? '' : 's'}, ${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'}`;
}

function toListItemDto(
  patient: Patient,
  summary: PatientSummary | undefined,
): PatientListItemDto {
  return {
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
    lastVisitAt: summary?.lastVisitAt?.toISOString() ?? null,
    nextAppointmentAt: summary?.nextAppointmentAt?.toISOString() ?? null,
    followUpDueAt: summary?.followUpDueAt?.toISOString().slice(0, 10) ?? null,
  };
}

function toDetailDto(
  patient: Patient,
  timeline: TimelineItemDto[],
): PatientDetailDto {
  return {
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
    dob: patient.dob ? patient.dob.toISOString().slice(0, 10) : null,
    gender: patient.gender,
    source: patient.source,
    notes: patient.notes,
    consentGivenAt: patient.consentGivenAt?.toISOString() ?? null,
    createdAt: patient.createdAt.toISOString(),
    timeline,
  };
}
