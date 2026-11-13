import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { generateDeterministicCartela } from "@bingo/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      botName: process.env.BOT_NAME || "Bingo Ethiopia",
      welcomeBannerUrl: process.env.WELCOME_BANNER_URL || "",
      supportUsername: process.env.SUPPORT_USERNAME || "@BingoSupport",
      welcomeBonusEnabled: true,
      welcomeBonusAmount: 10,
      referralBonusEnabled: false,
      referralTriggerType: "ON_FIRST_DEPOSIT",
      referralBonusValue: 10,
      minDeposit: 10,
      maxDeposit: 50000,
      minWithdraw: 50,
      maxWithdraw: 50000,
      transferEnabled: true,
      minTransfer: 10,
      maxTransfer: 10000,
      manualClaimWindowMs: 2000,
      maintenanceMode: false,
    },
  });

  const existingCount = await prisma.cartelaTemplate.count();
  if (existingCount < 200) {
    for (let num = 1; num <= 200; num++) {
      const grid = generateDeterministicCartela(num);
      await prisma.cartelaTemplate.upsert({
        where: { cartelaNumber: num },
        update: {},
        create: { cartelaNumber: num, grid },
      });
    }
    console.log("Seeded 200 fixed cartela templates.");
  }

  const adminTgId = BigInt(process.env.SUPER_ADMIN_TELEGRAM_ID || "100000001");
  const adminPhone = process.env.SUPER_ADMIN_PHONE || "+251900000000";
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  if (adminTgId !== 100000001n) {
    // Demote/clear placeholder dummy admin 100000001 so it doesn't hold SUPER_ADMIN, adminPhone, or ADMIN01
    await prisma.user.updateMany({
      where: { telegramId: 100000001n },
      data: { role: "PLAYER", phoneNumber: null, referralCode: "PLACEHOLDER_100000001" },
    });
  }

  const [existingPhoneOwner, existingRefOwner] = await Promise.all([
    prisma.user.findUnique({ where: { phoneNumber: adminPhone } }),
    prisma.user.findUnique({ where: { referralCode: "ADMIN01" } }),
  ]);

  const adminUser = await prisma.user.upsert({
    where: { telegramId: adminTgId },
    update: { role: "SUPER_ADMIN", passwordHash },
    create: {
      telegramId: adminTgId,
      phoneNumber: existingPhoneOwner ? null : adminPhone,
      firstName: "Super",
      lastName: "Admin",
      username: "super_admin",
      language: "AM",
      role: "SUPER_ADMIN",
      passwordHash,
      referralCode: existingRefOwner ? `ADM${adminTgId.toString().slice(-6)}` : "ADMIN01",
      welcomeBonusClaimed: true,
      wallet: { create: { balance: 1000 } },
    },
    include: { wallet: true },
  });

  if (!adminUser.wallet) {
    await prisma.wallet.create({ data: { userId: adminUser.id, balance: 1000 } });
  }

  const payCount = await prisma.paymentAccount.count();
  if (payCount === 0) {
    await prisma.paymentAccount.createMany({
      data: [
        {
          provider: "Telebirr",
          accountName: "Bingo Admin",
          accountNumber: "0900000000",
          instructionsAm: "በTelebirr ገንዘቡን ካስገቡ በኋላ የSMS መልዕክቱን Copy/Paste ያድርጉ።",
          instructionsEn: "Transfer via Telebirr, then copy & paste the SMS confirmation.",
          isActive: true,
          sortOrder: 1,
        },
        {
          provider: "CBE",
          accountName: "Bingo Admin CBE",
          accountNumber: "1000000000000",
          instructionsAm: "በCBE ካስገቡ በኋላ የSMS መልዕክቱን ወይም FT Reference ይላኩ።",
          instructionsEn: "Transfer via CBE, then paste the SMS confirmation or FT Reference.",
          isActive: true,
          sortOrder: 2,
        },
      ],
    });
  }

  const roomCount = await prisma.room.count();
  if (roomCount === 0) {
    await prisma.room.createMany({
      data: [
        {
          nameAm: "10 ብር — Auto ቢንጎ",
          nameEn: "10 ETB — Auto Bingo",
          mode: "AUTO",
          stakeAmount: 10,
          houseCutPercent: 20,
          minPlayers: 2,
          cartelaPoolSize: 100,
          countdownSeconds: 30,
          waitTimeoutSeconds: 300,
          callIntervalMs: 3500,
          winningPattern: "ONE_LINE",
          freeCenter: true,
          isActive: true,
          sortOrder: 1,
        },
        {
          nameAm: "20 ብር — Manual ቢንጎ",
          nameEn: "20 ETB — Manual Bingo",
          mode: "MANUAL",
          stakeAmount: 20,
          houseCutPercent: 20,
          minPlayers: 2,
          cartelaPoolSize: 100,
          countdownSeconds: 30,
          waitTimeoutSeconds: 300,
          callIntervalMs: 4000,
          winningPattern: "ONE_LINE",
          freeCenter: true,
          isActive: true,
          sortOrder: 2,
        },
      ],
    });
  }

  console.log("Database seed completed!");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

