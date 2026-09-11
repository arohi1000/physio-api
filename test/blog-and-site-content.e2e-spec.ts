import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import request from 'supertest';
import { createE2eApp, createTestUser, destroyE2eApp } from './support/e2e-app';

const SUITE = randomUUID().slice(0, 8);
const DOCTOR_EMAIL = `blog.doctor.${SUITE}@physio.test`;

describe('Blog CRUD and site content (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let doctorToken: string;
  let doctorId: string;
  const createdPostIds: string[] = [];

  beforeAll(async () => {
    const context = await createE2eApp();
    app = context.app;
    prisma = context.prisma;

    const doctor = await createTestUser(prisma, {
      email: DOCTOR_EMAIL,
      role: UserRole.doctor_admin,
    });
    doctorId = doctor.id;
    doctorToken = await signIn(DOCTOR_EMAIL);
  });

  afterAll(async () => {
    await prisma.blogPost.deleteMany({ where: { id: { in: createdPostIds } } });
    await prisma.user.deleteMany({ where: { id: doctorId } });
    await destroyE2eApp({ app, prisma });
  });

  async function signIn(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/dev-login')
      .send({ email })
      .expect(200);
    return response.body.accessToken;
  }

  it('never returns the seeded draft on the public list, and 404s a direct public fetch of it', async () => {
    const draft = await prisma.blogPost.findFirstOrThrow({
      where: { published: false },
    });

    const list = await request(app.getHttpServer())
      .get('/api/v1/blog')
      .expect(200);
    const slugs = list.body.data.map((post: { slug: string }) => post.slug);
    expect(slugs).not.toContain(draft.slug);

    const publicFetch = await request(app.getHttpServer())
      .get(`/api/v1/blog/${draft.slug}`)
      .expect(404);
    expect(publicFetch.body.code).toBe('BLOG_POST_NOT_FOUND');

    const adminFetch = await request(app.getHttpServer())
      .get(`/api/v1/admin/blog/${draft.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
    expect(adminFetch.body.slug).toBe(draft.slug);
    expect(adminFetch.body.published).toBe(false);
  });

  it('stamps publishedAt once on first publish and never moves it on a later edit', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/blog')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        title: `E2E Publish Timing ${SUITE}`,
        content: 'Draft content.',
      })
      .expect(201);
    createdPostIds.push(created.body.id);
    expect(created.body.published).toBe(false);
    expect(created.body.publishedAt).toBeNull();

    const published = await request(app.getHttpServer())
      .patch(`/api/v1/admin/blog/${created.body.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ published: true })
      .expect(200);
    const firstPublishedAt = published.body.publishedAt;
    expect(firstPublishedAt).not.toBeNull();

    const editedAfterPublish = await request(app.getHttpServer())
      .patch(`/api/v1/admin/blog/${created.body.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ title: 'Edited title, still published', published: true })
      .expect(200);
    expect(editedAfterPublish.body.publishedAt).toBe(firstPublishedAt);
  });

  it('rejects a duplicate slug with BLOG_SLUG_TAKEN', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/blog')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ title: `Duplicate Slug Source ${SUITE}`, content: 'Body.' })
      .expect(201);
    createdPostIds.push(first.body.id);

    const conflict = await request(app.getHttpServer())
      .patch(`/api/v1/admin/blog/${first.body.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ slug: first.body.slug })
      .expect(200);
    expect(conflict.body.slug).toBe(first.body.slug);

    const second = await request(app.getHttpServer())
      .post('/api/v1/admin/blog')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ title: `Second Post ${SUITE}`, content: 'Body.' })
      .expect(201);
    createdPostIds.push(second.body.id);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/admin/blog/${second.body.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ slug: first.body.slug })
      .expect(409);
    expect(response.body.code).toBe('BLOG_SLUG_TAKEN');
  });

  it('hard deletes a post', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/blog')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ title: `Delete Me ${SUITE}`, content: 'Body.' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/blog/${created.body.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/admin/blog/${created.body.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404);
  });

  it('reads and updates both site-content keys', async () => {
    const about = await request(app.getHttpServer())
      .get('/api/v1/site-content/about')
      .expect(200);
    expect(about.body.headline).toBeDefined();

    const updatedAbout = await request(app.getHttpServer())
      .put('/api/v1/admin/site-content/about')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        headline: `E2E headline ${SUITE}`,
        bioParagraphs: ['Updated bio paragraph.'],
        credentials: ['BPT, MPT (Sports)'],
        photoUrl: null,
        clinicAddress: null,
      })
      .expect(200);
    expect(updatedAbout.body.headline).toBe(`E2E headline ${SUITE}`);

    const rereadAbout = await request(app.getHttpServer())
      .get('/api/v1/site-content/about')
      .expect(200);
    expect(rereadAbout.body.headline).toBe(`E2E headline ${SUITE}`);

    const updatedReviews = await request(app.getHttpServer())
      .put('/api/v1/admin/site-content/reviews')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ items: [{ name: 'Asha K.', rating: 5, comment: 'Great care.' }] })
      .expect(200);
    expect(updatedReviews.body.items).toHaveLength(1);

    const unknown = await request(app.getHttpServer())
      .get('/api/v1/site-content/unknown-key')
      .expect(404);
    expect(unknown.body.code).toBe('SITE_CONTENT_KEY_UNKNOWN');
  });
});
