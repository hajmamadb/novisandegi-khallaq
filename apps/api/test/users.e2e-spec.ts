// DECISION: same manual .env loader pattern as auth.e2e-spec.ts.
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
import { UsersModule } from './../src/modules/users/users.module';
import { AuthModule } from './../src/modules/auth/auth.module';
import { PrismaModule } from './../src/prisma/prisma.module';

describe('Users (integration)', () => {
  let app: INestApplication;
  const email = `us_${Date.now()}@kargah.test`;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, UsersModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeAll(async () => {
    // Register + login to obtain a valid token.
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'abc12345', displayName: 'IT User' })
      .expect(200);
    token = reg.body.accessToken;
  }, 15000);

  it('GET /users/me returns the profile with settingsJson', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.email).toBe(email);
    expect(res.body.settingsJson).toBeDefined();
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('GET /users/me without token returns 401', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('PATCH /users/me updates displayName', async () => {
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Updated Name' })
      .expect(200);

    expect(res.body.displayName).toBe('Updated Name');
  });

  it('PATCH /users/me shallow-merges settingsJson', async () => {
    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ settingsJson: { theme: 'dark' } })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ settingsJson: { font: 'serif' } })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.settingsJson).toEqual(
      expect.objectContaining({ theme: 'dark', font: 'serif' }),
    );
  });

  it('PATCH /users/me rejects an unknown field with 400', async () => {
    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ bogus: true })
      .expect(400);
  });

  it('GET /users/me/export returns user + empty collections', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.user.email).toBe(email);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(Array.isArray(res.body.submissions)).toBe(true);
    expect(res.body.exportedAt).toBeDefined();
  });
});
