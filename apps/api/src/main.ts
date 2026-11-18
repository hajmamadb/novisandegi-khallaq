import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { QueueService } from './queues/queue.service';
import { StreakService } from './modules/gamification/streak.service';
import { BadgeService } from './modules/gamification/badges/badges.service';
import { NewsFeedService } from './modules/news/news.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // DECISION: CORS restricted to the web origin (H.2) — never '*' in dev
  // so the browser enforces same-origin for credentials.
  const origin = config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';
  app.enableCors({ origin: [origin], credentials: true });

  // Global validation: class-validator DTOs on every @Body().
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Spec D.16 error-code envelope for every 4xx/5xx.
  app.useGlobalFilters(new HttpExceptionFilter());

  // Register pg-boss workers (spec E.8).
  const queue = app.get(QueueService);
  const badgeService = app.get(BadgeService);
  await queue.registerWorker('badge-evaluate', async (data) => {
    await badgeService.evaluateForEvent((data as { eventId: string }).eventId);
  });

  // DECISION: no cron package in the stack (spec locks the stack, no
  // @nestjs/schedule). Midnight Tehran streak sweep (spec E.6) is a
  // 60-second interval that computes the next Tehran midnight via
  // intervalToDuration and fires runMidnight() exactly once per day.
  const logger = new Logger('StreakCron');
  const streak = app.get(StreakService);
  let lastFiredDay = '';

  const tick = async () => {
    try {
      // Tehran is UTC+3:30 year-round (no DST).
      const tehranNow = new Date(
        new Date().toISOString().replace('Z', '+03:30'),
      );
      const tehranMidnight = new Date(tehranNow);
      tehranMidnight.setUTCHours(-3, -30, 0, 0);
      // Advance to the next midnight if today's has already passed.
      if (tehranMidnight <= tehranNow) {
        tehranMidnight.setUTCDate(tehranMidnight.getUTCDate() + 1);
      }
      const dayKey = tehranMidnight.toISOString();
      if (lastFiredDay === dayKey) return; // already fired for this day

      const msToMidnight = tehranMidnight.getTime() - tehranNow.getTime();
      if (msToMidnight > 60_000) {
        // Not yet within 60 s of midnight — do nothing, wait for next tick.
        return;
      }
      lastFiredDay = dayKey;
      logger.log(`Tehran midnight reached — running streak sweep`);
      await streak.runMidnight();
    } catch (err) {
      logger.error(`Streak midnight sweep failed`, err as Error);
    }
  };

  const interval = setInterval(tick, 60_000);
  // Allow unclean shutdown.
  interval.unref?.();

  // DECISION: the daily news pipeline (spec: cron every 6 hours) is the same
  // no-cron-package pattern as the streak sweep — a 60-second interval that
  // computes the next 6-hour boundary (UTC) and fires runFetchCycle() once
  // per boundary. Anchoring to UTC keeps the boundary stable across the
  // server's timezone; 6h divides a day evenly so it self-syncs.
  const newsLogger = new Logger('NewsCron');
  const newsFeed = app.get(NewsFeedService);
  const NEWS_INTERVAL_MS = 6 * 60 * 60 * 1000;
  let lastNewsFired = 0;
  let newsRunning = false;

  const newsTick = async () => {
    const now = Date.now();
    const nextBoundary = Math.floor(now / NEWS_INTERVAL_MS) * NEWS_INTERVAL_MS;
    const msToBoundary = nextBoundary - now;
    if (msToBoundary > 60_000) return; // not within 60s of a 6h boundary
    const boundaryKey = Math.floor(now / NEWS_INTERVAL_MS);
    if (lastNewsFired === boundaryKey) return; // already fired this boundary
    if (newsRunning) return; // a previous cycle is still in flight
    lastNewsFired = boundaryKey;
    newsRunning = true;
    try {
      newsLogger.log('6h boundary reached — running news fetch cycle');
      const stats = await newsFeed.runFetchCycle();
      const inserted = stats.reduce((s, f) => s + f.inserted, 0);
      const fetched = stats.reduce((s, f) => s + f.fetched, 0);
      newsLogger.log(`news cycle done: fetched=${fetched} inserted=${inserted}`);
    } catch (err) {
      newsLogger.error('News fetch cycle failed', err as Error);
    } finally {
      newsRunning = false;
    }
  };

  // DECISION: also run one cycle ~15s after boot so a fresh deployment has
  // news without waiting up to 6h for the first boundary.
  setTimeout(() => {
    void newsTick().catch((err) =>
      newsLogger.error('Initial news tick failed', err as Error),
    );
  }, 15_000);

  const newsInterval = setInterval(newsTick, 60_000);
  newsInterval.unref?.();

  const port = Number(config.get<string>('API_PORT') ?? process.env.PORT ?? 3001);
  await app.listen(port);
}
bootstrap();
