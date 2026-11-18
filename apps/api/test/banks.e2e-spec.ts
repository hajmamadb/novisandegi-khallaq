// DECISION: same manual .env loader pattern as the other e2e specs.
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
import { BanksModule } from './../src/modules/banks/banks.module';
import { ExercisesModule } from './../src/modules/exercises/exercises.module';
import { EventsModule } from './../src/modules/events/events.module';
import { AuthModule } from './../src/modules/auth/auth.module';
import { PrismaModule } from './../src/prisma/prisma.module';
import { QueueModule } from './../src/queues/queue.module';

describe('Banks (integration)', () => {
  let app: INestApplication;
  const email = `banks_${Date.now()}@kargah.test`;
  let token: string;

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
        BanksModule,
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
      .send({ email, password: 'abc12345', displayName: 'Banks IT' })
      .expect(200);
    token = reg.body.accessToken;
  }, 15000);

  it('POST /banks/PLACE/draw returns a drawn item with a selection log', async () => {
    const res = await request(server())
      .post('/banks/PLACE/draw')
      .set(auth())
      .send({})
      .expect(201);

    expect(res.body.item).toBeDefined();
    expect(res.body.item.id).toBeDefined();
    expect(res.body.selectionLogId).toBeDefined();
    expect(res.body.cyclePosition).toBeDefined();
  });

  it('POST /banks/CHARACTER/draw works for a seeded CHARACTER bank', async () => {
    const res = await request(server())
      .post('/banks/CHARACTER/draw')
      .set(auth())
      .send({})
      .expect(201);
    expect(res.body.item.id).toBeDefined();
  });

  it('POST /banks/EMOTION/draw works via PureRandomSelector', async () => {
    // seed.ts populates 20 EmotionLexicon rows (section I.8).
    const res = await request(server())
      .post('/banks/EMOTION/draw')
      .set(auth())
      .send({})
      .expect(201);
    expect(res.body.item.id).toBeDefined();
    // PureRandomSelector has no UserCycle → cyclePosition is absent.
    expect(res.body.cyclePosition).toBeUndefined();
  });

  it('POST /banks/NEWS/draw works via ConditionalSelector (seeded, APPROVED)', async () => {
    const res = await request(server())
      .post('/banks/NEWS/draw')
      .set(auth())
      .send({})
      .expect(201);
    expect(res.body.item.id).toBeDefined();
  });

  // DECISION: ServiceUnavailableException (503) is what NestJS maps
  // "not wired yet" to; the spec's 501 intent is preserved in the message.
  it('POST /banks/DICTIONARY/draw returns 503 for an unwired bank', async () => {
    const res = await request(server())
      .post('/banks/DICTIONARY/draw')
      .set(auth())
      .send({})
      .expect(503);
    expect(res.body.message).toContain('BANK_NOT_WIRED');
  });

  it('POST /banks/BOGUS/draw returns 400 for an invalid bank type', async () => {
    await request(server())
      .post('/banks/BOGUS/draw')
      .set(auth())
      .send({})
      .expect(400);
  });

  it('POST /banks/PLACE/draw without a token returns 401', async () => {
    await request(server())
      .post('/banks/PLACE/draw')
      .send({})
      .expect(401);
  });

  it('GET /banks/PLACE returns 403 for a non-admin user', async () => {
    // The test user is NOVICE; the browse endpoint is ADMIN/MENTOR/EDITOR only.
    await request(server())
      .get('/banks/PLACE')
      .set(auth())
      .expect(403);
  });

  // ---- K.2: Cycle completion via repeated draws ----

  it('repeated draws from PLACE cycle through items (cycle completion)', async () => {
    // The PLACE bank has 10 seeded items. Draw 10 times as a fresh user;
    // the last draw should complete the cycle (position 10/10) and the
    // next draw should start a new cycle (position 1/10).
    const freshEmail = `banks_cycle_${Date.now()}@kargah.test`;
    const reg = await request(server())
      .post('/auth/register')
      .send({ email: freshEmail, password: 'abc12345', displayName: 'Cycle IT' })
      .expect(200);
    const freshAuth = { Authorization: `Bearer ${reg.body.accessToken}` };

    const seen: string[] = [];
    let lastPosition: string | undefined;
    for (let i = 1; i <= 10; i++) {
      const res = await request(server())
        .post('/banks/PLACE/draw')
        .set(freshAuth)
        .send({})
        .expect(201);
      seen.push(res.body.item.id);
      lastPosition = res.body.cyclePosition;
    }

    // The 10th draw is the last item in the cycle.
    expect(lastPosition).toBe('10/10');
    // The 11th draw starts a fresh cycle.
    const next = await request(server())
      .post('/banks/PLACE/draw')
      .set(freshAuth)
      .send({})
      .expect(201);
    expect(next.body.cyclePosition).toBe('1/10');
  });
});
