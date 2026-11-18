import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectStatus, ProjectType } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query('trash') trash?: string) {
    return this.projects.list(user.sub, { trash: trash === 'true' });
  }

  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.projects.get(user.sub, id);
  }

  @Post()
  create(
    @CurrentUser() user: JwtUser,
    @Body() body: { title: string; type?: ProjectType; description?: string; targetWords?: number },
  ) {
    return this.projects.create(user.sub, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      description?: string;
      targetWords?: number;
      status?: ProjectStatus;
    },
  ) {
    return this.projects.update(user.sub, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.projects.remove(user.sub, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.projects.restore(user.sub, id);
  }

  @Delete(':id/permanent')
  permanentDelete(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.projects.permanentDelete(user.sub, id);
  }

  // ── Chapters ──

  @Post(':id/chapters')
  addChapter(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: { title: string; contentText?: string },
  ) {
    return this.projects.addChapter(user.sub, id, body);
  }

  @Patch(':id/chapters/:chapterId')
  updateChapter(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('chapterId') chapterId: string,
    @Body() body: { title?: string; contentText?: string },
  ) {
    return this.projects.updateChapter(user.sub, id, chapterId, body);
  }

  @Delete(':id/chapters/:chapterId')
  removeChapter(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('chapterId') chapterId: string,
  ) {
    return this.projects.removeChapter(user.sub, id, chapterId);
  }
}
