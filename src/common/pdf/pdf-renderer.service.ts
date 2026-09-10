import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { CLINIC_NAME, CLINIC_TAGLINE } from './clinic-branding';

interface DocumentHeaderInput {
  readonly doctorName: string;
  readonly doctorCredentials: string;
  readonly patientName: string;
  readonly issuedAtDisplay: string;
}

export interface PrescriptionMedicineInput {
  readonly name: string;
  readonly dose: string;
  readonly frequency: string;
  readonly durationDays: number;
}

export interface PrescriptionExerciseInput {
  readonly name: string;
  readonly sets: number;
  readonly reps: number;
  readonly notes: string | null;
}

export interface PrescriptionPdfInput extends DocumentHeaderInput {
  readonly medicines: readonly PrescriptionMedicineInput[];
  readonly exercises: readonly PrescriptionExerciseInput[];
  readonly instructions: string;
}

export interface ReceiptPdfInput extends DocumentHeaderInput {
  readonly receiptReference: string;
  readonly amount: string;
  readonly paymentMethod: string;
  readonly appointmentReference: string | null;
}

/**
 * Server-side PDF layout shared by prescriptions and receipts
 * (M3-CONTRACT.md §5): both carry the clinic header, doctor name and
 * credentials, patient name and issue date. Rendered once at creation, not
 * per download — callers persist the resulting buffer through
 * `FileStorageProvider` and never re-render on `GET .../pdf`.
 *
 * A plain rendering helper rather than an "integration behind an interface":
 * unlike storage or messaging, nothing here is swapped for a mock or a real
 * provider — it is one deterministic layout function, so a second
 * implementation would be speculative.
 */
@Injectable()
export class PdfRendererService {
  renderPrescription(input: PrescriptionPdfInput): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    this.renderHeader(doc, input, 'Prescription');

    doc.moveDown(1.5);
    doc.fontSize(13).font('Helvetica-Bold').text('Medicines');
    doc.moveDown(0.5);
    if (input.medicines.length === 0) {
      doc.fontSize(11).font('Helvetica').text('None prescribed.');
    }
    for (const medicine of input.medicines) {
      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          `• ${medicine.name} — ${medicine.dose}, ${medicine.frequency}, ${medicine.durationDays} day(s)`,
        );
    }

    doc.moveDown(1);
    doc.fontSize(13).font('Helvetica-Bold').text('Exercises');
    doc.moveDown(0.5);
    if (input.exercises.length === 0) {
      doc.fontSize(11).font('Helvetica').text('None prescribed.');
    }
    for (const exercise of input.exercises) {
      const notesSuffix = exercise.notes ? ` — ${exercise.notes}` : '';
      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          `• ${exercise.name} — ${exercise.sets} sets × ${exercise.reps} reps${notesSuffix}`,
        );
    }

    doc.moveDown(1);
    doc.fontSize(13).font('Helvetica-Bold').text('Instructions');
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').text(input.instructions);

    return collectPdfBuffer(doc);
  }

  renderReceipt(input: ReceiptPdfInput): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    this.renderHeader(doc, input, 'Receipt');

    doc.moveDown(1.5);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Receipt No.: ', { continued: true });
    doc.font('Helvetica').text(input.receiptReference);

    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Amount: ', { continued: true });
    doc.font('Helvetica').text(`Rs. ${input.amount}`);

    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Payment method: ', { continued: true });
    doc.font('Helvetica').text(input.paymentMethod);

    if (input.appointmentReference) {
      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text('Appointment: ', { continued: true });
      doc.font('Helvetica').text(input.appointmentReference);
    }

    return collectPdfBuffer(doc);
  }

  private renderHeader(
    doc: PDFKit.PDFDocument,
    input: DocumentHeaderInput,
    documentTitle: string,
  ): void {
    doc.fontSize(18).font('Helvetica-Bold').text(CLINIC_NAME);
    doc.fontSize(10).font('Helvetica').text(CLINIC_TAGLINE);
    doc.moveDown(0.5);
    doc.fontSize(10).text(`${input.doctorName} — ${input.doctorCredentials}`);

    doc.moveDown(1);
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .stroke();
    doc.moveDown(1);

    doc.fontSize(16).font('Helvetica-Bold').text(documentTitle);
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Patient: ', { continued: true });
    doc.font('Helvetica').text(input.patientName);
    doc.fontSize(11).font('Helvetica-Bold').text('Date: ', { continued: true });
    doc.font('Helvetica').text(input.issuedAtDisplay);
  }
}

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error: Error) => reject(error));
    doc.end();
  });
}
