import {
  AppointmentStatus,
  BookingSource,
  CouponValueType,
  MessageType,
  PaymentMethod,
  PaymentPreference,
  PatientSource,
  PrismaClient,
  UserRole,
  type Prisma,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { config } from 'dotenv';
import type { WeeklyWorkingHours } from '../src/modules/clinic-settings/clinic-settings.types';
import { zonedWallClockToUtc } from '../src/modules/availability/timezone.util';

config({ quiet: true });

const prisma = new PrismaClient();

/**
 * Mirrors `ReceiptsService.nextReceiptNumber`. Every caller here is guarded by
 * an existence check, so re-running the seed does not consume sequence values.
 */
async function nextReceiptNumber(): Promise<string> {
  const rows = await prisma.$queryRaw<
    { nextval: bigint }[]
  >`SELECT nextval('receipt_number_seq') AS nextval`;
  const sequence = rows[0].nextval.toString().padStart(4, '0');
  return `RCP-${new Date().getUTCFullYear()}-${sequence}`;
}

/**
 * Local development defaults. The CRM demo signs in as either of these through
 * the dev bypass; the doctor additionally has a break-glass password.
 */
const DOCTOR_EMAIL = (
  process.env.SEED_DOCTOR_EMAIL ?? 'doctor@physioclinic.local'
).toLowerCase();
const DOCTOR_PASSWORD = process.env.SEED_DOCTOR_PASSWORD ?? 'ChangeMe!Local123';
const STAFF_EMAIL = (
  process.env.SEED_STAFF_EMAIL ?? 'staff@physioclinic.local'
).toLowerCase();

/**
 * Mon–Fri morning and evening clinics, Sat morning only, Sunday closed. Times
 * are Asia/Kolkata. Fixed by M2-CONTRACT.md §4 — do not invent alternatives.
 */
const WEEKLY_WORKING_HOURS: WeeklyWorkingHours = {
  mon: [
    { start: '09:00', end: '13:00' },
    { start: '16:00', end: '19:00' },
  ],
  tue: [
    { start: '09:00', end: '13:00' },
    { start: '16:00', end: '19:00' },
  ],
  wed: [
    { start: '09:00', end: '13:00' },
    { start: '16:00', end: '19:00' },
  ],
  thu: [
    { start: '09:00', end: '13:00' },
    { start: '16:00', end: '19:00' },
  ],
  fri: [
    { start: '09:00', end: '13:00' },
    { start: '16:00', end: '19:00' },
  ],
  sat: [{ start: '09:00', end: '13:00' }],
  sun: [],
};

const SERVICES = [
  {
    name: 'Initial Physiotherapy Assessment',
    description:
      'A full first consultation: history, movement screen, hands-on assessment and a written treatment plan.',
    price: '1200.00',
    durationMinutes: 45,
    demoVideoUrl: 'https://www.youtube.com/watch?v=placeholder-assessment',
  },
  {
    name: 'Sports Injury Rehabilitation',
    description:
      'Progressive loading and return-to-sport work for muscle, tendon and ligament injuries.',
    price: '1500.00',
    durationMinutes: 60,
    demoVideoUrl: 'https://www.youtube.com/watch?v=placeholder-sports',
  },
  {
    name: 'Post-Surgical Rehabilitation',
    description:
      'Structured recovery after knee, hip, shoulder or spinal surgery, coordinated with your surgeon’s protocol.',
    price: '1500.00',
    durationMinutes: 60,
    demoVideoUrl: null,
  },
  {
    name: 'Manual Therapy Session',
    description:
      'Hands-on mobilisation and soft-tissue work for stiffness and mechanical pain.',
    price: '1000.00',
    durationMinutes: 45,
    demoVideoUrl: null,
  },
  {
    name: 'Dry Needling',
    description:
      'Targeted trigger-point needling for persistent muscular tightness, as an adjunct to exercise therapy.',
    price: '900.00',
    durationMinutes: 30,
    demoVideoUrl: null,
  },
  {
    name: 'Posture & Ergonomic Consultation',
    description:
      'Desk-setup review and a corrective exercise programme for neck, upper-back and wrist strain.',
    price: '800.00',
    durationMinutes: 30,
    demoVideoUrl: null,
  },
] as const;

/**
 * Fixed by M2-CONTRACT.md §4 — exact codes/values/states so both frontend
 * agents can demo every coupon branch against a known fixture.
 */
const NOW = new Date();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const COUPONS = [
  {
    code: 'WELCOME10',
    description: '10% off for first-time patients',
    valueType: CouponValueType.percent,
    value: '10.00',
    validFrom: new Date(NOW.getTime() - 365 * ONE_DAY_MS),
    validUntil: new Date(NOW.getTime() + 365 * ONE_DAY_MS),
    maxUses: null,
    usedCount: 0,
    active: true,
  },
  {
    code: 'FLAT200',
    description: 'Flat ₹200 off',
    valueType: CouponValueType.fixed,
    value: '200.00',
    validFrom: new Date(NOW.getTime() - 365 * ONE_DAY_MS),
    validUntil: new Date(NOW.getTime() + 365 * ONE_DAY_MS),
    maxUses: null,
    usedCount: 0,
    active: true,
  },
  {
    code: 'EXPIRED50',
    description: 'Expired half-off promotion',
    valueType: CouponValueType.percent,
    value: '50.00',
    validFrom: new Date(NOW.getTime() - 365 * ONE_DAY_MS),
    validUntil: new Date(NOW.getTime() - ONE_DAY_MS),
    maxUses: null,
    usedCount: 0,
    active: true,
  },
  {
    code: 'USEDUP',
    description: 'Fixed ₹100 off, exhausted',
    valueType: CouponValueType.fixed,
    value: '100.00',
    validFrom: new Date(NOW.getTime() - 365 * ONE_DAY_MS),
    validUntil: new Date(NOW.getTime() + 365 * ONE_DAY_MS),
    maxUses: 5,
    usedCount: 5,
    active: true,
  },
  {
    code: 'PAUSED25',
    description: '25% off, currently paused',
    valueType: CouponValueType.percent,
    value: '25.00',
    validFrom: new Date(NOW.getTime() - 365 * ONE_DAY_MS),
    validUntil: new Date(NOW.getTime() + 365 * ONE_DAY_MS),
    maxUses: null,
    usedCount: 0,
    active: false,
  },
] as const;

const MESSAGE_TEMPLATES = [
  {
    type: MessageType.cancellation,
    label: 'Polite reschedule',
    bodyTemplate:
      'Hello {{patient_name}}, we are very sorry but Dr. Sharma has had to cancel your appointment. {{doctor_note}} Please pick a new time here: {{rebooking_link}}',
  },
  {
    type: MessageType.cancellation,
    label: 'Clinic emergency',
    bodyTemplate:
      'Hello {{patient_name}}, due to an emergency at the clinic your appointment cannot go ahead. {{doctor_note}} We have kept your slot preference — rebook here: {{rebooking_link}}',
  },
  {
    type: MessageType.cancellation,
    label: 'Doctor unwell',
    bodyTemplate:
      'Hello {{patient_name}}, Dr. Sharma is unwell today and we must reschedule your session. {{doctor_note}} Our apologies for the short notice. Rebook: {{rebooking_link}}',
  },
  {
    type: MessageType.followup_reminder,
    label: 'Gentle revisit nudge',
    bodyTemplate:
      'Hello {{patient_name}}, your next physiotherapy review is due around {{revisit_date}}. Book a time that suits you: {{rebooking_link}}',
  },
  {
    type: MessageType.followup_reminder,
    label: 'Progress check-in',
    bodyTemplate:
      'Hello {{patient_name}}, it has been a few weeks since your last session. {{doctor_note}} Shall we review your progress around {{revisit_date}}? {{rebooking_link}}',
  },
  {
    type: MessageType.followup_reminder,
    label: 'Programme completion',
    bodyTemplate:
      'Hello {{patient_name}}, you are near the end of your programme. A final review around {{revisit_date}} will let us confirm your recovery. {{rebooking_link}}',
  },
  {
    type: MessageType.booking_confirmation,
    label: 'Standard confirmation',
    bodyTemplate:
      'Hello {{patient_name}}, your appointment is confirmed. Please arrive five minutes early and wear comfortable clothing. Need to change it? {{rebooking_link}}',
  },
  {
    type: MessageType.booking_confirmation,
    label: 'First visit',
    bodyTemplate:
      'Hello {{patient_name}}, your first appointment is confirmed. Please bring any scans, reports or referral letters you have. Change your time: {{rebooking_link}}',
  },
  {
    type: MessageType.booking_confirmation,
    label: 'With preparation note',
    bodyTemplate:
      'Hello {{patient_name}}, your appointment is confirmed. {{doctor_note}} If anything changes you can rebook here: {{rebooking_link}}',
  },
] as const;

const REVIEWS = [
  {
    patientName: 'Ananya Iyer',
    rating: 5,
    comment:
      'Six weeks after my ACL surgery I was walking without a limp. The exercises were explained clearly and adjusted every single visit.',
  },
  {
    patientName: 'Rohit Menon',
    rating: 5,
    comment:
      'Years of desk-job neck pain sorted in four sessions, plus a workstation setup I actually understood how to maintain.',
  },
  {
    patientName: 'Sunita Deshpande',
    rating: 4,
    comment:
      'Very thorough assessment and no unnecessary appointments pushed on me. Booking on WhatsApp was easy.',
  },
  {
    patientName: 'Karthik Raman',
    rating: 5,
    comment:
      'Came in with a running injury three weeks before a half marathon. Finished the race pain-free.',
  },
] as const;

const BLOG_POSTS = [
  {
    title: 'Five desk stretches that actually help neck pain',
    slug: 'five-desk-stretches-for-neck-pain',
    content:
      '## Why your neck hurts at a desk\n\nSustained postures load the deep neck flexors far more than movement does. These five stretches, done hourly, break that load up.\n\n1. Chin tucks\n2. Upper trapezius stretch\n3. Thoracic extension over the chair back\n4. Scapular retraction holds\n5. Levator scapulae stretch\n',
    published: true,
  },
  {
    title: 'What to expect from your first physiotherapy visit',
    slug: 'what-to-expect-first-physiotherapy-visit',
    content:
      '## Before you arrive\n\nBring any scans, reports or referral letters, and wear clothing you can move in.\n\n## During the session\n\nWe take a history, screen your movement, assess hands-on, and leave you with a written plan and two or three exercises — not twenty.\n',
    published: true,
  },
  {
    title: 'Returning to running after a knee injury',
    slug: 'returning-to-running-after-knee-injury',
    content:
      '## Load, not rest\n\nTendons and cartilage adapt to graded load. Complete rest deconditions them.\n\n## A sensible progression\n\nWalk-run intervals, then continuous easy running, then pace — changing only one variable at a time.\n',
    published: false,
  },
] as const;

async function seedUsers(): Promise<{ doctorId: string }> {
  const doctor = await prisma.user.upsert({
    where: { email: DOCTOR_EMAIL },
    update: {
      name: 'Dr. Meera Sharma',
      role: UserRole.doctor_admin,
      active: true,
    },
    create: {
      name: 'Dr. Meera Sharma',
      email: DOCTOR_EMAIL,
      role: UserRole.doctor_admin,
      active: true,
      passwordHash: await argon2.hash(DOCTOR_PASSWORD, {
        type: argon2.argon2id,
      }),
    },
  });

  await prisma.user.upsert({
    where: { email: STAFF_EMAIL },
    update: { name: 'Priya Nair', role: UserRole.staff, active: true },
    create: {
      name: 'Priya Nair',
      email: STAFF_EMAIL,
      role: UserRole.staff,
      active: true,
    },
  });

  return { doctorId: doctor.id };
}

async function seedClinicSettings(): Promise<void> {
  const workingHours: Prisma.InputJsonValue = WEEKLY_WORKING_HOURS;
  const existing = await prisma.clinicSettings.findFirst();

  if (existing) {
    await prisma.clinicSettings.update({
      where: { id: existing.id },
      data: { workingHours },
    });
    return;
  }

  await prisma.clinicSettings.create({
    data: { workingHours, timezone: 'Asia/Kolkata', slotBufferMinutes: 0 },
  });
}

async function seedServices(): Promise<void> {
  for (const service of SERVICES) {
    const existing = await prisma.service.findFirst({
      where: { name: service.name },
    });

    if (existing) {
      await prisma.service.update({
        where: { id: existing.id },
        data: { ...service, active: true },
      });
    } else {
      await prisma.service.create({ data: { ...service, active: true } });
    }
  }
}

async function seedCoupons(): Promise<void> {
  for (const coupon of COUPONS) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {
        description: coupon.description,
        valueType: coupon.valueType,
        value: coupon.value,
        validFrom: coupon.validFrom,
        validUntil: coupon.validUntil,
        maxUses: coupon.maxUses,
        usedCount: coupon.usedCount,
        active: coupon.active,
      },
      create: { ...coupon },
    });
  }
}

