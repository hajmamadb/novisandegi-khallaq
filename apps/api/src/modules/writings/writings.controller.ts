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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { WritingsService } from './writings.service';

@Controller('writings')
@UseGuards(JwtAuthGuard)
export class WritingsController {
  constructor(private readonly writings: WritingsService) {}

  // ── Folders (declared before ':id' so they win route matching) ──

  @Get('folders')
  listFolders(@CurrentUser() user: JwtUser) {
    return this.writings.listFolders(user.sub);
  }

  @Post('folders')
  createFolder(@CurrentUser() user: JwtUser, @Body() body: { name: string }) {
    return this.writings.createFolder(user.sub, body.name);
  }

  @Delete('folders/:id')
  removeFolder(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.writings.removeFolder(user.sub, id);
  }

  @Post('folders/:id/restore')
  restoreFolder(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.writings.restoreFolder(user.sub, id);
  }

  // ── Writings ──

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query() query: { folderId?: string; tag?: string; trash?: string },
  ) {
    return this.writings.list(user.sub, {
      folderId: query.folderId,
      tag: query.tag,
      trash: query.trash === 'true',
    });
  }

  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.writings.get(user.sub, id);
  }

  @Get(':id/versions')
  versions(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.writings.versions(user.sub, id);
  }

  @Post()
  create(
    @CurrentUser() user: JwtUser,
    @Body()
    body: {
      title: string;
      contentText?: string;
      tags?: string[];
      folderId?: string;
      sourceSessionId?: string;
      projectId?: string;
    },
  ) {
    return this.writings.create(user.sub, body);
  }

  @Post(':id/link-session')
  linkSession(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: { sessionId: string },
  ) {
    return this.writings.linkSession(user.sub, id, body.sessionId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      contentText?: string;
      tags?: string[];
      folderId?: string | null;
      status?: string;
    },
  ) {
    return this.writings.update(user.sub, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.writings.remove(user.sub, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.writings.restore(user.sub, id);
  }

  @Delete(':id/permanent')
  permanentDelete(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.writings.permanentDelete(user.sub, id);
  }
}
