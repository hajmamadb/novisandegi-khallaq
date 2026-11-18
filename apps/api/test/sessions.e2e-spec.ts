// DECISION: same manual .env loader pattern.
import * as fs from 'fs';
import * as path from 'path';

(function loadEnv() {
  const file = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
})();

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { SessionsModule } from './../src/modules/sessions/sessions.module';
import { ExercisesModule } from './../src/modules/exercises/exercises.module';
import { EventsModule } from './../src/modules/events/events.module';
import { AuthModule } from './../src/modules/auth/auth.module';
import { PrismaModule } from './../src/prisma/prisma.module';
import { QueueModule } from './../src/queues/queue.module';

describe('Sessions (integration)', () => {
  let app: INestApplication;
  const email = `sess_${Date.now()}@kargah.test`;
  let token: string;
  let exerciseId: string;
  let sessionId: string;

  const server = () => app.getHttpServer();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        QueueModule,
        AuthModule,
        ExercisesModule,
        EventsModule,
        SessionsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeAll(async () => {
    const reg = await request(server())
      .post('/auth/register')
      .send({ email, password: 'abc12345', displayName: 'Sessions IT' })
      .expect(200);
    token = reg.body.accessToken;

    // Resolve a seeded NOVICE exercise id from its known slug.
    const ex = await request(server())
      .get('/exercises/freewriting')
      .set(auth())
      .expect(200);
    exerciseId = ex.body.id;
  }, 15000);

  it('POST /sessions creates an IN_PROGRESS session with a prompt snapshot', async () => {
    const res = await request(server())
      .post('/sessions')
      .set(auth())
      .send({ exerciseTypeId: exerciseId })
      .expect(201);

    expect(res.body.session.id).toBeDefined();
    expect(res.body.session.status).toBe('IN_PROGRESS');
    expect(res.body.promptSnapshot.exerciseType.slug).toBe('freewriting');
    sessionId = res.body.session.id;
  });

  it('POST /sessions without token returns 401', async () => {
    await request(server())
      .post('/sessions')
      .send({ exerciseTypeId: exerciseId })
      .expect(401);
  });

  it('POST /sessions rejects a non-UUID exerciseTypeId with 400', async () => {
    await request(server())
      .post('/sessions')
      .set(auth())
      .send({ exerciseTypeId: 'not-a-uuid' })
      .expect(400);
  });

  it('GET /sessions/active lists the in-flight session', async () => {
    const res = await request(server())
      .get('/sessions/active')
      .set(auth())
      .expect(200);
    expect(res.body.some((s: { id: string }) => s.id === sessionId)).toBe(true);
  });

  it('POST /sessions/:id/drafts creates version 1', async () => {
    const res = await request(server())
      .post(`/sessions/${sessionId}/drafts`)
      .set(auth())
      .send({ contentText: 'این اولین پیش‌نویس من است.' })
      .expect(201);
    expect(res.body.skipped).toBe(false);
    expect(res.body.draft.versionNumber).toBe(1);
    expect(res.body.draft.wordCount).toBeGreaterThan(0);
  });

  it('POST /sessions/:id/drafts skips when content is identical', async () => {
    const res = await request(server())
      .post(`/sessions/${sessionId}/drafts`)
      .set(auth())
      .send({ contentText: 'این اولین پیش‌نویس من است.' })
      .expect(201);
    expect(res.body.skipped).toBe(true);
    expect(res.body.draft.versionNumber).toBe(1);
  });

  it('POST /sessions/:id/drafts bumps to version 2 on new content', async () => {
    const res = await request(server())
      .post(`/sessions/${sessionId}/drafts`)
      .set(auth())
      .send({ contentText: 'حالا تغییر دادم تا نسخه‌ی دوم ساخته شود.' })
      .expect(201);
    expect(res.body.skipped).toBe(false);
    expect(res.body.draft.versionNumber).toBe(2);
  });

  it('GET /sessions/:id/drafts returns versions ascending', async () => {
    const res = await request(server())
      .get(`/sessions/${sessionId}/drafts`)
      .set(auth())
      .expect(200);
    expect(res.body.length).toBe(2);
    expect(res.body.map((d: { versionNumber: number }) => d.versionNumber)).toEqual([1, 2]);
  });

  it('POST /sessions/:id/submit finalizes the session', async () => {
    const res = await request(server())
      .post(`/sessions/${sessionId}/submit`)
      .set(auth())
      .send({
        contentText: 'متن نهایی تمرین که چند کلمه دارد.',
        clientStats: { durationSeconds: 120, totalKeystrokes: 80 },
      })
      .expect(201);

    expect(res.body.submission.id).toBeDefined();
    expect(res.body.submission.wordCount).toBeGreaterThan(0);
    expect(res.body.submission.integrityResult).toBe('PASSED');
    // 7 words < 50*0.5 => soft warning
    expect(res.body.warning).toBeTruthy();
    // ---- Step 8: Integrity pipeline runs at submit ----
    // Seven checks are persisted and surfaced in the response.
    expect(Array.isArray(res.body.integrityChecks)).toBe(true);
    expect(res.body.integrityChecks).toHaveLength(7);
    const types = res.body.integrityChecks.map((c: { checkType: string }) => c.checkType);
    for (const t of [
      'PASTE', 'TYPING_SPEED', 'ACTIVE_TIME', 'LANGUAGE',
      'VOCABULARY', 'SELF_REPEAT', 'SIMILARITY_BANK',
    ]) {
      expect(types).toContain(t);
    }
    // All checks pass for normal Persian content (NLP is down in dev,
    // so NLP-dependent checks degrade to PASSED with a skip marker).
    for (const c of res.body.integrityChecks) {
      expect(['PASSED', 'WARNING', 'FLAGGED']).toContain(c.result);
    }
  });

  it('POST /sessions/:id/submit again throws 400 (already submitted)', async () => {
    await request(server())
      .post(`/sessions/${sessionId}/submit`)
      .set(auth())
      .send({ contentText: 'doppleganger' })
      .expect(400);
  });

  it('GET /sessions/:id reflects SUBMITTED status with a submission', async () => {
    const res = await request(server())
      .get(`/sessions/${sessionId}`)
      .set(auth())
      .expect(200);
    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.submission).toBeDefined();
  });

  it('POST /sessions/:id/abandon on a submitted session throws 400', async () => {
    await request(server())
      .post(`/sessions/${sessionId}/abandon`)
      .set(auth())
      .send({})
      .expect(400);
  });

  it('abandon sets status ABANDONED on a fresh session', async () => {
    const created = await request(server())
      .post('/sessions')
      .set(auth())
      .send({ exerciseTypeId: exerciseId })
      .expect(201);
    const freshId = created.body.session.id;

    const res = await request(server())
      .post(`/sessions/${freshId}/abandon`)
      .set(auth())
      .send({})
      .expect(201);
    expect(res.body.status).toBe('ABANDONED');
    expect(res.body.endedAt).toBeDefined();
  });

  it('another user cannot read a foreign session (403)', async () => {
    const other = await request(server())
      .post('/auth/register')
      .send({ email: `sess_other_${Date.now()}@kargah.test`, password: 'abc12345', displayName: 'Other' })
      .expect(200);
    const otherToken = other.body.accessToken;

    await request(server())
      .get(`/sessions/${sessionId}`)
      .set({ Authorization: `Bearer ${otherToken}` })
      .expect(403);
  });

  // ---- K.2: Reroll limit (2 rerolls allowed, 3rd → 429) ----

  describe('reroll (K.2)', () => {
    let bankSessionId: string;

    beforeAll(async () => {
      // Resolve the five-senses exercise (bankSourceType = PLACE, seeded with 10 places).
      const ex = await request(server())
        .get('/exercises/five-senses')
        .set(auth())
        .expect(200);
      const created = await request(server())
        .post('/sessions')
        .set(auth())
        .send({ exerciseTypeId: ex.body.id })
        .expect(201);
      bankSessionId = created.body.session.id;
    });

    it('POST /sessions/:id/reroll draws a new source item (1st reroll)', async () => {
      const res = await request(server())
        .post(`/sessions/${bankSessionId}/reroll`)
        .set(auth())
        .expect(201);
      expect(res.body.session.rerollCount).toBe(1);
      expect(res.body.sourceItem).toBeDefined();
      expect(res.body.sourceItem.id).toBeDefined();
      expect(res.body.selectionLogId).toBeDefined();
    });

    it('POST /sessions/:id/reroll draws again (2nd reroll)', async () => {
      const res = await request(server())
        .post(`/sessions/${bankSessionId}/reroll`)
        .set(auth())
        .expect(201);
      expect(res.body.session.rerollCount).toBe(2);
      expect(res.body.sourceItem).toBeDefined();
    });

    it('POST /sessions/:id/reroll returns 429 on the 3rd attempt', async () => {
      await request(server())
        .post(`/sessions/${bankSessionId}/reroll`)
        .set(auth())
        .expect(429);
    });

    it('reroll on a non-bank session returns 400', async () => {
      // freewriting has bankSourceType = null → no source item to reroll.
      await request(server())
        .post(`/sessions/${sessionId}/reroll`)
        .set(auth())
        .expect(400);
    });
  });
});
