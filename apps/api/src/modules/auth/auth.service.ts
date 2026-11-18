import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../../common/utils/hash.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface AuthUserResponse {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  level: number;
  emailVerified: boolean;
  createdAt: Date;
}

export interface AuthTokenResponse {
  user: AuthUserResponse;
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** POST /auth/register */
  async register(dto: RegisterDto): Promise<AuthTokenResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing && !existing.deletedAt) {
      // CONFLICT 409
      throw new ConflictException('CONFLICT: email already registered');
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        role: UserRole.NOVICE,
        level: 1,
        emailVerified: false,
      },
    });

    return { user: this.toResponse(user), accessToken: this.sign(user) };
  }

  /** POST /auth/login */
  async login(dto: LoginDto): Promise<AuthTokenResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // DECISION: same 401 for unknown email and wrong password (do not leak
    // which accounts exist).
    if (!user || user.deletedAt || !user.isActive) {
      // AUTH_INVALID_CREDENTIALS 401
      throw new UnauthorizedException('AUTH_INVALID_CREDENTIALS');
    }

    const ok = await verifyPassword(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('AUTH_INVALID_CREDENTIALS');
    }

    return { user: this.toResponse(user), accessToken: this.sign(user) };
  }

  /** GET /auth/me — identity re-check from the JWT payload. */
  async me(sub: string): Promise<AuthUserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('AUTH_INVALID_CREDENTIALS');
    }
    return this.toResponse(user);
  }

  /** POST /auth/refresh — re-issues a token for a still-valid user. */
  async refresh(sub: string): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('AUTH_INVALID_CREDENTIALS');
    }
    return { accessToken: this.sign(user) };
  }

  /** POST /auth/logout — stateless JWT; client discards the token. */
  async logout(): Promise<{ ok: true }> {
    // DECISION: no server-side token store in phase 1 (spec: JWT is the
    // only credential). The endpoint exists so the web client has a single
    // logout call; it is a no-op on the server.
    return { ok: true };
  }

  private sign(user: {
    id: string;
    email: string;
    role: UserRole;
  }): string {
    // spec E.1 — HS256, 24h. JWT_SECRET must come from .env (never in code).
    // DECISION: fail loudly (500) if JWT_SECRET is unset, matching the
    // jwt.strategy behaviour. A silent dev-secret fallback would mask
    // misconfiguration and create a security risk.
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not set');
    }
    return this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret,
        expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ?? '24h') as never,
      },
    );
  }

  private toResponse(user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    level: number;
    emailVerified: boolean;
    createdAt: Date;
  }): AuthUserResponse {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      level: user.level,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
  }
}
