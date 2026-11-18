import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };

  const validUser = {
    id: 'u1',
    email: 'a@b.com',
    displayName: 'Ali',
    role: UserRole.NOVICE,
    level: 1,
    emailVerified: false,
    isActive: true,
    deletedAt: null,
    passwordHash: 'hash',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
    };
    const jwt = { sign: jest.fn().mockReturnValue('tok') };
    const config = { get: jest.fn((k) => (k === 'JWT_SECRET' ? 's'.repeat(32) : '24h')) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('creates a user and returns an access token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(validUser);

      const res = await service.register({
        email: 'a@b.com',
        password: 'abc12345',
        displayName: 'Ali',
      });

      expect(res.user.id).toBe('u1');
      expect(res.accessToken).toBe('tok');
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('throws CONFLICT when email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      await expect(
        service.register({ email: 'a@b.com', password: 'abc12345', displayName: 'Ali' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('throws AUTH_INVALID_CREDENTIALS for unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'a@b.com', password: 'abc12345' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws AUTH_INVALID_CREDENTIALS for a deactivated user', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...validUser, isActive: false });
      await expect(
        service.login({ email: 'a@b.com', password: 'abc12345' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('returns the user when valid', async () => {
      prisma.user.findUnique.mockResolvedValue(validUser);
      const res = await service.me('u1');
      expect(res.email).toBe('a@b.com');
      expect(res.role).toBe(UserRole.NOVICE);
    });
  });
});
