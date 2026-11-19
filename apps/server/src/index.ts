import http from "node:http";
import bcrypt from "bcryptjs";
import { Server as SocketIOServer } from "socket.io";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createApp } from "./app.js";
import { botService } from "./bot/botService.js";
import { gameRoundService } from "./services/gameRoundService.js";

async function main() {
  await prisma.$connect();

  // Auto-initialize default system settings and rooms on fresh database
  try {
    const settingsCount = await prisma.systemSettings.count();
    if (settingsCount === 0) {
      console.log("Fresh database detected. Initializing default settings and rooms...");
      await prisma.systemSettings.create({
        data: {
          id: 1,
          botName: env.botName || "Tunnel Bingo",
          welcomeBannerUrl: env.welcomeBannerUrl || "",
          supportUsername: env.supportUsername || "@tunnel_tech_solution",
          instructionAm: "🃏 የካርቴላ ምርጫ\n\n1. ከ1 እስከ 600 ካሉት ቁጥሮች ይምረጡ።\n2. ቆጠራው ሲያልቅ ጨዋታው ይጀምራል።",
          instructionEn: "🃏 Choosing Your Cartela\n\n1. Pick from 1 to 600.\n2. Game starts when countdown ends.",
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
    }

    // Always ensure SUPER_ADMIN user exists and has web portal credentials initialized
    if (env.superAdminTelegramId) {
      const adminTgId = BigInt(env.superAdminTelegramId);
      const existingAdmin = await prisma.user.findUnique({ where: { telegramId: adminTgId } });
      if (!existingAdmin) {
        const passwordHash = await bcrypt.hash(env.superAdminPassword, 10);
        await prisma.user.create({
          data: {
            telegramId: adminTgId,
            firstName: "Super Admin",
            username: env.superAdminUsername || "admin",
            role: "SUPER_ADMIN",
            passwordHash,
            referralCode: "ADMIN77",
            wallet: { create: { balance: 0 } },
          },
        });
        console.log(`Initialized SUPER_ADMIN account (username: ${env.superAdminUsername || "admin"}).`);
      } else {
        const updates: { role?: "SUPER_ADMIN"; passwordHash?: string; username?: string } = {};
        if (existingAdmin.role !== "SUPER_ADMIN") {
          updates.role = "SUPER_ADMIN";
        }
        if (!existingAdmin.passwordHash) {
          updates.passwordHash = await bcrypt.hash(env.superAdminPassword, 10);
        }
        if (!existingAdmin.username) {
          updates.username = env.superAdminUsername || "admin";
        }
        if (Object.keys(updates).length > 0) {
          await prisma.user.update({
            where: { id: existingAdmin.id },
            data: updates,
          });
          console.log(`Synced SUPER_ADMIN web credentials (username: ${updates.username || existingAdmin.username}).`);
        }
      }
    }
  } catch (initErr) {
    console.error("Database auto-init warning:", initErr);
  }

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.corsOrigins,
      credentials: true,
    },
  });

  botService.attachIO(io);
  gameRoundService.attachIO(io);
  await botService.start();

  httpServer.listen(env.port, () => {
    console.log(`Bingo server listening on http://localhost:${env.port}`);
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

