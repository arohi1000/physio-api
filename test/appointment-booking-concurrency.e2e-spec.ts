import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  bookingPayload,
  nextWorkingMonday,
  slotStartsAt,
} from './support/booking-fixtures';
import { createE2eApp, destroyE2eApp } from './support/e2e-app';

/**
 * The milestone's non-negotiable gate (M2-CONTRACT.md §5.1): two genuinely
 * parallel `POST /appointments` for the same slot must yield exactly one 201
 * and one 409 `SLOT_UNAVAILABLE`, and exactly one row must exist afterwards.
 * Fired with `Promise.all` over two independent `supertest` requests against
 * the real, dockerized Postgres — not sequential calls, not mocked.
 */
describe('Booking concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let serviceId: string;
  let startsAt: string;

  beforeAll(async () => {
    const context = await createE2eApp();
    app = context.app;
    prisma = context.prisma;

    const service = await prisma.service.findFirstOrThrow({
      where: { name: 'Manual Therapy Session' },
    });
    serviceId = service.id;
    startsAt = slotStartsAt(nextWorkingMonday(), '09:00');
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({
      where: { scheduledAt: new Date(startsAt) },
    });
    await destroyE2eApp({ app, prisma });
  });

  it('two concurrent bookings for the same slot produce exactly one 201 and one 409', async () => {
    const server = app.getHttpServer();

    const [responseA, responseB] = await Promise.all([
      request(server)
        .post('/api/v1/appointments')
        .send(bookingPayload({ serviceId, startsAt, name: 'Concurrency A' })),
      request(server)
        .post('/api/v1/appointments')
        .send(bookingPayload({ serviceId, startsAt, name: 'Concurrency B' })),
    ]);

    const statuses = [responseA.status, responseB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const winner = responseA.status === 201 ? responseA : responseB;
    const loser = responseA.status === 409 ? responseA : responseB;

    expect(winner.body).toMatchObject({
      status: 'booked',
      startsAt,
    });
    expect(loser.body).toMatchObject({ code: 'SLOT_UNAVAILABLE' });

    const rows = await prisma.appointment.findMany({
      where: { scheduledAt: new Date(startsAt) },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('booked');
  });
});
