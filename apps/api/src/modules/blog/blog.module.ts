import { Module } from '@nestjs/common';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

// DECISION: PrismaModule is @Global(), so only controller + service here.
@Module({
  controllers: [BlogController],
  providers: [BlogService],
})
export class BlogModule {}
