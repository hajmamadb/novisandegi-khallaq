import { Injectable, NotFoundException } from '@nestjs/common';
import { ExerciseCategory, UserRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ListExercisesQuery {
  category?: ExerciseCategory;
  accessLevel?: UserRole;
}

@Injectable()
export class ExercisesService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /exercises — list active exercise types, optionally filtered. */
  async list(query: ListExercisesQuery) {
    const where: Prisma.ExerciseTypeWhereInput = {
      isActive: true,
      // DECISION: only show exercises the user can actually access.
      // accessLevel is a role; the user's role must be >= accessLevel.
      // For phase 1 (NOVICE users) we show NOVICE + MENTOR exercises.
      // The role check is done in the controller via the user's role.
    };
    if (query.category) where.category = query.category;
    if (query.accessLevel) where.accessLevel = query.accessLevel;

    return this.prisma.exerciseType.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    });
  }

  /** GET /exercises/:slug — single exercise type by slug. */
  async getBySlug(slug: string) {
    const ex = await this.prisma.exerciseType.findUnique({
      where: { slug },
    });
    if (!ex || !ex.isActive) {
      throw new NotFoundException('EXERCISE_NOT_FOUND');
    }
    return ex;
  }
}
