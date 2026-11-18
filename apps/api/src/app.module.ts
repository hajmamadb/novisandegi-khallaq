import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ExercisesModule } from './modules/exercises/exercises.module';
import { EventsModule } from './modules/events/events.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { HistoryModule } from './modules/history/history.module';
import { AdminModule } from './modules/admin/admin.module';
import { BanksModule } from './modules/banks/banks.module';
import { QueueModule } from './queues/queue.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { BlogModule } from './modules/blog/blog.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { WritingsModule } from './modules/writings/writings.module';
import { CommunityModule } from './modules/community/community.module';
import { NewsModule } from './modules/news/news.module';
import { MentorshipModule } from './modules/mentorship/mentorship.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminApprovalsModule } from './modules/admin-approvals/admin-approvals.module';
import { AdminSettingsModule } from './modules/admin-settings/admin-settings.module';
import { AdminBanksModule } from './modules/admin-banks/admin-banks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    PrismaModule,
    QueueModule,
    AuthModule,
    UsersModule,
    ExercisesModule,
    EventsModule,
    BanksModule,
    SessionsModule,
    HistoryModule,
    AdminModule,
    GamificationModule,
    BlogModule,
    ProjectsModule,
    WritingsModule,
    CommunityModule,
    NewsModule,
    MentorshipModule,
    MessagesModule,
    NotificationsModule,
    AdminApprovalsModule,
    AdminSettingsModule,
    AdminBanksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Wrap every request in an AsyncLocalStorage context so server-side
    // event logging (events.logRaw) automatically carries hashed IP/UA.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
