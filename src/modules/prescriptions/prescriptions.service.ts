import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, type Prescription, type Prisma } from '@prisma/client';
import { DocumentNotFoundException } from '../../common/exceptions/app.exception';
import {
  DOCTOR_CREDENTIALS_PLACEHOLDER,
  formatDoctorName,
} from '../../common/pdf/clinic-branding';
import { PdfRendererService } from '../../common/pdf/pdf-renderer.service';
import { localDateOfInstant } from '../availability/timezone.util';
import { ClinicSettingsService } from '../clinic-settings/clinic-settings.service';
import {
  FILE_STORAGE_PROVIDER,
  type FileStorageProvider,
} from '../files/file-storage.provider';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePrescriptionDto } from './dto/create-prescription.dto';
import type { PrescriptionDetailDto } from './dto/prescription-detail.dto';

/** Content shape persisted in `prescriptions.content` (M3-CONTRACT.md §4). */
interface PrescriptionContent {
  readonly medicines: {
    name: string;
    dose: string;
    frequency: string;
    durationDays: number;
  }[];
  readonly exercises: {
    name: string;
    sets: number;
    reps: number;
    notes: string | null;
  }[];
  readonly instructions: string;
}

const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Owns the `prescriptions` table and its PDF. The PDF is rendered once at
 * creation and stored through `FileStorageProvider` (M3-CONTRACT.md §5) —
 * `GET .../pdf` never re-renders, it only issues a fresh signed URL for the
 * bytes already on disk.
 */
@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly clinicSettingsService: ClinicSettingsService,
    private readonly pdfRenderer: PdfRendererService,
    @Inject(FILE_STORAGE_PROVIDER)
    private readonly storage: FileStorageProvider,
  ) {}

  async create(
    patientId: string,
    dto: CreatePrescriptionDto,
    issuedByUserId: string,
  ): Promise<PrescriptionDetailDto> {
    const patient = await this.patientsService.assertLiveOrThrow(patientId);
    if (dto.appointmentId) {
      await this.assertAppointmentExists(dto.appointmentId);
    }

    const content: PrescriptionContent = {
      medicines: dto.medicines,
      exercises: dto.exercises.map((exercise) => ({
        ...exercise,
        notes: exercise.notes ?? null,
      })),
      instructions: dto.instructions,
    };

    const created = await this.prisma.db.prescription.create({
      data: {
        patientId,
        appointmentId: dto.appointmentId ?? null,
        content: content as unknown as Prisma.InputJsonValue,
        issuedByUserId,
      },
    });

    const issuer = await this.resolveIssuer(issuedByUserId);
    const settings = await this.clinicSettingsService.getWorkingHours();
    const pdfBuffer = await this.pdfRenderer.renderPrescription({
      doctorName: issuer.displayName,
      doctorCredentials: issuer.credentials,
      patientName: patient.name,
      issuedAtDisplay: formatDisplayDate(created.issuedAt, settings.timezone),
      medicines: content.medicines,
      exercises: content.exercises,
      instructions: content.instructions,
    });

    const storageKey = `prescriptions/${created.id}.pdf`;
    await this.storage.put(storageKey, pdfBuffer, 'application/pdf');

    const withPdf = await this.prisma.db.prescription.update({
      where: { id: created.id },
      data: { pdfStorageKey: storageKey },
    });

    return toDetailDto(withPdf);
  }

  async getById(id: string): Promise<PrescriptionDetailDto> {
    const prescription = await this.assertLiveOrThrow(id);
    return toDetailDto(prescription);
  }

  async getPdfUrl(id: string): Promise<{ url: string; expiresAt: string }> {
    const prescription = await this.assertLiveOrThrow(id);
    if (!prescription.pdfStorageKey) {
      throw new DocumentNotFoundException('This prescription has no PDF yet.');
    }
    const url = await this.storage.getSignedUrl(
      prescription.pdfStorageKey,
      SIGNED_URL_TTL_SECONDS,
    );
    return {
      url,
      expiresAt: new Date(
        Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
      ).toISOString(),
    };
  }

  private async assertLiveOrThrow(id: string): Promise<Prescription> {
    const prescription = await this.prisma.db.prescription.findUnique({
      where: { id },
    });
    if (!prescription) {
      throw new DocumentNotFoundException();
    }
    return prescription;
  }

  private async assertAppointmentExists(appointmentId: string): Promise<void> {
    const appointment = await this.prisma.db.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
  }

  private async resolveIssuer(
    userId: string,
  ): Promise<{ displayName: string; credentials: string }> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      return {
        displayName: 'Clinic staff',
        credentials: DOCTOR_CREDENTIALS_PLACEHOLDER,
      };
    }
    return user.role === UserRole.doctor_admin
      ? {
          displayName: formatDoctorName(user.name),
          credentials: DOCTOR_CREDENTIALS_PLACEHOLDER,
        }
      : { displayName: user.name, credentials: 'Clinic staff' };
  }
}

function formatDisplayDate(date: Date, timeZone: string): string {
  return `${localDateOfInstant(date, timeZone)} (${timeZone})`;
}

function toDetailDto(prescription: Prescription): PrescriptionDetailDto {
  const content = prescription.content as unknown as PrescriptionContent;
  return {
    id: prescription.id,
    patientId: prescription.patientId,
    appointmentId: prescription.appointmentId,
    medicines: content.medicines,
    exercises: content.exercises,
    instructions: content.instructions,
    issuedAt: prescription.issuedAt.toISOString(),
  };
}
