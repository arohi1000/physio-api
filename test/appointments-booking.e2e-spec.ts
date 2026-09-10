import type { INestApplication } from '@nestjs/common';
import { CouponValueType, PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  bookingPayload,
  nextWorkingMonday,
  slotStartsAt,
} from './support/booking-fixtures';
import { createE2eApp, destroyE2eApp } from './support/e2e-app';

const DOCTOR_EMAIL = 'doctor@physioclinic.local';

describe('POST /appointments — booking transaction (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let serviceId: string;
  let servicePrice: string;
  let date: string;
  let doctorToken: string;
  const createdAppointmentSlots: Date[] = [];

  beforeAll(async () => {
    const context = await createE2eApp();
    app = context.app;
    prisma = context.prisma;

    const service = await prisma.service.findFirstOrThrow({
      where: { name: 'Manual Therapy Session' },
    });
    serviceId = service.id;
    servicePrice = service.price.toFixed(2);
    date = nextWorkingMonday(31);

    const signIn = await request(app.getHttpServer())
      .post('/api/v1/auth/dev-login')
      .send({ email: DOCTOR_EMAIL })
      .expect(200);
    doctorToken = signIn.body.accessToken;
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({
      where: { scheduledAt: { in: createdAppointmentSlots } },
    });
    await destroyE2eApp({ app, prisma });
  });

  it('books successfully and returns the documented response shape', async () => {
    const startsAt = slotStartsAt(date, '09:00');
    createdAppointmentSlots.push(new Date(startsAt));

    const response = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(bookingPayload({ serviceId, startsAt, name: 'Asha Kumar' }))
      .expect(201);

    expect(response.body).toMatchObject({
      reference: expect.stringMatching(/^PH-\d{4}-\d{4}$/) as unknown,
      startsAt,
      status: 'booked',
      service: { id: serviceId, durationMinutes: 45 },
      patient: { name: 'Asha Kumar' },
      pricing: {
        originalPrice: servicePrice,
        discountAmount: '0.00',
        priceCharged: servicePrice,
      },
      paymentStatus: 'pending',
    });
  });

  it('rejects a booking without consent as CONSENT_REQUIRED (422)', async () => {
    const startsAt = slotStartsAt(date, '09:45');

    const response = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(bookingPayload({ serviceId, startsAt, consentGiven: false }))
      .expect(422);

    expect(response.body.code).toBe('CONSENT_REQUIRED');

    const row = await prisma.appointment.findFirst({
      where: { scheduledAt: new Date(startsAt) },
    });
    expect(row).toBeNull();
  });

  it('rejects a time outside working hours as SLOT_OUTSIDE_AVAILABILITY (422)', async () => {
    // 22:00 local is well outside every seeded working window.
    const startsAt = slotStartsAt(date, '22:00');

    const response = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(bookingPayload({ serviceId, startsAt }))
      .expect(422);

    expect(response.body.code).toBe('SLOT_OUTSIDE_AVAILABILITY');
  });

  it('rejects a slot in the past, even though it is a valid slot in the weekly pattern', async () => {
    // A Monday 09:00 four weeks ago is a perfectly good slot as far as the slot
    // engine is concerned — the working-hours pattern repeats weekly and the
    // engine is deliberately free of wall-clock coupling. Only the booking
    // service knows about "now", so this asserts that guard exists.
    const pastMonday = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const daysSinceMonday = (pastMonday.getUTCDay() + 6) % 7;
    pastMonday.setUTCDate(pastMonday.getUTCDate() - daysSinceMonday);
    const startsAt = slotStartsAt(
      pastMonday.toISOString().slice(0, 10),
      '09:00',
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(bookingPayload({ serviceId, startsAt }))
      .expect(422);

    expect(response.body.code).toBe('SLOT_OUTSIDE_AVAILABILITY');

    const rows = await prisma.appointment.findMany({
      where: { scheduledAt: new Date(startsAt) },
    });
    expect(rows).toHaveLength(0);
  });

  it('refuses to reschedule an appointment that is no longer booked', async () => {
    // Moving a cancelled appointment would rewrite history silently: the
    // timestamp changes while the status does not, and the partial unique index
    // raises no objection because it only constrains `booked` rows.
    // 16:00 opens the afternoon window, so it is on the 45-minute grid and
    // untouched by the other cases in this file.
    const startsAt = slotStartsAt(date, '16:00');
    createdAppointmentSlots.push(new Date(startsAt));

    const booked = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(bookingPayload({ serviceId, startsAt }))
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/appointments/${booked.body.id}/cancel`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ reason: 'Testing the reschedule guard' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/admin/appointments/${booked.body.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ startsAt: slotStartsAt(date, '16:45') })
      .expect(422);

    expect(response.body.code).toBe('APPOINTMENT_NOT_CANCELLABLE');

    const unchanged = await prisma.appointment.findUniqueOrThrow({
      where: { id: booked.body.id },
    });
    expect(unchanged.scheduledAt.toISOString()).toBe(startsAt);
    expect(unchanged.status).toBe('cancelled');
  });

  it('fails a booking whose coupon has expired, and creates no partial record', async () => {
    const startsAt = slotStartsAt(date, '10:30');
    const code = `EXPIRES-MIDTX-${Date.now()}`;

    // A coupon that was valid when the website's earlier preview call ran but
    // has since expired — exactly the race M2-CONTRACT.md §5.2 requires the
    // in-transaction re-validation to catch.
    await prisma.coupon.create({
      data: {
        code,
        description: 'Expires before the booking transaction runs',
        valueType: CouponValueType.percent,
        value: '10.00',
        validFrom: new Date(Date.now() - 60 * 60 * 1000),
        validUntil: new Date(Date.now() - 1000),
        active: true,
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(bookingPayload({ serviceId, startsAt, couponCode: code }))
      .expect(422);

    expect(response.body.code).toBe('COUPON_EXPIRED');

    const row = await prisma.appointment.findFirst({
      where: { scheduledAt: new Date(startsAt) },
    });
    expect(row).toBeNull();

    await prisma.coupon.delete({ where: { code } });
  });

  it('frees the slot when the appointment is cancelled, so it can be booked again', async () => {
    const startsAt = slotStartsAt(date, '11:15');
    createdAppointmentSlots.push(new Date(startsAt));

    const created = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(bookingPayload({ serviceId, startsAt, name: 'First Patient' }))
      .expect(201);

    // The same slot is taken while the first booking stands.
    const conflict = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(bookingPayload({ serviceId, startsAt, name: 'Second Patient' }))
      .expect(409);
    expect(conflict.body.code).toBe('SLOT_UNAVAILABLE');

    await request(app.getHttpServer())
      .post(`/api/v1/admin/appointments/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ reason: 'Patient requested cancellation' })
      .expect(200);

    const rebooked = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send(bookingPayload({ serviceId, startsAt, name: 'Second Patient' }))
      .expect(201);

    expect(rebooked.body.status).toBe('booked');

    const rows = await prisma.appointment.findMany({
      where: { scheduledAt: new Date(startsAt) },
    });
    expect(rows.filter((row) => row.status === 'booked')).toHaveLength(1);
    expect(rows.filter((row) => row.status === 'cancelled')).toHaveLength(1);
  });
});
