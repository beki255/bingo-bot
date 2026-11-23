import http from "node:http";
import bcrypt from "bcryptjs";
import { Server as SocketIOServer } from "socket.io";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createApp } from "./app.js";
import { botService } from "./bot/botService.js";
import { gameRoundService } from "./services/gameRoundService.js";
import { realtimeService } from "./services/realtimeService.js";

async function main() {
  await prisma.$connect();

  // Auto-initialize default system settings and rooms on fresh database
  try {
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

    const existingSettings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
    if (!existingSettings) {
      console.log("Fresh database detected. Initializing default settings and rooms...");
      await prisma.systemSettings.create({
        data: {
          id: 1,
          botName: env.botName || "Zemen Bingo",
          welcomeBannerUrl: env.welcomeBannerUrl || "",
          supportUsername: env.supportUsername || "@Zemen_Bingo_support",
          instructionAm: defaultInstructionAm,
          instructionEn: defaultInstructionEn,
          welcomeBonusEnabled: true,
          welcomeBonusAmount: 10,
          referralBonusEnabled: true,
          referralBonusValue: 50,
        },
      });

      const roomCount = await prisma.room.count();
      if (roomCount === 0) {
        await prisma.room.createMany({
          data: [
            { nameAm: "መደብ 10", nameEn: "Play 10", stakeAmount: 10, houseCutPercent: 20, minPlayers: 2, cartelaPoolSize: 600, countdownSeconds: 30 },
            { nameAm: "መደብ 20", nameEn: "Play 20", stakeAmount: 20, houseCutPercent: 20, minPlayers: 2, cartelaPoolSize: 600, countdownSeconds: 30 },
          ],
        });
      }
      console.log("Database initialized successfully!");
    } else {
      const updates: Record<string, string> = {};
      if (
        !existingSettings.instructionAm ||
        existingSettings.instructionAm.includes("1. ከ1 እስከ 600 ካሉት ቁጥሮች ይምረጡ።")
      ) {
        updates.instructionAm = defaultInstructionAm;
        updates.instructionEn = defaultInstructionEn;
      }
      if (
        !existingSettings.botName ||
        existingSettings.botName.toLowerCase() === "tunnel bingo" ||
        existingSettings.botName.toLowerCase() === "bingo"
      ) {
        updates.botName = "Zemen Bingo";
      }
      if (
        !existingSettings.supportUsername ||
        existingSettings.supportUsername.toLowerCase() === "@tunnel_tech_solution" ||
        existingSettings.supportUsername.toLowerCase() === "tunnel_tech_solution"
      ) {
        updates.supportUsername = "@Zemen_Bingo_support";
      }
      // Reset any old cached Telegram file_id so the new Zemen Bingo bundled welcome_banner.jpg is uploaded fresh
      if (
        existingSettings.welcomeBannerUrl &&
        !existingSettings.welcomeBannerUrl.startsWith("http://") &&
        !existingSettings.welcomeBannerUrl.startsWith("https://")
      ) {
        updates.welcomeBannerUrl = "";
      }
      if (Object.keys(updates).length > 0) {
        await prisma.systemSettings.update({
          where: { id: 1 },
          data: updates,
        });
        console.log("Synced SystemSettings (Zemen Bingo branding & full instructions).");
      }
    }

    // Always ensure SUPER_ADMIN user exists for the configured admin Telegram ID
    if (env.superAdminTelegramId) {
      const adminTgId = BigInt(env.superAdminTelegramId);
      const existingAdmin = await prisma.user.findUnique({
        where: { telegramId: adminTgId },
      });
      const passwordHash = await bcrypt.hash(env.superAdminPassword, 10);
      const adminUsername = env.superAdminUsername || "admin";

      if (!existingAdmin) {
        await prisma.user.create({
          data: {
            telegramId: adminTgId,
            firstName: "tunnel tech private",
            username: adminUsername,
            role: "SUPER_ADMIN",
            language: "AM",
            passwordHash,
            referralCode: "ADMIN77",
            wallet: { create: { balance: 0 } },
          },
        });
        console.log(`Initialized SUPER_ADMIN account for Telegram ID ${env.superAdminTelegramId} (username: ${adminUsername}).`);
      } else {
        await prisma.user.update({
          where: { id: existingAdmin.id },
          data: {
            role: "SUPER_ADMIN",
            language: existingAdmin.language || "AM",
            passwordHash: existingAdmin.passwordHash || passwordHash,
            username: existingAdmin.username || adminUsername,
          },
        });
        console.log(`Synced SUPER_ADMIN account for Telegram ID ${env.superAdminTelegramId}.`);
      }
    }
  } catch (initErr) {
    console.error("Database auto-init warning:", initErr);
  }

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  botService.attachIO(io);
  gameRoundService.attachIO(io);
  realtimeService.attachIO(io);

  httpServer.listen(env.port, () => {
    console.log(`Bingo server listening on http://localhost:${env.port}`);
  });

  botService.start().catch((err) => {
    console.error("BotService start error:", err);
  });

  const shutdown = async () => {
    console.log("Shutting down gracefully...");
    await botService.stop();
    httpServer.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("Server fatal error:", err);
  process.exit(1);
});

