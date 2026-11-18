import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'hajmamad.b@gmail.com' },
    create: {
      email: 'hajmamad.b@gmail.com',
      passwordHash:
        '$argon2id$v=19$m=19456,t=2,p=1$lw7z+SeMyA44SaoyhCI7Fw$x35Uzhi4lYSCgpMz9/jqN+kpUqPyewCOSJFl1Di3Iq8',
      displayName: 'دکتر محمد بختیاری',
      role: 'ADMIN',
      level: 10,
      emailVerified: true,
      isActive: true,
    },
    update: {
      passwordHash:
        '$argon2id$v=19$m=19456,t=2,p=1$lw7z+SeMyA44SaoyhCI7Fw$x35Uzhi4lYSCgpMz9/jqN+kpUqPyewCOSJFl1Di3Iq8',
      displayName: 'دکتر محمد بختیاری',
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log(`کاربر ادمین با موفقیت ایجاد/به‌روزرسانی شد: ${admin.displayName} (${admin.email})`);

  // Ensure userStats exist
  await prisma.userStats.upsert({
    where: { userId: admin.id },
    create: {
      userId: admin.id,
      xpTotal: 1000,
      level: 10,
      roleRank: 'ADMIN',
      wordsTotal: 0,
      activeDays: 1,
      currentStreak: 1,
      bestStreak: 1,
      freezesRemaining: 2,
      sessionsCount: 0,
    },
    update: {
      level: 10,
      roleRank: 'ADMIN',
    },
  });

  console.log('آمار اولیه کاربر ادمین تثبیت شد.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

