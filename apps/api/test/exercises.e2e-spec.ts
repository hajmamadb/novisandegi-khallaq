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
import { ExercisesModule } from './../src/modules/exercises/exercises.module';
import { AuthModule } from './../src/modules/auth/auth.module';
import { PrismaModule } from './../src/prisma/prisma.module';

describe('Exercises (integration)', () => {
  let app: INestApplication;
  const email = `ex_${Date.now()}@kargah.test`;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, ExercisesModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeAll(async () => {
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'abc12345', displayName: 'IT User' })
      .expect(200);
    token = reg.body.accessToken;
  }, 15000);

  it('GET /exercises returns an array of active exercises', async () => {
    const res = await request(app.getHttpServer())
      .get('/exercises')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('slug');
      expect(res.body[0]).toHaveProperty('title');
    }
  });

  // DECISION: the exercise catalog is intentionally public (no JwtAuthGuard on
  // ExercisesController — see controller comment). Unauthenticated access
  // returns 200, so the test asserts the catalog is readable without a token.
  it('GET /exercises without token is public (200)', async () => {
    const res = await request(app.getHttpServer()).get('/exercises').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /exercises/:slug returns a single exercise', async () => {
    // Use a known slug from the seed.
    const res = await request(app.getHttpServer())
      .get('/exercises/freewriting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.slug).toBe('freewriting');
    expect(res.body).toHaveProperty('durationSeconds');
  });

  it('GET /exercises/:slug returns 404 for unknown slug', async () => {
    await request(app.getHttpServer())
      .get('/exercises/nonexistent-slug-xyz')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
