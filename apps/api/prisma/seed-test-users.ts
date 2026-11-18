import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const testUsers = [
  {
    email: 'novice@kargah.dev',
    displayName: 'سارا رادمنش (نوآموز)',
    role: UserRole.NOVICE,
    level: 1,
    xpTotal: 50,
  },
  {
    email: 'craftsperson@kargah.dev',
    displayName: 'علی کریمی (کاربلد)',
    role: UserRole.CRAFTSPERSON,
    level: 3,
    xpTotal: 350,
  },
  {
    email: 'creative@kargah.dev',
    displayName: 'مریم تهرانی (خلاق)',
    role: UserRole.CREATIVE,
    level: 5,
    xpTotal: 800,
  },
  {
    email: 'mentor@kargah.dev',
    displayName: 'استاد شفیعی (مربی)',
    role: UserRole.MENTOR,
    level: 7,
    xpTotal: 1500,
  },
  {
    email: 'editor@kargah.dev',
    displayName: 'پروانه پارسا (ویراستار)',
    role: UserRole.EDITOR,
    level: 8,
    xpTotal: 2200,
  },
];

const passwordHash =
  '$argon2id$v=19$m=19456,t=2,p=1$t4/yCWpseisudJAe+OPsJQ$bZCr8JO9qZtUr3g3WKODT9A4pH/YykUwcyeZT+PmtvA';

async function main() {
  console.log('ایجاد حساب‌های تستی در سطوح مختلف...');

  for (const u of testUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        passwordHash,
        displayName: u.displayName,
        role: u.role,
        level: u.level,
        emailVerified: true,
        isActive: true,
      },
      update: {
        displayName: u.displayName,
        role: u.role,
        level: u.level,
        isActive: true,
      },
    });

    await prisma.userStats.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        xpTotal: u.xpTotal,
        level: u.level,
        roleRank: u.role,
        wordsTotal: u.level * 400,
        activeDays: u.level * 2,
        currentStreak: u.level,
        bestStreak: u.level + 2,
        freezesRemaining: 2,
        sessionsCount: u.level * 3,
      },
      update: {
        xpTotal: u.xpTotal,
        level: u.level,
        roleRank: u.role,
      },
    });

    console.log(`✓ کاربر تستی ثبت شد: ${u.displayName} [${u.role}]`);
  }

  console.log('تکمیل شد.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

