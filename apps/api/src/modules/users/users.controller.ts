import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getMe(@CurrentUser() user: JwtUser): Promise<Record<string, unknown>> {
    return this.usersService.getMe(user.sub);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  updateMe(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateUserDto,
  ): Promise<Record<string, unknown>> {
    return this.usersService.updateMe(user.sub, dto);
  }

  @Get('export')
  exportMe(@CurrentUser() user: JwtUser): Promise<Record<string, unknown>> {
    return this.usersService.exportMe(user.sub);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  deleteMe(@CurrentUser() user: JwtUser): Promise<{ ok: true }> {
    return this.usersService.deleteMe(user.sub);
  }
}
