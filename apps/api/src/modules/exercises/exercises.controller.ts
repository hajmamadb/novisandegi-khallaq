import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ExerciseCategory, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ExercisesService } from './exercises.service';
import { ClusterService } from './cluster.service';

// DECISION: no guard — the exercise catalog (title/description/category) is
// public content used by the landing page and the /exercises intro page.
// Session creation (POST /sessions) stays behind JwtAuthGuard.
@Controller('exercises')
export class ExercisesController {
  constructor(
    private readonly exercises: ExercisesService,
    private readonly cluster: ClusterService,
  ) {}

  @Get()
  list(@Query() query: { category?: string; accessLevel?: string }) {
    // DECISION: query params arrive as strings; cast to the enum types
    // that Prisma's where-input expects.
    return this.exercises.list(query as { category?: ExerciseCategory; accessLevel?: UserRole });
  }

  // DECISION: declared alongside :slug — NestJS matches :slug/cluster to
  // this more-specific route (single-segment :slug never swallows the
  // /cluster suffix). Public, slug-only (see ClusterService header).
  @Get(':slug/cluster')
  getCluster(
    @Param('slug') slug: string,
    @Query() query: { pos?: string; tags?: string },
  ) {
    return this.cluster.forSlug(slug, { pos: query.pos, tags: query.tags });
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.exercises.getBySlug(slug);
  }
}
