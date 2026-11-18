import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MentorshipService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /mentorship/requests?direction=out|in — requests I sent / received. */
  list(userId: string, direction: 'out' | 'in' = 'in') {
    const where =
      direction === 'out'
        ? { studentId: userId }
        : { mentorId: userId };
    return this.prisma.mentorshipRequest.findMany({
      where,
      select: {
        id: true,
        message: true,
        status: true,
        acceptedAt: true,
        createdAt: true,
        student: { select: { id: true, displayName: true, email: true } },
        mentor: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** GET /mentorship/mentors — users who can mentor (MENTOR/EDITOR/PROFESSIONAL). */
  listMentors() {
    return this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.MENTOR, UserRole.EDITOR, UserRole.PROFESSIONAL] },
        isActive: true,
      },
      select: { id: true, displayName: true, role: true, level: true },
      orderBy: { level: 'desc' },
      take: 50,
    });
  }

  /** POST /mentorship/requests — ask a mentor. */
  async create(studentId: string, mentorId: string, message: string) {
    if (studentId === mentorId) {
      throw new BadRequestException('SELF_MENTOR_NOT_ALLOWED');
    }
    const mentor = await this.prisma.user.findUnique({ where: { id: mentorId } });
    if (
      !mentor ||
      !(mentor.role === 'MENTOR' ||
        mentor.role === 'EDITOR' ||
        mentor.role === 'PROFESSIONAL')
    ) {
      throw new NotFoundException('MENTOR_NOT_FOUND');
    }
    return this.prisma.mentorshipRequest.create({
      data: { studentId, mentorId, message },
    });
  }

  /** POST /mentorship/requests/:id/accept|decline — mentor decides. */
  async decide(
    mentorId: string,
    id: string,
    accept: boolean,
  ) {
    const request = await this.prisma.mentorshipRequest.findUnique({
      where: { id },
    });
    if (!request || request.mentorId !== mentorId) {
      throw new NotFoundException('REQUEST_NOT_FOUND');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('ALREADY_DECIDED');
    }
    return this.prisma.mentorshipRequest.update({
      where: { id },
      data: {
        status: accept ? 'ACCEPTED' : 'DECLINED',
        acceptedAt: accept ? new Date() : null,
      },
    });
  }
}
