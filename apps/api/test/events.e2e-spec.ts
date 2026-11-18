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
import { EventsModule } from './../src/modules/events/events.module';
import { AuthModule } from './../src/modules/auth/auth.module';
import { PrismaModule } from './../src/prisma/prisma.module';
import { QueueModule } from './../src/queues/queue.module';

describe('Events (integration)', () => {
  let app: INestApplication;
  const email = `ev_${Date.now()}@kargah.test`;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        QueueModule,
        AuthModule,
        EventsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeAll(async () => {
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'abc12345', displayName: 'Events IT' })
      .expect(200);
    token = reg.body.accessToken;
  }, 15000);

  it('POST /events appends an event and returns the persisted row', async () => {
    const res = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventName: 'test_event', eventPayloadJson: { k: 'v' } })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.eventName).toBe('test_event');
    expect(res.body.eventPayloadJson).toEqual({ k: 'v' });
    expect(res.body.serverTimestamp).toBeDefined();
  });

  it('POST /events without token returns 401', async () => {
    await request(app.getHttpServer())
      .post('/events')
      .send({ eventName: 'test_event' })
      .expect(401);
  });

  it('POST /events rejects an unknown field with 400', async () => {
    await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventName: 'test_event', bogus: true })
      .expect(400);
  });

  it('GET /events/me returns the user events, newest first', async () => {
    // Seed a second event to verify ordering.
    await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventName: 'second_event' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/events/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    // Newest first — second_event must appear before test_event.
    const names = res.body.items.map((e: { eventName: string }) => e.eventName);
    expect(names.indexOf('second_event')).toBeLessThan(names.indexOf('test_event'));
  });

  it('GET /events/me supports the eventName filter', async () => {
    const res = await request(app.getHttpServer())
      .get('/events/me?eventName=second_event')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    for (const item of res.body.items) {
      expect(item.eventName).toBe('second_event');
    }
  });
});
