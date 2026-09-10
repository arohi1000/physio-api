import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, type Receipt } from '@prisma/client';
import {
  DocumentNotFoundException,
  ReceiptAmountInvalidException,
} from '../../common/exceptions/app.exception';
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
import type { CreateReceiptDto } from './dto/create-receipt.dto';
import type { ReceiptDetailDto } from './dto/receipt-detail.dto';

const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Owns the `receipts` table and its PDF, mirroring
 * {@link PrescriptionsService}. `amount` prefills from the linked
 * appointment's `priceCharged` when the request omits it (M3-CONTRACT.md
 * §4); either way, a non-positive amount is rejected.
 */
@Injectable()
export class ReceiptsService {
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
    dto: CreateReceiptDto,
    issuedByUserId: string,
  ): Promise<ReceiptDetailDto> {
    const patient = await this.patientsService.assertLiveOrThrow(patientId);

    const appointment = dto.appointmentId
      ? await this.assertAppointmentExists(dto.appointmentId)
      : null;

    const amount = dto.amount ?? appointment?.priceCharged.toFixed(2);
    if (amount === undefined || Number(amount) <= 0) {
      throw new ReceiptAmountInvalidException();
    }

    const created = await this.prisma.db.receipt.create({
      data: {
        number: await this.nextReceiptNumber(),
        patientId,
        appointmentId: dto.appointmentId ?? null,
        amount,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes ?? null,
        issuedByUserId,
      },
    });

    const issuer = await this.resolveIssuer(issuedByUserId);
    const settings = await this.clinicSettingsService.getWorkingHours();
    const pdfBuffer = await this.pdfRenderer.renderReceipt({
      doctorName: issuer.displayName,
      doctorCredentials: issuer.credentials,
      patientName: patient.name,
      issuedAtDisplay: formatDisplayDate(created.issuedAt, settings.timezone),
      receiptReference: created.number,
      amount: created.amount.toFixed(2),
      paymentMethod: created.paymentMethod,
      appointmentReference: appointment?.reference ?? null,
    });

    const storageKey = `receipts/${created.id}.pdf`;
    await this.storage.put(storageKey, pdfBuffer, 'application/pdf');

    const withPdf = await this.prisma.db.receipt.update({
      where: { id: created.id },
      data: { pdfStorageKey: storageKey },
    });

    return toDetailDto(withPdf);
  }

  async getById(id: string): Promise<ReceiptDetailDto> {
    const receipt = await this.assertLiveOrThrow(id);
    return toDetailDto(receipt);
  }

  async getPdfUrl(id: string): Promise<{ url: string; expiresAt: string }> {
    const receipt = await this.assertLiveOrThrow(id);
    if (!receipt.pdfStorageKey) {
      throw new DocumentNotFoundException('This receipt has no PDF yet.');
    }
    const url = await this.storage.getSignedUrl(
      receipt.pdfStorageKey,
      SIGNED_URL_TTL_SECONDS,
    );
    return {
      url,
      expiresAt: new Date(
        Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
      ).toISOString(),
    };
  }

  private async assertLiveOrThrow(id: string): Promise<Receipt> {
    const receipt = await this.prisma.db.receipt.findUnique({ where: { id } });
    if (!receipt) {
      throw new DocumentNotFoundException();
    }
    return receipt;
  }

  private async assertAppointmentExists(appointmentId: string) {
    const appointment = await this.prisma.db.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  /**
   * Sequence increments are atomic under concurrent access and survive a rolled
   * back transaction, so two receipts issued at the same instant cannot collide
   * — unlike any scheme derived from counting existing rows.
   */
  private async nextReceiptNumber(): Promise<string> {
    const rows = await this.prisma.db.$queryRaw<
      { nextval: bigint }[]
    >`SELECT nextval('receipt_number_seq') AS nextval`;
    const sequence = rows[0].nextval.toString().padStart(4, '0');
    return `RCP-${new Date().getUTCFullYear()}-${sequence}`;
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

function toDetailDto(receipt: Receipt): ReceiptDetailDto {
  return {
    id: receipt.id,
    number: receipt.number,
    patientId: receipt.patientId,
    appointmentId: receipt.appointmentId,
    amount: receipt.amount.toFixed(2),
    paymentMethod: receipt.paymentMethod,
    notes: receipt.notes,
    issuedAt: receipt.issuedAt.toISOString(),
  };
}
