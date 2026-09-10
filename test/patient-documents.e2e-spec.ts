import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { zonedWallClockToUtc } from '../src/modules/availability/timezone.util';
import { createE2eApp, createTestUser, destroyE2eApp } from './support/e2e-app';

const SUITE = randomUUID().slice(0, 8);
const DOCTOR_EMAIL = `docs.doctor.${SUITE}@physio.test`;
const STAFF_EMAIL = `docs.staff.${SUITE}@physio.test`;

function freshPhone(): string {
  return `+9197${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

function dateOffsetFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function subtractDaysStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  instant.setUTCDate(instant.getUTCDate() - days);
  return instant.toISOString().slice(0, 10);
}

/** `PDF-1.` magic bytes — proof the downloaded body is actually a PDF, not
 * an error page or empty buffer. */
function assertIsPdf(body: Buffer): void {
  expect(body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
}

describe('Follow-ups, prescriptions, receipts and PDFs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let doctorToken: string;
  let staffToken: string;
  let patientId: string;
  let timezone: string;
  let leadDays: number;

  beforeAll(async () => {
    const context = await createE2eApp();
    app = context.app;
    prisma = context.prisma;

    await createTestUser(prisma, {
      email: DOCTOR_EMAIL,
      role: UserRole.doctor_admin,
    });
    await createTestUser(prisma, { email: STAFF_EMAIL, role: UserRole.staff });
    doctorToken = await signIn(DOCTOR_EMAIL);
    staffToken = await signIn(STAFF_EMAIL);

    const settings = await prisma.clinicSettings.findFirstOrThrow();
    timezone = settings.timezone;
    leadDays = settings.followUpReminderLeadDays;

    const patient = await request(app.getHttpServer())
      .post('/api/v1/admin/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ name: 'Document Fixture Patient', phone: freshPhone() })
      .expect(201);
    patientId = patient.body.id;
  });

  afterAll(async () => {
    // Order matters: follow-ups, prescriptions and receipts all carry a foreign
    // key to the user who created them, so deleting the throwaway users first
    // raises a constraint error — and because that throws before
    // `destroyE2eApp`, the Prisma and Redis connections stay open and Jest
    // never exits. One bad ordering, two symptoms.
    const users = await prisma.user.findMany({
      where: { email: { in: [DOCTOR_EMAIL, STAFF_EMAIL] } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    await prisma.followUp.deleteMany({ where: { patientId } });
    await prisma.prescription.deleteMany({ where: { patientId } });
    await prisma.receipt.deleteMany({ where: { patientId } });
    await prisma.appointment.deleteMany({ where: { patientId } });
    await prisma.patient.deleteMany({ where: { id: patientId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    await destroyE2eApp({ app, prisma });
  });

  async function signIn(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/dev-login')
      .send({ email })
      .expect(200);
    return response.body.accessToken;
  }

  /** Requests the app instance directly by path+query, ignoring the host
   * encoded in a signed URL — the test server does not listen on
   * PUBLIC_API_BASE_URL's port. */
  async function downloadSignedUrl(url: string) {
    const parsed = new URL(url);
    return request(app.getHttpServer()).get(
      `${parsed.pathname}${parsed.search}`,
    );
  }

  describe('follow-ups', () => {
    it('computes reminderScheduledFor from the target date and lead days, and audits under the follow-up id', async () => {
      const revisitTargetDate = dateOffsetFromNow(20);
      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/patients/${patientId}/follow-ups`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ purpose: 'Review shoulder mobility', revisitTargetDate })
        .expect(201);

      const expectedReminder = zonedWallClockToUtc(
        subtractDaysStr(revisitTargetDate, leadDays),
        '09:00',
        timezone,
      ).toISOString();

      expect(response.body).toMatchObject({
        patientId,
        purpose: 'Review shoulder mobility',
        revisitTargetDate,
        reminderScheduledFor: expectedReminder,
        status: 'scheduled',
      });

      // The audit row's entityId must be the follow-up's own id, not the
      // patient id from the route — the interceptor's fallback previously
      // preferred the first matching path segment, which was `patients`.
      const row = await prisma.auditLog.findFirst({
        where: { entityId: response.body.id, action: 'follow_up.create' },
      });
      expect(row).toMatchObject({
        entityType: 'follow_up',
        entityId: response.body.id,
      });
      expect(row?.entityId).not.toBe(patientId);
    });

    it('rejects a past revisitTargetDate with FOLLOW_UP_DATE_IN_PAST', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/admin/patients/${patientId}/follow-ups`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ purpose: 'Too late', revisitTargetDate: dateOffsetFromNow(-5) })
        .expect(422);
      expect(response.body).toMatchObject({ code: 'FOLLOW_UP_DATE_IN_PAST' });
    });

    it('updates status via PATCH and audits the change', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/v1/admin/patients/${patientId}/follow-ups`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          purpose: 'To be dismissed',
          revisitTargetDate: dateOffsetFromNow(15),
        })
        .expect(201);

      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/admin/follow-ups/${created.body.id}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'dismissed' })
        .expect(200);
      expect(updated.body).toMatchObject({ status: 'dismissed' });

      const row = await prisma.auditLog.findFirst({
        where: { entityId: created.body.id, action: 'follow_up.update' },
      });
      expect(row).toMatchObject({ entityType: 'follow_up' });
    });

    it('404s PATCH for an unknown follow-up', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/follow-ups/${randomUUID()}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'dismissed' })
        .expect(404);
      expect(response.body).toMatchObject({ code: 'FOLLOW_UP_NOT_FOUND' });
    });

    it('lists the follow-up queue filtered by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/follow-ups')
        .query({ status: 'dismissed' })
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      expect(
        response.body.data.every(
          (item: { status: string }) => item.status === 'dismissed',
        ),
      ).toBe(true);
    });
  });

  describe('prescriptions', () => {
    it('creates a structured prescription, generates a PDF and serves it via a signed URL', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/v1/admin/patients/${patientId}/prescriptions`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          medicines: [
            {
              name: 'Ibuprofen',
              dose: '400mg',
              frequency: 'twice daily',
              durationDays: 5,
            },
          ],
          exercises: [
            { name: 'Scapular retraction', sets: 3, reps: 12, notes: null },
          ],
          instructions: 'Ice for 10 minutes after each session.',
        })
        .expect(201);

      expect(created.body).toMatchObject({
        patientId,
        medicines: [
          {
            name: 'Ibuprofen',
            dose: '400mg',
            frequency: 'twice daily',
            durationDays: 5,
          },
        ],
        instructions: 'Ice for 10 minutes after each session.',
      });

      const auditRow = await prisma.auditLog.findFirst({
        where: { entityId: created.body.id, action: 'prescription.create' },
      });
      expect(auditRow).toMatchObject({ entityType: 'prescription' });

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/admin/prescriptions/${created.body.id}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      expect(detail.body.id).toBe(created.body.id);

      const pdfUrl = await request(app.getHttpServer())
        .get(`/api/v1/admin/prescriptions/${created.body.id}/pdf`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);
      expect(pdfUrl.body).toMatchObject({
        url: expect.stringContaining('/api/v1/files/download') as unknown,
        expiresAt: expect.any(String) as unknown,
      });

      const download = await downloadSignedUrl(pdfUrl.body.url);
      expect(download.status).toBe(200);
      expect(download.headers['content-type']).toContain('application/pdf');
      assertIsPdf(download.body as Buffer);
    });

    it('404s DOCUMENT_NOT_FOUND for an unknown prescription', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/prescriptions/${randomUUID()}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(404);
      expect(response.body).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
    });
  });

  describe('receipts', () => {
    it('creates a receipt, rejects a non-positive amount, and serves the PDF', async () => {
      const invalid = await request(app.getHttpServer())
        .post(`/api/v1/admin/patients/${patientId}/receipts`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ amount: '0.00', paymentMethod: 'cash' })
        .expect(422);
      expect(invalid.body).toMatchObject({ code: 'RECEIPT_AMOUNT_INVALID' });

      const created = await request(app.getHttpServer())
        .post(`/api/v1/admin/patients/${patientId}/receipts`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          amount: '1000.00',
          paymentMethod: 'cash',
          notes: 'Paid in full',
        })
        .expect(201);

      expect(created.body).toMatchObject({
        patientId,
        amount: '1000.00',
        paymentMethod: 'cash',
        notes: 'Paid in full',
      });

      const pdfUrl = await request(app.getHttpServer())
        .get(`/api/v1/admin/receipts/${created.body.id}/pdf`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const download = await downloadSignedUrl(pdfUrl.body.url);
      expect(download.status).toBe(200);
      assertIsPdf(download.body as Buffer);
    });

    it('prefills amount from the linked appointment priceCharged when omitted', async () => {
      const service = await prisma.service.findFirstOrThrow({
        where: { name: 'Dry Needling' },
      });
      const appointment = await prisma.appointment.create({
        data: {
          reference: `PH-TEST-${randomUUID().slice(0, 8)}`,
          patientId,
          serviceId: service.id,
          scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          status: 'completed',
          bookingSource: 'manual',
          reasonForVisit: 'general_assessment',
          paymentPreference: 'clinic',
          priceCharged: service.price,
          paymentStatus: 'pending',
        },
      });

      const created = await request(app.getHttpServer())
        .post(`/api/v1/admin/patients/${patientId}/receipts`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ paymentMethod: 'card', appointmentId: appointment.id })
        .expect(201);

      expect(created.body).toMatchObject({
        amount: service.price.toFixed(2),
        appointmentId: appointment.id,
      });
    });

    it('404s DOCUMENT_NOT_FOUND for an unknown receipt', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/receipts/${randomUUID()}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(404);
      expect(response.body).toMatchObject({ code: 'DOCUMENT_NOT_FOUND' });
    });
  });

  describe('patient detail aggregate timeline', () => {
    it('merges appointments, follow-ups, prescriptions and receipts newest-first', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/patients/${patientId}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      const kinds = new Set(
        (response.body.timeline as { kind: string }[]).map((item) => item.kind),
      );
      expect(kinds).toEqual(
        new Set(['follow_up', 'prescription', 'receipt', 'appointment']),
      );

      const timestamps = (response.body.timeline as { at: string }[]).map(
        (item) => item.at,
      );
      const sorted = [...timestamps].sort((a, b) => b.localeCompare(a));
      expect(timestamps).toEqual(sorted);
    });
  });
});
