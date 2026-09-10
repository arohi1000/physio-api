import { Injectable } from '@nestjs/common';
import type { Patient } from '@prisma/client';
import { PatientSource } from '@prisma/client';
import type { PrismaTransactionClient } from '../prisma/prisma.service';

export interface FindOrCreatePatientInput {
  readonly name: string;
  readonly phone: string;
  readonly email: string | null;
  readonly source: PatientSource;
}

/**
 * Owns the `patients` table for M2's needs — find-or-create by phone, the
 * identity key M2-CONTRACT.md §2 fixes ("same number booking twice is the
 * same patient"). Full patient CRUD (search, manual add, edit, soft delete)
 * is Milestone 3 scope; building it now would be building ahead.
 *
 * Every method takes the caller's transaction client rather than owning a
 * `PrismaService` of its own — both operations here only ever run as part of
 * the booking transaction, so the patient row and the appointment it is
 * attached to commit or roll back together.
 */
@Injectable()
export class PatientsService {
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
}

/** Strips whitespace and separators so equivalent numbers share one record. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '');
}
