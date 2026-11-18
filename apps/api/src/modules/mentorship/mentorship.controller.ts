import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { MentorshipService } from './mentorship.service';

@Controller('mentorship')
@UseGuards(JwtAuthGuard)
export class MentorshipController {
  constructor(private readonly mentorship: MentorshipService) {}

  @Get('requests')
  list(
    @CurrentUser() user: JwtUser,
    @Query('direction') direction: 'out' | 'in' = 'in',
  ) {
    return this.mentorship.list(user.sub, direction === 'out' ? 'out' : 'in');
  }

  @Get('mentors')
  mentors() {
    return this.mentorship.listMentors();
  }

  @Post('requests')
  create(
    @CurrentUser() user: JwtUser,
    @Body() body: { mentorId: string; message: string },
  ) {
    return this.mentorship.create(user.sub, body.mentorId, body.message);
  }

  @Post('requests/:id/accept')
  accept(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.mentorship.decide(user.sub, id, true);
  }

  @Post('requests/:id/decline')
  decline(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.mentorship.decide(user.sub, id, false);
  }
}