async function seedMessageTemplates(): Promise<void> {
  for (const template of MESSAGE_TEMPLATES) {
    await prisma.messageTemplate.upsert({
      where: { type_label: { type: template.type, label: template.label } },
      update: { bodyTemplate: template.bodyTemplate, active: true },
      create: { ...template, active: true },
    });
  }
}

async function seedReviews(): Promise<void> {
  for (const review of REVIEWS) {
    const existing = await prisma.review.findFirst({
      where: { patientName: review.patientName, comment: review.comment },
    });

    if (!existing) {
      await prisma.review.create({ data: { ...review, active: true } });
    }
  }
}

async function seedBlogPosts(authorUserId: string): Promise<void> {
  for (const post of BLOG_POSTS) {
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: {
        title: post.title,
        content: post.content,
        published: post.published,
      },
      create: {
        ...post,
        authorUserId,
        publishedAt: post.published ? new Date() : null,
      },
    });
  }
}

const ONE_DAY_AGO_MS = 24 * 60 * 60 * 1000;

async function findOrCreatePatient(input: {
  name: string;
  phone: string;
}): Promise<string> {
  const existing = await prisma.patient.findFirst({
    where: { phone: input.phone },
  });
  if (existing) {
    return existing.id;
  }
  const created = await prisma.patient.create({
    data: {
      name: input.name,
      phone: input.phone,
      source: PatientSource.manual,
    },
  });
  return created.id;
}

