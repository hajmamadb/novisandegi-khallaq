// DECISION: load .env from apps/api explicitly — jest runs with rootDir=test,
// so Prisma's default CWD lookup would miss DATABASE_URL. Parsed manually to
// avoid a dotenv dependency (only KEY=VALUE lines, comments ignored).
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
import { AuthModule } from './../src/modules/auth/auth.module';
import { PrismaModule } from './../src/prisma/prisma.module';

// DECISION: integration test boots the real AuthModule against the dev DB
// (DATABASE_URL from .env) so the full register→login→me→logout path is
// exercised end-to-end, including argon2 + JWT + Prisma.
describe('Auth (integration)', () => {
  let app: INestApplication;
  const email = `it_${Date.now()}@kargah.test`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/register creates a user and returns a token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'abc12345', displayName: 'IT User' })
      .expect(200);

    expect(res.body.user.email).toBe(email);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('POST /auth/register rejects duplicate email with 409', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'abc12345', displayName: 'Dup' })
      .expect(409);
  });

  it('POST /auth/register rejects a weak password with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: `weak_${Date.now()}@kargah.test`, password: 'short', displayName: 'W' })
      .expect(400);
  });

  it('POST /auth/login with correct password returns a token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'abc12345' })
      .expect(200);

    expect(res.body.user.email).toBe(email);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('POST /auth/login with wrong password returns 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrongpass1' })
      .expect(401);
  });

  it('GET /auth/me with a valid token returns the profile', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'abc12345' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(res.body.email).toBe(email);
  });

  it('GET /auth/me without a token returns 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('POST /auth/logout with a valid token returns ok', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'abc12345' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
  });
});
