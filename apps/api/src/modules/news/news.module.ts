import { Module } from '@nestjs/common';
import { NewsFeedService } from './news.service';

// DECISION: no controller — the pipeline is driven by the 6h worker in
// main.ts (cron-like setInterval, the streak-sweep pattern) and read via the
// existing community + admin-approvals routes. PrismaModule is @Global().
@Module({
  providers: [NewsFeedService],
  exports: [NewsFeedService],
})
export class NewsModule {}
