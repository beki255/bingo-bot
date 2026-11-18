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

  const supportUsername = process.env.SUPPORT_USERNAME || "@tunnel_tech_solution";

  const defaultInstructionAm = [
    "🃏 የካርቴላ (መጫወቻ ካርድ) ምርጫ",
    "",
    "1. ወደ ጨዋታው ሲገቡ ከ1 እስከ 600 ካሉት ቁጥሮች ውስጥ በአንድ ዙር እስከ 2 ካርቴላ መምረጥ ይችላሉ።",
    "",
    "2. በመምረጫ ሰሌዳው ላይ በቀይ ቀለም የበሩ ቁጥሮች ቀድመው በሌሎች ተጫዋቾች የተያዙ ካርቴላዎችን ያመለክታሉ።",
    "",
    "3. ማንኛውንም ነፃ ቁጥር ሲነኩ ካርቴላው በውስጡ የያዛቸውን የቢንጎ ቁጥሮች ከታች አስቀድመው ማየት ይችላሉ።",
    "",
    "4. የሚፈልጉትን ካርቴላ መርጠው የመግቢያው ሰዓት (Countdown) 0 ሲደርስ ጨዋታው በቀጥታ ይጀምራል።",
    "",
    "🎮 የጨዋታው ሂደት",
    "",
    "1. ጨዋታው እንደተጀመረ የመረጡት ካርቴላ በስክሪኑ የታችኛው ክፍል ላይ ይታይዎታል።",
    "",
    "2. ሲስተሙ ከ1 እስከ 75 ያሉትን ቁጥሮች በዘፈቀደ (Randomly) በተከታታይ መጥራት ይጀምራል።",
    "",
    "3. የተጠራው ቁጥር በእርስዎ ካርቴላ ላይ ካለ በመንካት ምልክት ያድርጉበት (ያጥቁሩት)፤ ወይም ሲስተሙ ራሱ እንዲሞላልዎ Automatic ሁነታን ማብራት ይችላሉ።",
    "",
    "🏆 የማሸነፊያ ህጎች",
    "",
    "1. በካርቴላዎ ላይ ምልክት የተደረገባቸው ቁጥሮች ከሚከተሉት አንዱን ከሰሩ አሸናፊ ይሆናሉ፦",
    "   • ወደ ጎን (አግድም) ወይም ወደ ታች (ቁልቁል) ሙሉ መስመር ሲሰሩ",
    "   • በሁለቱም አቅጣጫ ሰያፍ (Diagonal) መስመር ሲሰሩ",
    "   • የካርቴላውን አራቱንም ማዕዘናት (4 Corners) ሲያሟሉ",
    "",
    "2. በአንድ ዙር ሁለት ወይም ከዚያ በላይ ተጫዋቾች በተመሳሳይ ጊዜ ቢያሸንፉ፣ አጠቃላይ የዙሩ ሽልማት (ደራሽ) ለአሸናፊዎቹ እኩል ይከፋፈላል።",
  ].join("\n");

  const defaultInstructionEn = [
    "🃏 Choosing Your Cartela (Game Card)",
    "",
    "1. Before the round starts, pick up to 2 cartelas from the 1–600 selection board.",
    "",
    "2. Numbers highlighted in red on the board are already taken by other players.",
    "",
    "3. Tapping any available number previews the exact 5×5 numbers on that cartela below the board.",
    "",
    "4. Once you lock in your cartela(s) and the countdown timer reaches 0, the live game starts automatically.",
    "",
    "🎮 How the Game Plays",
    "",
    "1. When the game begins, your active cartela(s) appear on the lower-right area of the screen.",
    "",
    "2. The system randomly draws numbers from 1 to 75 one by one.",
    "",
    "3. Tap matching numbers on your cartela as they are called, or switch on Automatic mode to have them marked automatically.",
    "",
    "🏆 How to Win",
    "",
    "1. You win as soon as your marked numbers complete any of the following patterns:",
    "   • A full Horizontal or Vertical line",
    "   • Either Diagonal line",
    "   • All Four Corners of the cartela",
    "",
    "2. If two or more players win on the same called number, the total prize pot is split equally among all winners.",
  ].join("\n");

  await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: {
      supportUsername,
      instructionAm: defaultInstructionAm,
      instructionEn: defaultInstructionEn,
      referralBonusEnabled: true,
      referralTriggerType: "ON_SIGNUP_VERIFIED",
      referralBonusValue: 50,
    },
    create: {
      id: 1,
      botName: process.env.BOT_NAME || "Tunnel Bingo",
      welcomeBannerUrl: process.env.WELCOME_BANNER_URL || "",
      supportUsername,
      channelUrl: "",
      welcomeCaptionAm: "",
      welcomeCaptionEn: "",
      instructionAm: defaultInstructionAm,
      instructionEn: defaultInstructionEn,
      welcomeBonusEnabled: true,
      welcomeBonusAmount: 10,
      referralBonusEnabled: true,
      referralTriggerType: "ON_SIGNUP_VERIFIED",
      referralBonusValue: 50,
      minDeposit: 10,
      maxDeposit: 50000,
      minWithdraw: 50,
      maxWithdraw: 50000,
      withdrawProviders: ["Telebirr"],
      transferEnabled: true,
      minTransfer: 10,
      maxTransfer: 10000,
      manualClaimWindowMs: 2000,
      maintenanceMode: false,
      maintenanceMessageAm: "",
      maintenanceMessageEn: "",
    },
  });

  const existingRooms = await prisma.room.count();
  if (existingRooms === 0) {
    await prisma.room.createMany({
      data: [
        {
          nameAm: "መደብ 10",
          nameEn: "Play 10",
          mode: "AUTO",
          stakeAmount: 10,
          houseCutPercent: 20,
          minPlayers: 2,
          cartelaPoolSize: 600,
          countdownSeconds: 30,
          waitTimeoutSeconds: 300,
          callIntervalMs: 3500,
          winningPattern: "ONE_LINE",
          freeCenter: false,
          isActive: true,
        },
        {
          nameAm: "መደብ 20",
          nameEn: "Play 20",
          mode: "AUTO",
          stakeAmount: 20,
          houseCutPercent: 20,
          minPlayers: 2,
          cartelaPoolSize: 600,
          countdownSeconds: 30,
          waitTimeoutSeconds: 300,
          callIntervalMs: 3500,
          winningPattern: "ONE_LINE",
          freeCenter: false,
          isActive: true,
        },
      ],
    });
    console.log("Seeded default rooms (Play 10, Play 20).");
  }

  const existingAccounts = await prisma.paymentAccount.findMany();
  const telebirrAcc = existingAccounts.find(
    (a) => a.provider.toLowerCase() === "telebirr" && a.accountNumber === "0911111111"
  );
  if (!telebirrAcc) {
    await prisma.paymentAccount.create({
      data: {
        provider: "Telebirr",
        accountName: "Telebirr",
        accountNumber: "0911111111",
        isActive: true,
        sortOrder: 1,
      },
    });
    console.log("Seeded default Telebirr payment account (0911111111).");
  }

  const existingCount = await prisma.cartelaTemplate.count();
  if (existingCount < 600) {
    for (let num = 1; num <= 600; num++) {
      const grid = generateDeterministicCartela(num);
      await prisma.cartelaTemplate.upsert({
        where: { cartelaNumber: num },
        update: {},
        create: { cartelaNumber: num, grid },
      });
    }
    console.log("Seeded 600 fixed cartela templates.");
  }

  const rawAdminId = (process.env.SUPER_ADMIN_TELEGRAM_ID || "").trim();
  if (!rawAdminId) {
    throw new Error("SUPER_ADMIN_TELEGRAM_ID must be set in .env before seeding.");
  }

  const adminTgId = BigInt(rawAdminId);
  const adminPhone = (process.env.SUPER_ADMIN_PHONE || "").trim() || null;
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || "ChangeMe123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const existingRefOwner = await prisma.user.findUnique({ where: { referralCode: "ADMIN01" } });
  const existingPhoneOwner = adminPhone
    ? await prisma.user.findUnique({ where: { phoneNumber: adminPhone } })
    : null;

  const adminUser = await prisma.user.upsert({
    where: { telegramId: adminTgId },
    update: { role: "SUPER_ADMIN", passwordHash },
    create: {
      telegramId: adminTgId,
      phoneNumber: existingPhoneOwner ? null : adminPhone,
      firstName: "Admin",
      lastName: null,
      username: null,
      language: "AM",
      role: "SUPER_ADMIN",
      passwordHash,
      referralCode: existingRefOwner ? `ADM${adminTgId.toString().slice(-6)}` : "ADMIN01",
      welcomeBonusClaimed: false,
      wallet: { create: { balance: 0, lockedBalance: 0 } },
    },
    include: { wallet: true },
  });

  if (!adminUser.wallet) {
    await prisma.wallet.create({ data: { userId: adminUser.id, balance: 0, lockedBalance: 0 } });
  }

  console.log(`Database seed completed (SUPER_ADMIN telegramId=${adminTgId.toString()}).`);
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