async function upsertSeedAppointment(input: {
  reference: string;
  patientId: string;
  serviceId: string;
  scheduledAt: Date;
  priceCharged: Prisma.Decimal | string;
}): Promise<string> {
  const appointment = await prisma.appointment.upsert({
    where: { reference: input.reference },
    update: {},
    create: {
      reference: input.reference,
      patientId: input.patientId,
      serviceId: input.serviceId,
      scheduledAt: input.scheduledAt,
      status: AppointmentStatus.completed,
      bookingSource: BookingSource.manual,
      reasonForVisit: 'general_assessment',
      paymentPreference: PaymentPreference.clinic,
      priceCharged: input.priceCharged,
      paymentStatus: 'paid_offline',
    },
  });
  return appointment.id;
}

/**
 * Two patients with real history, so the CRM has a populated timeline to
 * build against (M3-CONTRACT.md §6). Idempotent: appointments upsert on
 * their unique `reference`; prescriptions/receipts/follow-ups are skipped if
 * a row already exists for the same appointment/patient.
 */
async function seedPatientHistoryFixtures(doctorId: string): Promise<void> {
  const [assessment, manualTherapy, dryNeedling] = await Promise.all([
    prisma.service.findFirstOrThrow({
      where: { name: 'Initial Physiotherapy Assessment' },
    }),
    prisma.service.findFirstOrThrow({
      where: { name: 'Manual Therapy Session' },
    }),
    prisma.service.findFirstOrThrow({ where: { name: 'Dry Needling' } }),
  ]);
  const clinicSettings = await prisma.clinicSettings.findFirstOrThrow();
  const timezone = clinicSettings.timezone;
  const leadDays = clinicSettings.followUpReminderLeadDays;

  const ashaId = await findOrCreatePatient({
    name: 'Asha Kumar',
    phone: '+919876500010',
  });
  const ashaAppt1Id = await upsertSeedAppointment({
    reference: 'PH-SEED-ASHA-0001',
    patientId: ashaId,
    serviceId: assessment.id,
    scheduledAt: new Date(Date.now() - 60 * ONE_DAY_AGO_MS),
    priceCharged: assessment.price,
  });
  const ashaAppt2Id = await upsertSeedAppointment({
    reference: 'PH-SEED-ASHA-0002',
    patientId: ashaId,
    serviceId: manualTherapy.id,
    scheduledAt: new Date(Date.now() - 30 * ONE_DAY_AGO_MS),
    priceCharged: manualTherapy.price,
  });

  const existingPrescription = await prisma.prescription.findFirst({
    where: { appointmentId: ashaAppt2Id },
  });
  if (!existingPrescription) {
    await prisma.prescription.create({
      data: {
        patientId: ashaId,
        appointmentId: ashaAppt2Id,
        issuedByUserId: doctorId,
        content: {
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
            {
              name: 'Pendulum swings',
              sets: 2,
              reps: 15,
              notes: 'Slow and controlled',
            },
          ],
          instructions: 'Ice for 10 minutes after each session.',
        } satisfies Prisma.InputJsonValue,
      },
    });
  }

  for (const [appointmentId, amount] of [
    [ashaAppt1Id, assessment.price],
    [ashaAppt2Id, manualTherapy.price],
  ] as const) {
    const existingReceipt = await prisma.receipt.findFirst({
      where: { appointmentId },
    });
    if (!existingReceipt) {
      await prisma.receipt.create({
        data: {
          number: await nextReceiptNumber(),
          patientId: ashaId,
          appointmentId,
          amount,
          paymentMethod: PaymentMethod.cash,
          issuedByUserId: doctorId,
        },
      });
    }
  }

  const existingFollowUp = await prisma.followUp.findFirst({
    where: { patientId: ashaId, purpose: 'Review shoulder mobility' },
  });
  if (!existingFollowUp) {
    const revisitDate = new Date(Date.now() + 14 * ONE_DAY_AGO_MS)
      .toISOString()
      .slice(0, 10);
    const [year, month, day] = revisitDate.split('-').map(Number);
    const reminderDate = new Date(Date.UTC(year, month - 1, day));
    reminderDate.setUTCDate(reminderDate.getUTCDate() - leadDays);
    const reminderDateStr = reminderDate.toISOString().slice(0, 10);

    await prisma.followUp.create({
      data: {
        patientId: ashaId,
        appointmentId: ashaAppt2Id,
        purpose: 'Review shoulder mobility',
        revisitTargetDate: new Date(revisitDate),
        reminderScheduledFor: zonedWallClockToUtc(
          reminderDateStr,
          '09:00',
          timezone,
        ),
        status: 'scheduled',
        createdByUserId: doctorId,
      },
    });
  }

  const raviId = await findOrCreatePatient({
    name: 'Ravi Menon',
    phone: '+919876500011',
  });
  const raviApptId = await upsertSeedAppointment({
    reference: 'PH-SEED-RAVI-0001',
    patientId: raviId,
    serviceId: dryNeedling.id,
    scheduledAt: new Date(Date.now() - 20 * ONE_DAY_AGO_MS),
    priceCharged: dryNeedling.price,
  });
  const existingRaviReceipt = await prisma.receipt.findFirst({
    where: { appointmentId: raviApptId },
  });
  if (!existingRaviReceipt) {
    await prisma.receipt.create({
      data: {
        number: await nextReceiptNumber(),
        patientId: raviId,
        appointmentId: raviApptId,
        amount: dryNeedling.price,
        paymentMethod: PaymentMethod.online,
        issuedByUserId: doctorId,
      },
    });
  }
}

/**
 * Idempotent by design: every record is matched on a natural key and updated
 * rather than inserted, so running the seed twice leaves the same row count.
 */
async function main(): Promise<void> {
  const { doctorId } = await seedUsers();
  await seedClinicSettings();
  await seedServices();
  await seedCoupons();
  await seedMessageTemplates();
  await seedReviews();
  await seedBlogPosts(doctorId);
  await seedPatientHistoryFixtures(doctorId);

  const counts = {
    users: await prisma.user.count(),
    services: await prisma.service.count(),
    clinicSettings: await prisma.clinicSettings.count(),
    coupons: await prisma.coupon.count(),
    messageTemplates: await prisma.messageTemplate.count(),
    reviews: await prisma.review.count(),
    blogPosts: await prisma.blogPost.count(),
    patients: await prisma.patient.count(),
  };

  process.stdout.write(`Seed complete: ${JSON.stringify(counts)}\n`);
  process.stdout.write(
    `Sign in as ${DOCTOR_EMAIL} (doctor_admin) or ${STAFF_EMAIL} (staff).\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.exitCode = 1;
    process.stderr.write(`Seed failed: ${String(error)}\n`);
  })
  .finally(() => prisma.$disconnect());
