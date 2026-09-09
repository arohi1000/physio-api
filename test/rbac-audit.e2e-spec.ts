import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { AuditedFixtureController } from './support/audited-fixture.controller';
import { createE2eApp, createTestUser, destroyE2eApp } from './support/e2e-app';

const SUITE = randomUUID().slice(0, 8);
const DOCTOR_EMAIL = `rbac.doctor.${SUITE}@physio.test`;
const STAFF_EMAIL = `rbac.staff.${SUITE}@physio.test`;

describe('RBAC and audit logging (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let doctorToken: string;
  let staffToken: string;
  let doctorId: string;

  beforeAll(async () => {
    const context = await createE2eApp([AuditedFixtureController]);
    app = context.app;
    prisma = context.prisma;

    const doctor = await createTestUser(prisma, {
      email: DOCTOR_EMAIL,
      role: UserRole.doctor_admin,
    });
    doctorId = doctor.id;
    await createTestUser(prisma, {
      email: STAFF_EMAIL,
      role: UserRole.staff,
    });

    doctorToken = await signIn(DOCTOR_EMAIL);
    staffToken = await signIn(STAFF_EMAIL);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: doctorId } });
    await prisma.user.deleteMany({
      where: { email: { in: [DOCTOR_EMAIL, STAFF_EMAIL] } },
    });
    await destroyE2eApp({ app, prisma });
  });

  async function signIn(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/dev-login')
      .send({ email })
      .expect(200);
    return response.body.accessToken;
  }

  describe('RolesGuard on GET /admin/audit-logs', () => {
    it('rejects a staff token with 403', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);

      expect(response.body).toMatchObject({
        statusCode: 403,
        message: 'Your role does not permit access to this resource',
      });
    });

    it('rejects an unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .expect(401);
    });

    it('allows a doctor_admin token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        items: expect.any(Array),
        total: expect.any(Number),
        page: 1,
        pageSize: 50,
      });
    });
  });

  describe('AuditLogInterceptor', () => {
    it('writes a row naming the actor, action and entity for a mutation', async () => {
      const mutation = await request(app.getHttpServer())
        .post('/api/v1/admin/patients')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({})
        .expect(201);

      const entityId: string = mutation.body.id;
      const row = await prisma.auditLog.findFirst({
        where: { entityId },
      });

      expect(row).toMatchObject({
        userId: doctorId,
        action: 'patient.create',
        entityType: 'patient',
        entityId,
      });
      expect(row?.ipAddress).toBeTruthy();
      expect(row?.metadata).toEqual({
        before: null,
        after: { name: 'Fixture Patient', phone: '+910000000000' },
      });
    });

    it('exposes that row through the activity log, filtered', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/patients')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({})
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .query({
          entityType: 'patient',
          action: 'patient.create',
          userId: doctorId,
        })
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(response.body.total).toBeGreaterThan(0);
      expect(response.body.items[0]).toMatchObject({
        action: 'patient.create',
        entityType: 'patient',
        actor: { id: doctorId, email: DOCTOR_EMAIL },
      });
    });

    it('does not audit reads', async () => {
      const before = await prisma.auditLog.count({
        where: { userId: doctorId },
      });

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(200);

      expect(await prisma.auditLog.count({ where: { userId: doctorId } })).toBe(
        before,
      );
    });
  });
});
