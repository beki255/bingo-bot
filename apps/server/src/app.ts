import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { createAdminRouter } from "./routes/adminRouter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  // Allow Telegram WebApp to embed the mini app in iframe
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      frameguard: false,
      contentSecurityPolicy: false,
    })
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        callback(null, true);
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get("/ping", (_req, res) => {
    res.type("text/plain").send("OK");
  });

  app.get(["/favicon.ico", "/favicon.svg"], (_req, res) => {
    const adminFav = path.resolve(__dirname, "../../admin-web/dist/favicon.svg");
    const miniFav = path.resolve(__dirname, "../../mini-app/dist/favicon.svg");
    const target = fs.existsSync(adminFav) ? adminFav : fs.existsSync(miniFav) ? miniFav : null;
    if (target) {
      res.type("image/svg+xml").sendFile(target);
    } else {
      res.status(204).end();
    }
  });

  // Admin Web Portal API
  app.use("/api/admin", createAdminRouter());

  app.get("/api/rooms", async (_req, res) => {
    try {
      const { prisma } = await import("./db/prisma.js");
      const rooms = await prisma.room.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { stakeAmount: "asc" }],
      });
      res.json({
        ok: true,
        rooms: rooms.map((r) => ({
          ...r,
          stakeAmount: Number(r.stakeAmount),
          houseCutPercent: Number(r.houseCutPercent),
        })),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: "FAILED_FETCH_ROOMS" });
    }
  });

  app.get("/api/rooms/:id/state", async (req, res) => {
    try {
      const { gameRoundService } = await import("./services/gameRoundService.js");
      const state = await gameRoundService.getRoomState(req.params.id);
      res.json({ ok: true, state });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || "FAILED_FETCH_STATE" });
    }
  });

  app.post("/api/rooms/:id/select", async (req, res) => {
    try {
      const { clientId, cards } = req.body;
      if (!clientId) {
        return res.status(400).json({ ok: false, error: "MISSING_CLIENT_ID" });
      }
      const { gameRoundService } = await import("./services/gameRoundService.js");
      await gameRoundService.setClientSelection(req.params.id, String(clientId), Array.isArray(cards) ? cards : []);
      res.json({ ok: true, pendingSelections: gameRoundService.getPendingSelections(req.params.id) });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || "FAILED_SELECT" });
    }
  });

  app.post("/api/rooms/:id/buy", async (req, res) => {
    try {
      const { gameRoundService } = await import("./services/gameRoundService.js");
      const { telegramId, cartelaNumbers } = req.body;
      if (!telegramId || !cartelaNumbers || !Array.isArray(cartelaNumbers)) {
        return res.status(400).json({ ok: false, error: "INVALID_PARAMETERS" });
      }
      const numericId = String(telegramId).replace(/\D/g, "");
      const tgId = BigInt(numericId.length > 0 ? numericId : "999001");
      const state = await gameRoundService.buyTickets({
        roomId: req.params.id,
        telegramId: tgId,
        cartelaNumbers,
      });
      res.json({ ok: true, state });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message || "FAILED_BUY_TICKETS" });
    }
  });

  app.post("/api/rooms/:id/claim-win", async (req, res) => {
    try {
      const { telegramId, prize } = req.body;
      const prizeAmount = Math.floor(Number(prize));
      if (!telegramId || isNaN(prizeAmount) || prizeAmount <= 0) {
        return res.status(400).json({ ok: false, error: "INVALID_PARAMETERS" });
      }
      const numericId = String(telegramId).replace(/\D/g, "");
      const tgId = BigInt(numericId.length > 0 ? numericId : "999001");
      const { prisma } = await import("./db/prisma.js");
      const { creditWinTx, centsToNumber, toCents } = await import("./services/walletService.js");
      const { gameRoundService } = await import("./services/gameRoundService.js");

      let user = await prisma.user.findUnique({
        where: { telegramId: tgId },
        include: { wallet: true },
      });
      if (!user) {
        const { findOrCreateTelegramUser } = await import("./services/userService.js");
        user = await findOrCreateTelegramUser({ telegramId: tgId, firstName: "Player " + String(tgId).slice(-4) });
      }
      if (!user) {
        return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
      }

      const round = await gameRoundService.getOrCreateActiveRound(req.params.id);
      let updatedBalance = 0;
      await prisma.$transaction(async (tx) => {
        const balAfter = await creditWinTx(tx, user.id, prizeAmount, round.id);
        updatedBalance = centsToNumber(toCents(balAfter));
      });

      res.json({ ok: true, newBalance: updatedBalance });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || "FAILED_CLAIM_WIN" });
    }
  });

  app.get("/api/wallet/balance", async (req, res) => {
    try {
      const telegramId = req.query.telegramId ? String(req.query.telegramId) : null;
      if (!telegramId) {
        return res.json({ ok: true, balance: 0, phoneNumber: null, isVerified: false });
      }
      const { prisma } = await import("./db/prisma.js");
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
        include: { wallet: true },
      });
      if (!user || !user.wallet) {
        return res.json({ ok: true, balance: 0, phoneNumber: null, isVerified: false });
      }
      const { centsToNumber, toCents } = await import("./services/walletService.js");
      const balance = centsToNumber(toCents(user.wallet.balance));
      return res.json({
        ok: true,
        balance,
        phoneNumber: user.phoneNumber,
        isVerified: Boolean(user.phoneNumber),
        firstName: user.firstName,
        username: user.username,
        language: user.language || "AM",
      });
    } catch (err) {
      return res.json({ ok: true, balance: 0, phoneNumber: null, isVerified: false });
    }
  });

  app.get("/api/wallet/transactions", async (req, res) => {
    try {
      const telegramId = req.query.telegramId ? String(req.query.telegramId) : null;
      if (!telegramId) {
        return res.json({ ok: true, transactions: [] });
      }
      const { prisma } = await import("./db/prisma.js");
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
      });
      if (!user) {
        return res.json({ ok: true, transactions: [] });
      }
      const txs = await prisma.walletTransaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 30,
      });
      return res.json({
        ok: true,
        transactions: txs.map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount: Number(tx.amount),
          balanceAfter: Number(tx.balanceAfter),
          referenceType: tx.referenceType,
          referenceId: tx.referenceId,
          note: tx.note,
          createdAt: tx.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      return res.json({ ok: true, transactions: [] });
    }
  });

  app.get("/api/user/profile", async (req, res) => {
    try {
      const telegramId = req.query.telegramId ? String(req.query.telegramId) : null;
      if (!telegramId) {
        return res.json({
          ok: true,
          profile: {
            name: "",
            username: null,
            phoneNumber: null,
            balance: 0,
            gamesWon: 0,
            totalGames: 0,
            totalInvites: 0,
            totalEarnings: 0,
            referralCode: "",
          },
        });
      }
      const { prisma } = await import("./db/prisma.js");
      const { centsToNumber, toCents } = await import("./services/walletService.js");
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
        include: {
          wallet: true,
          _count: {
            select: { referrals: true, tickets: true },
          },
        },
      });

      if (!user) {
        return res.json({
          ok: true,
          profile: {
            name: "Bingo Player",
            username: null,
            phoneNumber: null,
            balance: 0,
            gamesWon: 0,
            totalGames: 0,
            totalInvites: 0,
            totalEarnings: 0,
            referralCode: "TUNNEL",
          },
        });
      }

      const wonTickets = await prisma.gameTicket.count({
        where: { userId: user.id, status: "WINNER" },
      });

      const winTxs = await prisma.walletTransaction.findMany({
        where: {
          userId: user.id,
          type: { in: ["WIN", "WELCOME_BONUS", "REFERRAL_BONUS"] },
        },
        select: { amount: true },
      });
      const totalEarnings = winTxs.reduce((acc, t) => acc + Number(t.amount), 0);
      const balance = user.wallet ? centsToNumber(toCents(user.wallet.balance)) : 0;
      const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "Bingo Player";

      return res.json({
        ok: true,
        profile: {
          id: user.id,
          name: displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          phoneNumber: user.phoneNumber,
          balance,
          gamesWon: wonTickets,
          totalGames: user._count.tickets,
          totalInvites: user._count.referrals,
          totalEarnings,
          referralCode: user.referralCode,
          language: user.language || "AM",
        },
      });
    } catch (err: any) {
      console.error("Profile fetch error:", err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/user/game-history", async (req, res) => {
    try {
      const telegramId = req.query.telegramId ? String(req.query.telegramId) : null;
      if (!telegramId) {
        return res.json({ ok: true, totalGames: 0, games: [] });
      }
      const { prisma } = await import("./db/prisma.js");
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
      });
      if (!user) {
        return res.json({ ok: true, totalGames: 0, games: [] });
      }

      const tickets = await prisma.gameTicket.findMany({
        where: { userId: user.id },
        include: {
          gameRound: {
            include: {
              tickets: { select: { id: true, status: true } },
            },
          },
        },
        orderBy: { purchasedAt: "desc" },
        take: 30,
      });

      const totalGames = await prisma.gameTicket.count({
        where: { userId: user.id },
      });

      const games = tickets.map((t) => {
        const round = t.gameRound;
        const winnersCount = round.tickets.filter((x) => x.status === "WINNER").length || 1;
        const totalPrize = Number(round.prizePool) || Number(t.pricePaid) * round.tickets.length * 0.8;
        return {
          id: t.id,
          gameId: "Game " + (round.id.length > 8 ? round.id.substring(round.id.length - 8).toUpperCase() : round.id.toUpperCase()),
          date: t.purchasedAt.toISOString(),
          isWinner: t.status === "WINNER",
          stake: Number(t.pricePaid),
          cartelaNumber: t.cartelaNumber,
          prize: Math.round(totalPrize),
          winnersCount,
        };
      });

      return res.json({
        ok: true,
        totalGames,
        games,
      });
    } catch (err: any) {
      console.error("Game history error:", err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get("/api/settings", async (_req, res) => {
    try {
      const { getSystemSettings } = await import("./services/walletService.js");
      const settings = await getSystemSettings();
      res.json({
        ok: true,
        settings: {
          botName: settings.botName,
          welcomeBannerUrl: settings.welcomeBannerUrl,
          supportUsername: settings.supportUsername,
          instructionAm: settings.instructionAm,
          instructionEn: settings.instructionEn,
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: "FAILED_FETCH_SETTINGS" });
    }
  });

  // Serve audio sound assets directly
  const candidateSounds = [
    path.resolve(__dirname, "../../mini-app/dist/sounds"),
    path.resolve(__dirname, "../../mini-app/public/sounds"),
    path.resolve(__dirname, "../../../sounds"),
  ];
  for (const sPath of candidateSounds) {
    if (fs.existsSync(sPath)) {
      app.use("/sounds", express.static(sPath));
      break;
    }
  }

  // Serve built Admin Web Portal at /admin
  const adminWebDist = path.resolve(__dirname, "../../admin-web/dist");
  if (fs.existsSync(adminWebDist)) {
    app.use("/admin", express.static(adminWebDist));
    app.use("/admin", (_req, res) => {
      res.sendFile(path.join(adminWebDist, "index.html"));
    });
  }

  // Serve built Mini-App frontend directly
  const miniAppDist = path.resolve(__dirname, "../../mini-app/dist");
  if (fs.existsSync(miniAppDist)) {
    app.use(express.static(miniAppDist));
    app.use((req, res, next) => {
      if (
        req.path.startsWith("/api") ||
        req.path.startsWith("/admin") ||
        req.path.startsWith("/health") ||
        req.path.startsWith("/ping") ||
        req.path.startsWith("/socket.io") ||
        req.path.startsWith("/sounds")
      ) {
        return next();
      }
      res.sendFile(path.join(miniAppDist, "index.html"));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled express error:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  });

  return app;
}

