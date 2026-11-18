import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BlogService } from './blog.service';

/**
 * Public: GET /blog, GET /blog/:slug
 * Admin:  POST /admin/blog, PATCH /admin/blog/:id, DELETE /admin/blog/:id, GET /admin/blog
 */
@Controller()
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  // ── Public ──

  @Get('blog')
  list() {
    return this.blog.listPublished();
  }

  @Get('blog/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.blog.getBySlug(slug);
  }

  // ── Admin ──

  @Get('admin/blog')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN)
  adminList() {
    return this.blog.adminList();
  }

  @Post('admin/blog')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN)
  adminCreate(@Body() body: {
    slug: string;
    titleFa: string;
    excerptFa: string;
    bodyMarkdown: string;
    publishedAt?: string;
    status?: string;
  }) {
    return this.blog.adminCreate({
      ...body,
      publishedAt: body.publishedAt ? new Date(body.publishedAt) : undefined,
    });
  }

  @Patch('admin/blog/:id')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN)
  adminUpdate(
    @Param('id') id: string,
    @Body() body: {
      titleFa?: string;
      excerptFa?: string;
      bodyMarkdown?: string;
      publishedAt?: string;
      status?: string;
    },
  ) {
    return this.blog.adminUpdate(id, {
      ...body,
      publishedAt: body.publishedAt ? new Date(body.publishedAt) : undefined,
    });
  }

  @Delete('admin/blog/:id')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN)
  adminDelete(@Param('id') id: string) {
    return this.blog.adminDelete(id);
  }
}
