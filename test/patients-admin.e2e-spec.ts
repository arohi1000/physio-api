import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { createE2eApp, createTestUser, destroyE2eApp } from './support/e2e-app';

const SUITE = randomUUID().slice(0, 8);
const DOCTOR_EMAIL = `patients.doctor.${SUITE}@physio.test`;
const STAFF_EMAIL = `patients.staff.${SUITE}@physio.test`;

function freshPhone(): string {
  return `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

describe('Admin patients CRUD, soft-delete and RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let doctorToken: string;
  let staffToken: string;

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
  });

  afterAll(async () => {
    // Patients created through the admin API carry `createdByUserId`, and audit
    // rows reference the actor, so both must go before the throwaway users. A
    // constraint error here would throw before `destroyE2eApp` and leave Jest
    // unable to exit — the failure looks like a hang, not a test failure.
    const users = await prisma.user.findMany({
      where: { email: { in: [DOCTOR_EMAIL, STAFF_EMAIL] } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    const patients = await prisma.patient.findMany({
      where: { createdByUserId: { in: userIds } },
      select: { id: true },
    });
    const patientIds = patients.map((patient) => patient.id);

    await prisma.followUp.deleteMany({
      where: { patientId: { in: patientIds } },
    });
    await prisma.prescription.deleteMany({
      where: { patientId: { in: patientIds } },
    });
    await prisma.receipt.deleteMany({
      where: { patientId: { in: patientIds } },
    });
    await prisma.appointment.deleteMany({
      where: { patientId: { in: patientIds } },
    });
    await prisma.patient.deleteMany({ where: { id: { in: patientIds } } });
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

  it('creates a walk-in patient and returns the documented detail shape', async () => {
    const phone = freshPhone();
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/patients')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Walk-in Patient', phone, email: null, gender: 'female' })
      .expect(201);

    expect(response.body).toMatchObject({
      name: 'Walk-in Patient',
      phone,
      email: null,
      gender: 'female',
      source: 'manual',
      notes: null,
      timeline: [],
    });
    expect(response.body.id).toEqual(expect.any(String));
  });

  it('rejects a duplicate phone number with PATIENT_PHONE_TAKEN', async () => {
    const phone = freshPhone();
    await request(app.getHttpServer())
      .post('/api/v1/admin/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ name: 'First Holder', phone })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ name: 'Second Holder', phone })
      .expect(409);

    expect(response.body).toMatchObject({ code: 'PATIENT_PHONE_TAKEN' });
  });

  it('finds a created patient by search', async () => {
    const phone = freshPhone();
    const name = `Searchable ${SUITE}`;
    await request(app.getHttpServer())
      .post('/api/v1/admin/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ name, phone })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/patients')
      .query({ search: name })
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ name, phone });
  });

  it('updates a patient', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ name: 'Before Update', phone: freshPhone() })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/patients/${created.body.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ name: 'After Update', notes: 'Prefers evening slots' })
      .expect(200);

    expect(updated.body).toMatchObject({
      name: 'After Update',
      notes: 'Prefers evening slots',
    });
  });

  it('403s a staff token deleting a patient, 204s a doctor_admin token', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ name: 'Deletion Candidate', phone: freshPhone() })
      .expect(201);

    const staffAttempt = await request(app.getHttpServer())
      .delete(`/api/v1/admin/patients/${created.body.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
    expect(staffAttempt.body).toMatchObject({
      statusCode: 403,
      message: 'Your role does not permit access to this resource',
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/patients/${created.body.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(204);
  });

  describe('soft-delete gap (M3-CONTRACT.md §2.1)', () => {
    let deletedPatientId: string;
    let deletedPatientName: string;

    beforeAll(async () => {
      deletedPatientName = `Soft Deleted ${SUITE}`;
      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/patients')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ name: deletedPatientName, phone: freshPhone() })
        .expect(201);
      deletedPatientId = created.body.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/admin/patients/${deletedPatientId}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(204);
    });

    it('404s GET /admin/patients/:id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/patients/${deletedPatientId}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(404);
      expect(response.body).toMatchObject({ code: 'PATIENT_NOT_FOUND' });
    });

    it('404s PATCH /admin/patients/:id rather than silently resurrecting it', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/admin/patients/${deletedPatientId}`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ name: 'Attempted Resurrection' })
        .expect(404);
      expect(response.body).toMatchObject({ code: 'PATIENT_NOT_FOUND' });

      // The record must still be deleted afterwards — the failed PATCH must
      // not have written through despite the 404.
      const stillDeleted = await prisma.patient.findFirst({
        where: { id: deletedPatientId },
      });
      expect(stillDeleted?.deletedAt).not.toBeNull();
      expect(stillDeleted?.name).toBe(deletedPatientName);
    });

    it('404s document creation under a soft-deleted patient', async () => {
      const followUp = await request(app.getHttpServer())
        .post(`/api/v1/admin/patients/${deletedPatientId}/follow-ups`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          purpose: 'Should not be created',
          revisitTargetDate: '2099-01-01',
        })
        .expect(404);
      expect(followUp.body).toMatchObject({ code: 'PATIENT_NOT_FOUND' });

      const prescription = await request(app.getHttpServer())
        .post(`/api/v1/admin/patients/${deletedPatientId}/prescriptions`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ medicines: [], exercises: [], instructions: 'None' })
        .expect(404);
      expect(prescription.body).toMatchObject({ code: 'PATIENT_NOT_FOUND' });

      const receipt = await request(app.getHttpServer())
        .post(`/api/v1/admin/patients/${deletedPatientId}/receipts`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ amount: '500.00', paymentMethod: 'cash' })
        .expect(404);
      expect(receipt.body).toMatchObject({ code: 'PATIENT_NOT_FOUND' });
    });

    it('vanishes from search', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/patients')
        .query({ search: deletedPatientName })
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });
});
