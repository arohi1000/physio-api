import { randomUUID } from 'node:crypto';
import { PrismaClient, PatientSource } from '@prisma/client';
import { softDeleteExtension } from '../src/modules/prisma/soft-delete.extension';

/**
 * The soft-delete client extension, against a real database. A unit test with a
 * mocked client would only prove the extension calls itself.
 */
describe('Soft-delete filtering (e2e)', () => {
  const base = new PrismaClient();
  const db = base.$extends(softDeleteExtension);

  const suite = randomUUID().slice(0, 8);
  const livePhone = `+9199${suite}1`;
  const deletedPhone = `+9199${suite}2`;
  let livePatientId: string;
  let deletedPatientId: string;

  beforeAll(async () => {
    const live = await base.patient.create({
      data: {
        name: `Live ${suite}`,
        phone: livePhone,
        source: PatientSource.manual,
      },
    });
    const deleted = await base.patient.create({
      data: {
        name: `Deleted ${suite}`,
        phone: deletedPhone,
        source: PatientSource.manual,
        deletedAt: new Date(),
      },
    });
    livePatientId = live.id;
    deletedPatientId = deleted.id;
  });

  afterAll(async () => {
    await base.patient.deleteMany({
      where: { id: { in: [livePatientId, deletedPatientId] } },
    });
    await base.$disconnect();
  });

  it('hides soft-deleted rows from findMany', async () => {
    const rows = await db.patient.findMany({
      where: { phone: { in: [livePhone, deletedPhone] } },
    });

    expect(rows.map((row) => row.id)).toEqual([livePatientId]);
  });

  it('hides them from findFirst', async () => {
    await expect(
      db.patient.findFirst({ where: { phone: deletedPhone } }),
    ).resolves.toBeNull();
  });

  it('hides them from findUnique by primary key', async () => {
    await expect(
      db.patient.findUnique({ where: { id: deletedPatientId } }),
    ).resolves.toBeNull();
    await expect(
      db.patient.findUnique({ where: { id: livePatientId } }),
    ).resolves.toMatchObject({ id: livePatientId });
  });

  it('throws from findUniqueOrThrow for a soft-deleted row', async () => {
    await expect(
      db.patient.findUniqueOrThrow({ where: { id: deletedPatientId } }),
    ).rejects.toMatchObject({ code: 'P2025' });
  });

  it('excludes them from count', async () => {
    await expect(
      db.patient.count({ where: { phone: { in: [livePhone, deletedPhone] } } }),
    ).resolves.toBe(1);
  });

  it('does not filter models without a deleted_at column', async () => {
    await expect(db.user.count()).resolves.toBeGreaterThanOrEqual(0);
    await expect(db.service.findMany()).resolves.toBeInstanceOf(Array);
  });

  it('still sees them through the unextended escape-hatch client', async () => {
    await expect(
      base.patient.findUnique({ where: { id: deletedPatientId } }),
    ).resolves.toMatchObject({ id: deletedPatientId });
  });
});
