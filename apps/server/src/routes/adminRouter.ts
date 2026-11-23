import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { Prisma, type Language, type RequestStatus, type TxType, type UserRole, type WithdrawStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { recordAuditLog } from "../services/auditService.js";
import {
  adminAdjustWallet,
  approveDepositRequest,
  getSystemSettings,
  markWithdrawPaid,
  rejectDepositRequest,
  rejectWithdrawRequest,
} from "../services/walletService.js";
import { botService } from "../bot/botService.js";
import { realtimeService } from "../services/realtimeService.js";

interface AdminJwtPayload {
  userId: string;
  role: UserRole;
  loginMethod: "password" | "otp";
}

interface AuthedAdmin {
  id: string;
  telegramId: bigint;
  firstName: string;
  lastName: string | null;
  username: string | null;
  phoneNumber: string | null;
  role: UserRole;
  loginMethod: "password" | "otp";
}

declare global {
  namespace Express {
    interface Request {
      admin?: AuthedAdmin;
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isAdminRole(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "CASHIER";
}

function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] ?? "" : val ?? "";
}

function serializeAdminProfile(u: {
  id: string;
  telegramId: bigint;
  firstName: string;
  lastName: string | null;
  username: string | null;
  phoneNumber: string | null;
  role: UserRole;
}) {
  return {
    id: u.id,
    telegramId: u.telegramId.toString(),
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    phoneNumber: u.phoneNumber,
    role: u.role,
  };
}

function signAdminToken(payload: AdminJwtPayload): string {
  return jwt.sign(payload, env.adminJwtSecret, { expiresIn: "24h" });
}

function extractToken(req: express.Request): string | null {
  const auth = req.header("authorization") || req.header("Authorization") || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  const qToken = typeof req.query.token === "string" ? req.query.token.trim() : "";
  return qToken || null;
}

async function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
      return;
    }
    const decoded = jwt.verify(token, env.adminJwtSecret) as AdminJwtPayload;
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || user.isBanned || !isAdminRole(user.role)) {
      res.status(401).json({ ok: false, error: "ADMIN_SESSION_INVALID" });
      return;
    }
    req.admin = {
      id: user.id,
      telegramId: user.telegramId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      phoneNumber: user.phoneNumber,
      role: user.role,
      loginMethod: decoded.loginMethod || "password",
    };
    next();
  } catch {
    res.status(401).json({ ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  }
}

function requireSuperAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.admin || req.admin.role !== "SUPER_ADMIN") {
    res.status(403).json({ ok: false, error: "SUPER_ADMIN_REQUIRED" });
    return;
  }
  next();
}

export function createAdminRouter() {
  const router = express.Router();

  // =========================================================================
  // 1. AUTHENTICATION (Password + Telegram OTP)
  // =========================================================================
  const loginSchema = z.discriminatedUnion("loginMethod", [
    z.object({
      loginMethod: z.literal("password"),
      identifier: z.string().trim().min(1),
      password: z.string().min(1),
    }),
    z.object({
      loginMethod: z.literal("otp"),
      otpCode: z.string().trim().min(6).max(6),
    }),
  ]);

  router.post("/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "INVALID_LOGIN_PAYLOAD" });
        return;
      }

      if (parsed.data.loginMethod === "otp") {
        const otp = await prisma.adminOtpCode.findFirst({
          where: {
            code: parsed.data.otpCode,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          include: { user: true },
          orderBy: { createdAt: "desc" },
        });
        if (!otp || !otp.user || otp.user.isBanned || !isAdminRole(otp.user.role)) {
          res.status(401).json({ ok: false, error: "Invalid or expired 6-digit OTP code." });
          return;
        }
        await prisma.adminOtpCode.update({
          where: { id: otp.id },
          data: { usedAt: new Date() },
        });
        const token = signAdminToken({
          userId: otp.user.id,
          role: otp.user.role,
          loginMethod: "otp",
        });
        await recordAuditLog(prisma, {
          actorId: otp.user.id,
          actorRole: otp.user.role,
          action: "ADMIN_WEB_LOGIN_OTP",
          targetType: "User",
          targetId: otp.user.id,
        });
        res.json({ ok: true, token, admin: serializeAdminProfile(otp.user) });
        return;
      }

      // Password login: match username, phoneNumber, telegramId, or configured superAdminUsername
      const rawId = parsed.data.identifier.replace(/^@/, "").trim();
      const orFilters: Prisma.UserWhereInput[] = [
        { username: { equals: rawId, mode: "insensitive" } },
        { phoneNumber: rawId },
      ];
      if (/^\d+$/.test(rawId)) {
        try {
          orFilters.push({ telegramId: BigInt(rawId) });
        } catch {
          // ignore invalid bigint
        }
      }
      if (
        env.superAdminTelegramId &&
        rawId.toLowerCase() === env.superAdminUsername.toLowerCase()
      ) {
        try {
          orFilters.push({ telegramId: BigInt(env.superAdminTelegramId) });
        } catch {
          // ignore
        }
      }

      const candidates = await prisma.user.findMany({
        where: {
          role: { in: ["SUPER_ADMIN", "CASHIER"] },
          isBanned: false,
          OR: orFilters,
        },
        take: 5,
      });

      let matchedUser = null;
      for (const candidate of candidates) {
        if (candidate.passwordHash) {
          const valid = await bcrypt.compare(parsed.data.password, candidate.passwordHash);
          if (valid) {
            matchedUser = candidate;
            break;
          }
        }
      }

      if (!matchedUser) {
        res.status(401).json({ ok: false, error: "Invalid username/identifier or password." });
        return;
      }

      const token = signAdminToken({
        userId: matchedUser.id,
        role: matchedUser.role,
        loginMethod: "password",
      });

      await recordAuditLog(prisma, {
        actorId: matchedUser.id,
        actorRole: matchedUser.role,
        action: "ADMIN_WEB_LOGIN_PASSWORD",
        targetType: "User",
        targetId: matchedUser.id,
      });

      res.json({ ok: true, token, admin: serializeAdminProfile(matchedUser) });
    } catch (err) {
      console.error("Admin login error:", err);
      res.status(500).json({ ok: false, error: "LOGIN_FAILED" });
    }
  });

  // Protect all routes below with JWT
  router.use(requireAdmin);

  router.get("/auth/me", (req, res) => {
    res.json({ ok: true, admin: serializeAdminProfile(req.admin!) });
  });

  // Change own admin username and/or password
  const updateCredentialsSchema = z.object({
    username: z.string().trim().min(3).max(40).optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(6).max(100).optional(),
  });

  router.put("/auth/credentials", async (req, res) => {
    try {
      const parsed = updateCredentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "Username must be 3+ chars and password 6+ chars." });
        return;
      }
      const adminUser = await prisma.user.findUnique({ where: { id: req.admin!.id } });
      if (!adminUser) {
        res.status(404).json({ ok: false, error: "ADMIN_NOT_FOUND" });
        return;
      }

      const dataToUpdate: Prisma.UserUpdateInput = {};

      if (parsed.data.username) {
        const cleanUsername = parsed.data.username.replace(/^@/, "").trim();
        const taken = await prisma.user.findFirst({
          where: {
            id: { not: adminUser.id },
            username: { equals: cleanUsername, mode: "insensitive" },
            role: { in: ["SUPER_ADMIN", "CASHIER"] },
          },
        });
        if (taken) {
          res.status(409).json({ ok: false, error: "That admin username is already in use." });
          return;
        }
        dataToUpdate.username = cleanUsername;
      }

      if (parsed.data.newPassword) {
        // Require currentPassword if the user has a passwordHash AND logged in with password
        if (adminUser.passwordHash && req.admin!.loginMethod === "password") {
          if (!parsed.data.currentPassword) {
            res.status(400).json({ ok: false, error: "Current password is required to set a new password." });
            return;
          }
          const matches = await bcrypt.compare(parsed.data.currentPassword, adminUser.passwordHash);
          if (!matches) {
            res.status(400).json({ ok: false, error: "Current password is incorrect." });
            return;
          }
        }
        dataToUpdate.passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
      }

      if (Object.keys(dataToUpdate).length === 0) {
        res.status(400).json({ ok: false, error: "Nothing to update." });
        return;
      }

      const updated = await prisma.user.update({
        where: { id: adminUser.id },
        data: dataToUpdate,
      });

      await recordAuditLog(prisma, {
        actorId: adminUser.id,
        actorRole: adminUser.role,
        action: "ADMIN_UPDATE_OWN_CREDENTIALS",
        targetType: "User",
        targetId: adminUser.id,
        after: {
          username: updated.username,
          passwordChanged: Boolean(parsed.data.newPassword),
        },
      });

      res.json({ ok: true, admin: serializeAdminProfile(updated) });
    } catch (err) {
      console.error("Update credentials error:", err);
      res.status(500).json({ ok: false, error: "FAILED_UPDATE_CREDENTIALS" });
    }
  });

  // =========================================================================
  // 2. TELEGRAM RECEIPT IMAGE PROXY
  // =========================================================================
  router.get("/telegram-file/:fileId", async (req, res) => {
    try {
      const fileId = paramStr(req.params.fileId);
      if (!fileId) {
        res.status(400).end();
        return;
      }
      const result = await botService.getTelegramFileBuffer(fileId);
      if (!result) {
        res.status(404).json({ ok: false, error: "FILE_NOT_FOUND" });
        return;
      }
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(result.buffer);
    } catch {
      res.status(500).end();
    }
  });

  // =========================================================================
  // 3. DASHBOARD METRICS & ANALYTICS
  // =========================================================================
  router.get("/dashboard", async (_req, res) => {
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [
        totalUsers,
        verifiedUsers,
        bannedUsers,
        pendingDeposits,
        pendingWithdrawals,
        todayDepAgg,
        todayWdAgg,
        todayRoundAgg,
        allTimeDepAgg,
        allTimeWdAgg,
        allTimeRoundAgg,
        walletLiabilityAgg,
        activeRoundsCount,
        totalGamesFinished,
        recentDeposits,
        recentWithdrawals,
        rooms,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { phoneNumber: { not: null } } }),
        prisma.user.count({ where: { isBanned: true } }),
        prisma.depositRequest.count({ where: { status: "PENDING" } }),
        prisma.withdrawRequest.count({ where: { status: "PENDING" } }),
        prisma.depositRequest.aggregate({
          where: { status: "APPROVED", reviewedAt: { gte: startOfToday } },
          _sum: { amount: true },
        }),
        prisma.withdrawRequest.aggregate({
          where: { status: "PAID", reviewedAt: { gte: startOfToday } },
          _sum: { amount: true },
        }),
        prisma.gameRound.aggregate({
          where: { status: "FINISHED", endedAt: { gte: startOfToday } },
          _sum: { houseCutAmount: true, totalPot: true },
        }),
        prisma.depositRequest.aggregate({
          where: { status: "APPROVED" },
          _sum: { amount: true },
        }),
        prisma.withdrawRequest.aggregate({
          where: { status: "PAID" },
          _sum: { amount: true },
        }),
        prisma.gameRound.aggregate({
          where: { status: "FINISHED" },
          _sum: { houseCutAmount: true, totalPot: true },
        }),
        prisma.wallet.aggregate({
          _sum: { balance: true, lockedBalance: true },
        }),
        prisma.gameRound.count({
          where: { status: { in: ["WAITING", "COUNTDOWN", "RUNNING", "CLAIM_WINDOW"] } },
        }),
        prisma.gameRound.count({ where: { status: "FINISHED" } }),
        prisma.depositRequest.findMany({
          orderBy: { createdAt: "desc" },
          take: 6,
          include: { user: true, paymentAccount: true },
        }),
        prisma.withdrawRequest.findMany({
          orderBy: { createdAt: "desc" },
          take: 6,
          include: { user: true },
        }),
        prisma.room.findMany({
          orderBy: [{ sortOrder: "asc" }, { stakeAmount: "asc" }],
          include: {
            rounds: {
              where: { status: { in: ["WAITING", "COUNTDOWN", "RUNNING", "CLAIM_WINDOW"] } },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { _count: { select: { tickets: true } } },
            },
          },
        }),
      ]);

      res.json({
        ok: true,
        metrics: {
          totalUsers,
          verifiedUsers,
          bannedUsers,
          pendingDeposits,
          pendingWithdrawals,
          todayDeposits: Number(todayDepAgg._sum.amount ?? 0),
          todayWithdrawals: Number(todayWdAgg._sum.amount ?? 0),
          todayHouseCut: Number(todayRoundAgg._sum.houseCutAmount ?? 0),
          todayTotalPot: Number(todayRoundAgg._sum.totalPot ?? 0),
          allTimeDeposits: Number(allTimeDepAgg._sum.amount ?? 0),
          allTimeWithdrawals: Number(allTimeWdAgg._sum.amount ?? 0),
          allTimeHouseCut: Number(allTimeRoundAgg._sum.houseCutAmount ?? 0),
          allTimeTotalPot: Number(allTimeRoundAgg._sum.totalPot ?? 0),
          totalWalletBalance: Number(walletLiabilityAgg._sum.balance ?? 0),
          totalLockedBalance: Number(walletLiabilityAgg._sum.lockedBalance ?? 0),
          activeRoundsCount,
          totalGamesFinished,
        },
        recentDeposits: recentDeposits.map((d) => ({
          id: d.id,
          amount: Number(d.amount),
          status: d.status,
          transactionRef: d.transactionRef,
          provider: d.paymentAccount.provider,
          userName: `${d.user.firstName}${d.user.lastName ? ` ${d.user.lastName}` : ""}`,
          userPhone: d.user.phoneNumber,
          createdAt: d.createdAt.toISOString(),
        })),
        recentWithdrawals: recentWithdrawals.map((w) => ({
          id: w.id,
          amount: Number(w.amount),
          status: w.status,
          provider: w.provider,
          accountName: w.accountName,
          accountNumber: w.accountNumber,
          userName: `${w.user.firstName}${w.user.lastName ? ` ${w.user.lastName}` : ""}`,
          createdAt: w.createdAt.toISOString(),
        })),
        activeRooms: rooms.map((r) => {
          const active = r.rounds[0];
          return {
            id: r.id,
            nameAm: r.nameAm,
            nameEn: r.nameEn,
            stakeAmount: Number(r.stakeAmount),
            isActive: r.isActive,
            currentRoundStatus: active?.status || "IDLE",
            currentTickets: active?._count.tickets || 0,
            currentPot: active ? Number(active.totalPot) : 0,
          };
        }),
      });
    } catch (err) {
      console.error("Admin dashboard error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_DASHBOARD" });
    }
  });

  // =========================================================================
  // 4. USERS MANAGEMENT (List, Detail, Adjust Balance, Ban, Role, Direct Msg)
  // =========================================================================
  router.get("/users", async (req, res) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const filter = typeof req.query.filter === "string" ? req.query.filter : "all";
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(10, Number(req.query.limit || 25)));
      const skip = (page - 1) * limit;

      const where: Prisma.UserWhereInput = {};

      if (filter === "verified") {
        where.phoneNumber = { not: null };
      } else if (filter === "banned") {
        where.isBanned = true;
      } else if (filter === "staff") {
        where.role = { in: ["SUPER_ADMIN", "CASHIER"] };
      }

      if (search) {
        const clean = search.replace(/^@/, "");
        const orConditions: Prisma.UserWhereInput[] = [
          { firstName: { contains: clean, mode: "insensitive" } },
          { lastName: { contains: clean, mode: "insensitive" } },
          { username: { contains: clean, mode: "insensitive" } },
          { phoneNumber: { contains: clean, mode: "insensitive" } },
          { referralCode: { contains: clean, mode: "insensitive" } },
        ];
        if (/^\d+$/.test(clean)) {
          try {
            orConditions.push({ telegramId: BigInt(clean) });
          } catch {
            // ignore
          }
        }
        where.OR = orConditions;
      }

      const orderBy: Prisma.UserOrderByWithRelationInput =
        filter === "rich" ? { wallet: { balance: "desc" } } : { createdAt: "desc" };

      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            wallet: true,
            _count: {
              select: {
                referrals: true,
                tickets: true,
                depositRequests: true,
                withdrawRequests: true,
              },
            },
          },
        }),
      ]);

      res.json({
        ok: true,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        users: users.map((u) => ({
          id: u.id,
          telegramId: u.telegramId.toString(),
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username,
          phoneNumber: u.phoneNumber,
          language: u.language,
          role: u.role,
          isBanned: u.isBanned,
          referralCode: u.referralCode,
          welcomeBonusClaimed: u.welcomeBonusClaimed,
          hasWebPassword: Boolean(u.passwordHash),
          balance: Number(u.wallet?.balance ?? 0),
          lockedBalance: Number(u.wallet?.lockedBalance ?? 0),
          referralsCount: u._count.referrals,
          ticketsCount: u._count.tickets,
          depositsCount: u._count.depositRequests,
          withdrawalsCount: u._count.withdrawRequests,
          createdAt: u.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      console.error("Admin users list error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_USERS" });
    }
  });

  router.get("/users/:id", async (req, res) => {
    try {
      const userId = paramStr(req.params.id);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
          referredBy: {
            select: { id: true, firstName: true, username: true, phoneNumber: true },
          },
          referrals: {
            orderBy: { createdAt: "desc" },
            take: 25,
            select: {
              id: true,
              firstName: true,
              phoneNumber: true,
              createdAt: true,
            },
          },
          transactions: {
            orderBy: { createdAt: "desc" },
            take: 50,
          },
          tickets: {
            orderBy: { purchasedAt: "desc" },
            take: 30,
            include: {
              gameRound: {
                include: { room: { select: { nameAm: true, nameEn: true, stakeAmount: true } } },
              },
            },
          },
          depositRequests: {
            orderBy: { createdAt: "desc" },
            take: 15,
            include: { paymentAccount: { select: { provider: true, accountNumber: true } } },
          },
          withdrawRequests: {
            orderBy: { createdAt: "desc" },
            take: 15,
          },
        },
      });

      if (!user) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }

      const [depSum, wdSum, betSum, winSum] = await Promise.all([
        prisma.depositRequest.aggregate({
          where: { userId, status: "APPROVED" },
          _sum: { amount: true },
        }),
        prisma.withdrawRequest.aggregate({
          where: { userId, status: "PAID" },
          _sum: { amount: true },
        }),
        prisma.gameTicket.aggregate({
          where: { userId, status: { not: "REFUNDED" } },
          _sum: { pricePaid: true },
        }),
        prisma.gameTicket.aggregate({
          where: { userId, status: "WINNER" },
          _sum: { prizeWon: true },
        }),
      ]);

      res.json({
        ok: true,
        user: {
          id: user.id,
          telegramId: user.telegramId.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          phoneNumber: user.phoneNumber,
          language: user.language,
          role: user.role,
          isBanned: user.isBanned,
          referralCode: user.referralCode,
          welcomeBonusClaimed: user.welcomeBonusClaimed,
          hasWebPassword: Boolean(user.passwordHash),
          balance: Number(user.wallet?.balance ?? 0),
          lockedBalance: Number(user.wallet?.lockedBalance ?? 0),
          createdAt: user.createdAt.toISOString(),
          referredBy: user.referredBy,
          referrals: user.referrals.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
          })),
          stats: {
            totalDeposited: Number(depSum._sum.amount ?? 0),
            totalWithdrawn: Number(wdSum._sum.amount ?? 0),
            totalBet: Number(betSum._sum.pricePaid ?? 0),
            totalWon: Number(winSum._sum.prizeWon ?? 0),
          },
          transactions: user.transactions.map((t) => ({
            id: t.id,
            type: t.type,
            amount: Number(t.amount),
            balanceAfter: Number(t.balanceAfter),
            note: t.note,
            referenceType: t.referenceType,
            createdAt: t.createdAt.toISOString(),
          })),
          tickets: user.tickets.map((t) => ({
            id: t.id,
            roundId: t.gameRoundId,
            roomName: t.gameRound.room.nameAm,
            cartelaNumber: t.cartelaNumber,
            status: t.status,
            pricePaid: Number(t.pricePaid),
            prizeWon: Number(t.prizeWon),
            purchasedAt: t.purchasedAt.toISOString(),
          })),
          deposits: user.depositRequests.map((d) => ({
            id: d.id,
            amount: Number(d.amount),
            status: d.status,
            provider: d.paymentAccount.provider,
            transactionRef: d.transactionRef,
            createdAt: d.createdAt.toISOString(),
          })),
          withdrawals: user.withdrawRequests.map((w) => ({
            id: w.id,
            amount: Number(w.amount),
            status: w.status,
            provider: w.provider,
            accountNumber: w.accountNumber,
            createdAt: w.createdAt.toISOString(),
          })),
        },
      });
    } catch (err) {
      console.error("Admin user detail error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_USER_DETAIL" });
    }
  });

  const adjustBalanceSchema = z.object({
    amount: z.number().refine((v) => Number.isFinite(v) && v !== 0, "Amount must be non-zero"),
    note: z.string().trim().min(2).max(250),
    notifyUser: z.boolean().optional().default(true),
  });

  router.post("/users/:id/adjust-balance", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = adjustBalanceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "Invalid adjustment amount or note." });
        return;
      }

      const targetUser = await prisma.user.findUnique({ where: { id: paramStr(req.params.id) } });
      if (!targetUser) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }

      const wallet = await adminAdjustWallet(
        targetUser.id,
        parsed.data.amount,
        req.admin!.id,
        req.admin!.role,
        parsed.data.note
      );

      if (parsed.data.notifyUser) {
        const lang: Language = targetUser.language || "AM";
        const isCredit = parsed.data.amount > 0;
        const absAmt = Math.abs(parsed.data.amount).toFixed(2);
        const msg =
          lang === "AM"
            ? isCredit
              ? `💰 አድሚን <b>+${absAmt} ብር</b> ወደ Wallet-ዎ ጨምሮልዎታል።\n📝 ምክንያት፡ ${escapeHtml(parsed.data.note)}\n💵 አዲስ ቀሪ ሂሳብ፡ <b>${wallet.balance.toFixed(2)} ብር</b>`
              : `💸 አድሚን <b>-${absAmt} ብር</b> ከWallet-ዎ ቀንሷል።\n📝 ምክንያት፡ ${escapeHtml(parsed.data.note)}\n💵 አዲስ ቀሪ ሂሳብ፡ <b>${wallet.balance.toFixed(2)} ብር</b>`
            : isCredit
              ? `💰 Admin credited <b>+${absAmt} ETB</b> to your wallet.\n📝 Note: ${escapeHtml(parsed.data.note)}\n💵 New balance: <b>${wallet.balance.toFixed(2)} ETB</b>`
              : `💸 Admin deducted <b>-${absAmt} ETB</b> from your wallet.\n📝 Note: ${escapeHtml(parsed.data.note)}\n💵 New balance: <b>${wallet.balance.toFixed(2)} ETB</b>`;
        await botService.sendSafeMessage(targetUser.telegramId, msg);
      }

      res.json({ ok: true, newBalance: wallet.balance, lockedBalance: wallet.lockedBalance });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "FAILED_ADJUST_BALANCE";
      res.status(400).json({ ok: false, error: msg });
    }
  });

  const banSchema = z.object({
    isBanned: z.boolean(),
    reason: z.string().trim().max(250).optional(),
  });

  router.post("/users/:id/ban", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = banSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "INVALID_BAN_PAYLOAD" });
        return;
      }

      const target = await prisma.user.findUnique({ where: { id: paramStr(req.params.id) } });
      if (!target) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      if (target.id === req.admin!.id) {
        res.status(400).json({ ok: false, error: "Cannot ban your own admin account." });
        return;
      }

      const updated = await prisma.user.update({
        where: { id: target.id },
        data: { isBanned: parsed.data.isBanned },
      });

      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: parsed.data.isBanned ? "BAN_USER" : "UNBAN_USER",
        targetType: "User",
        targetId: target.id,
        before: { isBanned: target.isBanned },
        after: { isBanned: updated.isBanned, reason: parsed.data.reason || null },
      });

      realtimeService.notifyAdminEvent({ type: "user_updated", payload: { userId: target.id } });

      const lang: Language = target.language || "AM";
      const notice = parsed.data.isBanned
        ? lang === "AM"
          ? `🚫 አካውንትዎ በአስተዳዳሪ ታግዷል።${parsed.data.reason ? `\nምክንያት፡ ${escapeHtml(parsed.data.reason)}` : ""}`
          : `🚫 Your account has been suspended by admin.${parsed.data.reason ? `\nReason: ${escapeHtml(parsed.data.reason)}` : ""}`
        : lang === "AM"
          ? `✅ የአካውንትዎ እገዳ ተነስቷል። አሁን መጫወት ይችላሉ!`
          : `✅ Your account ban has been lifted. You can play again!`;
      await botService.sendSafeMessage(target.telegramId, notice);

      res.json({ ok: true, isBanned: updated.isBanned });
    } catch (err) {
      console.error("Ban user error:", err);
      res.status(500).json({ ok: false, error: "FAILED_UPDATE_BAN" });
    }
  });

  // Super Admin: manage staff roles & set web username/password for cashiers/admins
  const roleSchema = z.object({
    role: z.enum(["PLAYER", "CASHIER", "SUPER_ADMIN"]),
    username: z.string().trim().min(3).max(40).optional(),
    password: z.string().min(6).max(100).optional(),
  });

  router.post("/users/:id/role", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = roleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "Invalid role or credentials format." });
        return;
      }
      const target = await prisma.user.findUnique({ where: { id: paramStr(req.params.id) } });
      if (!target) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      if (target.id === req.admin!.id && parsed.data.role !== "SUPER_ADMIN") {
        res.status(400).json({ ok: false, error: "You cannot demote yourself from SUPER_ADMIN." });
        return;
      }

      const data: Prisma.UserUpdateInput = { role: parsed.data.role };
      if (parsed.data.username) {
        data.username = parsed.data.username.replace(/^@/, "").trim();
      }
      if (parsed.data.password) {
        data.passwordHash = await bcrypt.hash(parsed.data.password, 10);
      }

      const updated = await prisma.user.update({ where: { id: target.id }, data });

      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "UPDATE_USER_ROLE",
        targetType: "User",
        targetId: target.id,
        before: { role: target.role, username: target.username },
        after: {
          role: updated.role,
          username: updated.username,
          passwordSet: Boolean(parsed.data.password),
        },
      });

      realtimeService.notifyAdminEvent({ type: "user_updated", payload: { userId: target.id } });

      res.json({ ok: true, role: updated.role, username: updated.username });
    } catch (err) {
      console.error("Update user role error:", err);
      res.status(500).json({ ok: false, error: "FAILED_UPDATE_ROLE" });
    }
  });

  // Direct Telegram message to a specific user
  const directMsgSchema = z.object({
    message: z.string().trim().min(1).max(3500),
  });

  router.post("/users/:id/message", async (req, res) => {
    try {
      const parsed = directMsgSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "Message cannot be empty." });
        return;
      }
      const target = await prisma.user.findUnique({ where: { id: paramStr(req.params.id) } });
      if (!target) {
        res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
        return;
      }
      const result = await botService.sendDirectMessage(
        target.telegramId,
        `📩 <b>መልዕክት ከአስተዳዳሪ (Admin):</b>\n\n${escapeHtml(parsed.data.message)}`
      );
      if (!result.ok) {
        res.status(502).json({ ok: false, error: result.error || "Telegram delivery failed." });
        return;
      }
      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "DIRECT_MESSAGE_USER",
        targetType: "User",
        targetId: target.id,
        after: { preview: parsed.data.message.slice(0, 200) },
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("Direct message error:", err);
      res.status(500).json({ ok: false, error: "FAILED_SEND_MESSAGE" });
    }
  });

  // =========================================================================
  // 5. DEPOSITS QUEUE (List, Approve, Reject)
  // =========================================================================
  router.get("/deposits", async (req, res) => {
    try {
      const statusParam = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "PENDING";
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(10, Number(req.query.limit || 25)));
      const skip = (page - 1) * limit;

      const where: Prisma.DepositRequestWhereInput = {};
      if (statusParam === "PENDING" || statusParam === "APPROVED" || statusParam === "REJECTED") {
        where.status = statusParam as RequestStatus;
      }
      if (search) {
        where.OR = [
          { transactionRef: { contains: search, mode: "insensitive" } },
          { receiptText: { contains: search, mode: "insensitive" } },
          { user: { firstName: { contains: search, mode: "insensitive" } } },
          { user: { phoneNumber: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [total, deposits] = await Promise.all([
        prisma.depositRequest.count({ where }),
        prisma.depositRequest.findMany({
          where,
          orderBy: statusParam === "PENDING" ? { createdAt: "asc" } : { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, telegramId: true } },
            paymentAccount: true,
            reviewedBy: { select: { firstName: true, username: true } },
          },
        }),
      ]);

      res.json({
        ok: true,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        deposits: deposits.map((d) => ({
          id: d.id,
          userId: d.userId,
          userName: `${d.user.firstName}${d.user.lastName ? ` ${d.user.lastName}` : ""}`,
          userPhone: d.user.phoneNumber,
          userTelegramId: d.user.telegramId.toString(),
          amount: Number(d.amount),
          transactionRef: d.transactionRef,
          receiptText: d.receiptText,
          screenshotFileId: d.screenshotFileId,
          status: d.status,
          reviewNote: d.reviewNote,
          reviewedBy: d.reviewedBy ? d.reviewedBy.firstName : null,
          reviewedAt: d.reviewedAt?.toISOString() ?? null,
          provider: d.paymentAccount.provider,
          accountName: d.paymentAccount.accountName,
          accountNumber: d.paymentAccount.accountNumber,
          createdAt: d.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      console.error("Admin deposits list error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_DEPOSITS" });
    }
  });

  router.post("/deposits/:id/approve", async (req, res) => {
    try {
      const depositId = paramStr(req.params.id);
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : undefined;
      const result = await approveDepositRequest(
        depositId,
        req.admin!.id,
        req.admin!.role,
        note
      );

      await botService.resolvePendingUserStatusMessage("DEPOSIT", depositId, "APPROVED");
      await botService.syncAdminMessageResolution(
        result.deposit.adminMessageIds,
        `✅ <b>APPROVED (Web)</b> by ${escapeHtml(req.admin!.firstName)}\n👤 ${escapeHtml(result.user.firstName)} | 💵 ${result.deposit.amount.toString()} ETB\n🔖 <code>${escapeHtml(result.deposit.transactionRef)}</code>`,
        Boolean(result.deposit.screenshotFileId)
      );
      botService.emitAdminEvent("admin:depositUpdated", { id: depositId, status: "APPROVED" });

      const uLang: Language = result.user.language || "AM";
      await botService.sendSafeMessage(
        result.user.telegramId,
        uLang === "AM"
          ? `✅ የ<b>${result.deposit.amount.toString()} ብር</b> Deposit ጥያቄዎ ጸድቋል! ሂሳብዎ ወደ Wallet-ዎ ገብቷል።`
          : `✅ Your deposit of <b>${result.deposit.amount.toString()} ETB</b> has been approved!`
      );

      if (result.referralBonus && result.referralBonus.bonusAmount > 0) {
        const referrer = await prisma.user.findUnique({
          where: { id: result.referralBonus.referrerId },
        });
        if (referrer) {
          const rLang: Language = referrer.language || "AM";
          await botService.sendSafeMessage(
            referrer.telegramId,
            rLang === "AM"
              ? `🎁 የጋበዙት ተጫዋች (<b>${escapeHtml(result.user.firstName)}</b>) Deposit ስላደረገ የ<b>${result.referralBonus.bonusAmount} ብር</b> የግብዣ ቦነስ ወደ Wallet-ዎ ገብቷል!`
              : `🎁 You earned <b>${result.referralBonus.bonusAmount} ETB</b> referral bonus from <b>${escapeHtml(result.user.firstName)}</b>'s deposit!`
          );
        }
      }

      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "FAILED_APPROVE_DEPOSIT";
      res.status(400).json({ ok: false, error: msg });
    }
  });

  router.post("/deposits/:id/reject", async (req, res) => {
    try {
      const depositId = paramStr(req.params.id);
      const reason =
        typeof req.body?.reason === "string" && req.body.reason.trim()
          ? req.body.reason.trim()
          : "Rejected by Admin";

      const result = await rejectDepositRequest(
        depositId,
        req.admin!.id,
        req.admin!.role,
        reason
      );

      await botService.resolvePendingUserStatusMessage("DEPOSIT", depositId, "REJECTED");
      await botService.syncAdminMessageResolution(
        result.deposit.adminMessageIds,
        `❌ <b>REJECTED (Web)</b> by ${escapeHtml(req.admin!.firstName)}\n👤 ${escapeHtml(result.user.firstName)} | 💵 ${result.deposit.amount.toString()} ETB\n📝 ${escapeHtml(reason)}`,
        Boolean(result.deposit.screenshotFileId)
      );
      botService.emitAdminEvent("admin:depositUpdated", { id: depositId, status: "REJECTED" });

      const uLang: Language = result.user.language || "AM";
      await botService.sendSafeMessage(
        result.user.telegramId,
        uLang === "AM"
          ? `❌ የ<b>${result.deposit.amount.toString()} ብር</b> Deposit ጥያቄዎ ውድቅ ተደርጓል።\n📝 ምክንያት፡ ${escapeHtml(reason)}`
          : `❌ Your deposit of <b>${result.deposit.amount.toString()} ETB</b> was rejected.\n📝 Reason: ${escapeHtml(reason)}`
      );

      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "FAILED_REJECT_DEPOSIT";
      res.status(400).json({ ok: false, error: msg });
    }
  });

  // =========================================================================
  // 6. WITHDRAWALS QUEUE (List, Mark Paid, Reject & Refund)
  // =========================================================================
  router.get("/withdrawals", async (req, res) => {
    try {
      const statusParam = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "PENDING";
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(10, Number(req.query.limit || 25)));
      const skip = (page - 1) * limit;

      const where: Prisma.WithdrawRequestWhereInput = {};
      if (statusParam === "PENDING" || statusParam === "PAID" || statusParam === "REJECTED") {
        where.status = statusParam as WithdrawStatus;
      }
      if (search) {
        where.OR = [
          { accountNumber: { contains: search, mode: "insensitive" } },
          { accountName: { contains: search, mode: "insensitive" } },
          { provider: { contains: search, mode: "insensitive" } },
          { payoutRef: { contains: search, mode: "insensitive" } },
          { user: { firstName: { contains: search, mode: "insensitive" } } },
          { user: { phoneNumber: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [total, withdrawals] = await Promise.all([
        prisma.withdrawRequest.count({ where }),
        prisma.withdrawRequest.findMany({
          where,
          orderBy: statusParam === "PENDING" ? { createdAt: "asc" } : { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, telegramId: true } },
            reviewedBy: { select: { firstName: true, username: true } },
          },
        }),
      ]);

      res.json({
        ok: true,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        withdrawals: withdrawals.map((w) => ({
          id: w.id,
          userId: w.userId,
          userName: `${w.user.firstName}${w.user.lastName ? ` ${w.user.lastName}` : ""}`,
          userPhone: w.user.phoneNumber,
          userTelegramId: w.user.telegramId.toString(),
          provider: w.provider,
          accountName: w.accountName,
          accountNumber: w.accountNumber,
          amount: Number(w.amount),
          status: w.status,
          payoutRef: w.payoutRef,
          reviewNote: w.reviewNote,
          reviewedBy: w.reviewedBy ? w.reviewedBy.firstName : null,
          reviewedAt: w.reviewedAt?.toISOString() ?? null,
          createdAt: w.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      console.error("Admin withdrawals list error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_WITHDRAWALS" });
    }
  });

  router.post("/withdrawals/:id/pay", async (req, res) => {
    try {
      const withdrawId = paramStr(req.params.id);
      const payoutReference =
        typeof req.body?.payoutReference === "string" ? req.body.payoutReference.trim() : undefined;
      const note = typeof req.body?.note === "string" ? req.body.note.trim() : undefined;

      const result = await markWithdrawPaid(
        withdrawId,
        req.admin!.id,
        req.admin!.role,
        payoutReference,
        note
      );

      await botService.resolvePendingUserStatusMessage("WITHDRAW", withdrawId, "PAID");
      await botService.syncAdminMessageResolution(
        result.withdraw.adminMessageIds,
        `✅ <b>PAID (Web)</b> by ${escapeHtml(req.admin!.firstName)}\n👤 ${escapeHtml(result.user.firstName)} | 💵 ${result.withdraw.amount.toString()} ETB${payoutReference ? `\n🔖 <code>${escapeHtml(payoutReference)}</code>` : ""}`,
        false
      );
      botService.emitAdminEvent("admin:withdrawUpdated", { id: withdrawId, status: "PAID" });

      const uLang: Language = result.user.language || "AM";
      await botService.sendSafeMessage(
        result.user.telegramId,
        uLang === "AM"
          ? `✅ የ<b>${result.withdraw.amount.toString()} ብር</b> Withdraw ክፍያዎ ተልኳል!${payoutReference ? `\n🔖 Ref: <code>${escapeHtml(payoutReference)}</code>` : ""}`
          : `✅ Your withdrawal of <b>${result.withdraw.amount.toString()} ETB</b> has been paid!${payoutReference ? `\n🔖 Ref: <code>${escapeHtml(payoutReference)}</code>` : ""}`
      );

      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "FAILED_MARK_PAID";
      res.status(400).json({ ok: false, error: msg });
    }
  });

  router.post("/withdrawals/:id/reject", async (req, res) => {
    try {
      const withdrawId = paramStr(req.params.id);
      const reason =
        typeof req.body?.reason === "string" && req.body.reason.trim()
          ? req.body.reason.trim()
          : "Rejected by Admin";

      const result = await rejectWithdrawRequest(
        withdrawId,
        req.admin!.id,
        req.admin!.role,
        reason
      );

      await botService.resolvePendingUserStatusMessage("WITHDRAW", withdrawId, "REJECTED");
      await botService.syncAdminMessageResolution(
        result.withdraw.adminMessageIds,
        `❌ <b>REJECTED & REFUNDED (Web)</b> by ${escapeHtml(req.admin!.firstName)}\n👤 ${escapeHtml(result.user.firstName)} | 💵 ${result.withdraw.amount.toString()} ETB\n📝 ${escapeHtml(reason)}`,
        false
      );
      botService.emitAdminEvent("admin:withdrawUpdated", { id: withdrawId, status: "REJECTED" });

      const uLang: Language = result.user.language || "AM";
      await botService.sendSafeMessage(
        result.user.telegramId,
        uLang === "AM"
          ? `❌ የ<b>${result.withdraw.amount.toString()} ብር</b> Withdraw ጥያቄዎ ውድቅ ተደርጎ ብሩ ወደ Wallet-ዎ ተመልሷል።\n📝 ምክንያት፡ ${escapeHtml(reason)}`
          : `❌ Your withdrawal of <b>${result.withdraw.amount.toString()} ETB</b> was rejected and refunded.\n📝 Reason: ${escapeHtml(reason)}`
      );

      res.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "FAILED_REJECT_WITHDRAWAL";
      res.status(400).json({ ok: false, error: msg });
    }
  });

  // =========================================================================
  // 7. BINGO ROOMS CRUD
  // =========================================================================
  const roomSchema = z.object({
    nameAm: z.string().trim().min(1).max(80),
    nameEn: z.string().trim().min(1).max(80),
    stakeAmount: z.number().positive(),
    houseCutPercent: z.number().min(0).max(50).default(20),
    minPlayers: z.number().int().min(1).max(50).default(2),
    maxCartelasPerUser: z.number().int().min(1).max(10).nullable().optional(),
    cartelaPoolSize: z.number().int().min(10).max(600).default(600),
    countdownSeconds: z.number().int().min(5).max(300).default(30),
    nextGameDelaySeconds: z.number().int().min(3).max(60).default(6),
    callIntervalMs: z.number().int().min(1000).max(15000).default(3500),
    winningPattern: z
      .enum(["ONE_LINE", "TWO_LINES", "FOUR_CORNERS", "X_SHAPE", "FULL_HOUSE"])
      .default("ONE_LINE"),
    freeCenter: z.boolean().default(true),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  });

  router.get("/rooms", async (_req, res) => {
    try {
      const rooms = await prisma.room.findMany({
        orderBy: [{ sortOrder: "asc" }, { stakeAmount: "asc" }],
        include: {
          _count: { select: { rounds: true } },
        },
      });
      res.json({
        ok: true,
        rooms: rooms.map((r) => ({
          id: r.id,
          nameAm: r.nameAm,
          nameEn: r.nameEn,
          mode: r.mode,
          stakeAmount: Number(r.stakeAmount),
          houseCutPercent: Number(r.houseCutPercent),
          minPlayers: r.minPlayers,
          maxCartelasPerUser: r.maxCartelasPerUser,
          cartelaPoolSize: r.cartelaPoolSize,
          countdownSeconds: r.countdownSeconds,
          nextGameDelaySeconds: r.nextGameDelaySeconds ?? 6,
          waitTimeoutSeconds: r.waitTimeoutSeconds,
          callIntervalMs: r.callIntervalMs,
          winningPattern: r.winningPattern,
          freeCenter: r.freeCenter,
          isActive: r.isActive,
          sortOrder: r.sortOrder,
          totalRounds: r._count.rounds,
        })),
      });
    } catch (err) {
      console.error("Admin rooms list error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_ROOMS" });
    }
  });

  router.post("/rooms", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = roomSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "Invalid room settings." });
        return;
      }
      const created = await prisma.room.create({
        data: {
          nameAm: parsed.data.nameAm,
          nameEn: parsed.data.nameEn,
          stakeAmount: parsed.data.stakeAmount,
          houseCutPercent: parsed.data.houseCutPercent,
          minPlayers: parsed.data.minPlayers,
          maxCartelasPerUser: parsed.data.maxCartelasPerUser ?? null,
          cartelaPoolSize: parsed.data.cartelaPoolSize,
          countdownSeconds: parsed.data.countdownSeconds,
          nextGameDelaySeconds: parsed.data.nextGameDelaySeconds,
          callIntervalMs: parsed.data.callIntervalMs,
          winningPattern: parsed.data.winningPattern,
          freeCenter: parsed.data.freeCenter,
          isActive: parsed.data.isActive,
          sortOrder: parsed.data.sortOrder,
        },
      });
      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "CREATE_ROOM",
        targetType: "Room",
        targetId: created.id,
        after: parsed.data,
      });
      realtimeService.notifyAdminEvent({ type: "room_updated", payload: { roomId: created.id } });
      res.json({ ok: true, room: created });
    } catch (err) {
      console.error("Create room error:", err);
      res.status(500).json({ ok: false, error: "FAILED_CREATE_ROOM" });
    }
  });

  router.put("/rooms/:id", requireSuperAdmin, async (req, res) => {
    try {
      const roomId = paramStr(req.params.id);
      const parsed = roomSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "Invalid room update data." });
        return;
      }
      const before = await prisma.room.findUnique({ where: { id: roomId } });
      if (!before) {
        res.status(404).json({ ok: false, error: "ROOM_NOT_FOUND" });
        return;
      }
      const updated = await prisma.room.update({
        where: { id: roomId },
        data: parsed.data,
      });
      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "UPDATE_ROOM",
        targetType: "Room",
        targetId: updated.id,
        before: {
          nameAm: before.nameAm,
          stakeAmount: Number(before.stakeAmount),
          houseCutPercent: Number(before.houseCutPercent),
          isActive: before.isActive,
        },
        after: parsed.data,
      });
      realtimeService.notifyAdminEvent({ type: "room_updated", payload: { roomId: updated.id } });
      res.json({ ok: true, room: updated });
    } catch (err) {
      console.error("Update room error:", err);
      res.status(500).json({ ok: false, error: "FAILED_UPDATE_ROOM" });
    }
  });

  router.delete("/rooms/:id", requireSuperAdmin, async (req, res) => {
    try {
      const roomId = paramStr(req.params.id);
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          rounds: { where: { status: { in: ["WAITING", "COUNTDOWN", "RUNNING", "CLAIM_WINDOW"] } }, take: 1 },
        },
      });
      if (!room) {
        res.status(404).json({ ok: false, error: "ROOM_NOT_FOUND" });
        return;
      }
      if (room.rounds.length > 0) {
        res.status(400).json({ ok: false, error: "Cannot delete a room while a round is active. Deactivate it instead." });
        return;
      }
      await prisma.room.delete({ where: { id: roomId } });
      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "DELETE_ROOM",
        targetType: "Room",
        targetId: room.id,
        before: { nameAm: room.nameAm, stakeAmount: Number(room.stakeAmount) },
      });
      realtimeService.notifyAdminEvent({ type: "room_updated", payload: { roomId: room.id } });
      res.json({ ok: true });
    } catch (err) {
      console.error("Delete room error:", err);
      res.status(500).json({ ok: false, error: "FAILED_DELETE_ROOM" });
    }
  });

  // =========================================================================
  // 8. LIVE & HISTORICAL BINGO GAMES MONITOR
  // =========================================================================
  router.get("/games", async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "ALL";
      const roomId = typeof req.query.roomId === "string" ? req.query.roomId.trim() : "";
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(10, Number(req.query.limit || 25)));
      const skip = (page - 1) * limit;

      const roundInclude = {
        room: { select: { nameAm: true, nameEn: true, stakeAmount: true, sortOrder: true } },
        tickets: {
          include: {
            user: { select: { id: true, firstName: true, phoneNumber: true } },
          },
        },
      } satisfies Prisma.GameRoundInclude;

      let total = 0;
      let rounds: Prisma.GameRoundGetPayload<{ include: typeof roundInclude }>[] = [];

      if (status === "ALL") {
        const activeStatuses: Prisma.GameRoundWhereInput["status"] = {
          in: ["WAITING", "COUNTDOWN", "RUNNING", "CLAIM_WINDOW"],
        };
        const finishedStatuses: Prisma.GameRoundWhereInput["status"] = {
          in: ["FINISHED", "CANCELLED_REFUNDED"],
        };
        const activeWhere: Prisma.GameRoundWhereInput = {
          status: activeStatuses,
          ...(roomId ? { roomId } : {}),
        };
        const finishedWhere: Prisma.GameRoundWhereInput = {
          status: finishedStatuses,
          ...(roomId ? { roomId } : {}),
        };

        const [activeCount, finishedCount, activeRounds] = await Promise.all([
          prisma.gameRound.count({ where: activeWhere }),
          prisma.gameRound.count({ where: finishedWhere }),
          page === 1
            ? prisma.gameRound.findMany({
                where: activeWhere,
                orderBy: [{ room: { sortOrder: "asc" } }, { room: { stakeAmount: "asc" } }, { createdAt: "desc" }],
                include: roundInclude,
              })
            : Promise.resolve([]),
        ]);

        total = activeCount + finishedCount;

        if (page === 1) {
          const remainingTake = Math.max(0, limit - activeRounds.length);
          const finishedRounds =
            remainingTake > 0
              ? await prisma.gameRound.findMany({
                  where: finishedWhere,
                  orderBy: [{ endedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
                  skip: 0,
                  take: remainingTake,
                  include: roundInclude,
                })
              : [];
          rounds = [...activeRounds, ...finishedRounds];
        } else {
          const finishedSkip = Math.max(0, skip - activeCount);
          rounds = await prisma.gameRound.findMany({
            where: finishedWhere,
            orderBy: [{ endedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
            skip: finishedSkip,
            take: limit,
            include: roundInclude,
          });
        }
      } else {
        const where: Prisma.GameRoundWhereInput = {};
        if (status === "LIVE") {
          where.status = { in: ["WAITING", "COUNTDOWN", "RUNNING", "CLAIM_WINDOW"] };
        } else if (
          ["WAITING", "COUNTDOWN", "RUNNING", "CLAIM_WINDOW", "FINISHED", "CANCELLED_REFUNDED"].includes(
            status
          )
        ) {
          where.status = status as Prisma.GameRoundWhereInput["status"];
        }
        if (roomId) {
          where.roomId = roomId;
        }

        const isLiveQuery = status === "LIVE" || status === "WAITING" || status === "COUNTDOWN" || status === "RUNNING";
        const [cnt, list] = await Promise.all([
          prisma.gameRound.count({ where }),
          prisma.gameRound.findMany({
            where,
            orderBy: isLiveQuery
              ? [{ room: { sortOrder: "asc" } }, { room: { stakeAmount: "asc" } }, { createdAt: "desc" }]
              : [{ endedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
            skip,
            take: limit,
            include: roundInclude,
          }),
        ]);
        total = cnt;
        rounds = list;
      }

      res.json({
        ok: true,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        games: rounds.map((r) => {
          const winners = r.tickets
            .filter((t) => t.status === "WINNER")
            .map((t) => ({
              userId: t.userId,
              userName: t.user.firstName,
              cartelaNumber: t.cartelaNumber,
              prizeWon: Number(t.prizeWon),
            }));
          const uniquePlayers = new Set(r.tickets.map((t) => t.userId)).size;
          return {
            id: r.id,
            roomId: r.roomId,
            roomNameAm: r.room.nameAm,
            roomNameEn: r.room.nameEn,
            stakeAmount: Number(r.room.stakeAmount),
            status: r.status,
            playersCount: uniquePlayers,
            ticketsCount: r.tickets.length,
            calledCount: r.calledNumbers.length,
            totalPot: Number(r.totalPot),
            houseCutAmount: Number(r.houseCutAmount),
            prizePool: Number(r.prizePool),
            winners,
            startedAt: r.startedAt?.toISOString() ?? null,
            endedAt: r.endedAt?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
          };
        }),
      });
    } catch (err) {
      console.error("Admin games list error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_GAMES" });
    }
  });

  router.get("/games/:id", async (req, res) => {
    try {
      const round = await prisma.gameRound.findUnique({
        where: { id: paramStr(req.params.id) },
        include: {
          room: true,
          tickets: {
            orderBy: [{ status: "desc" }, { purchasedAt: "asc" }],
            include: {
              user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } },
            },
          },
        },
      });
      if (!round) {
        res.status(404).json({ ok: false, error: "GAME_ROUND_NOT_FOUND" });
        return;
      }
      res.json({
        ok: true,
        game: {
          id: round.id,
          roomId: round.roomId,
          roomNameAm: round.room.nameAm,
          roomNameEn: round.room.nameEn,
          stakeAmount: Number(round.room.stakeAmount),
          houseCutPercent: Number(round.room.houseCutPercent),
          status: round.status,
          calledNumbers: round.calledNumbers,
          totalPot: Number(round.totalPot),
          houseCutAmount: Number(round.houseCutAmount),
          prizePool: Number(round.prizePool),
          startedAt: round.startedAt?.toISOString() ?? null,
          endedAt: round.endedAt?.toISOString() ?? null,
          createdAt: round.createdAt.toISOString(),
          tickets: round.tickets.map((t) => ({
            id: t.id,
            userId: t.userId,
            userName: `${t.user.firstName}${t.user.lastName ? ` ${t.user.lastName}` : ""}`,
            userPhone: t.user.phoneNumber,
            cartelaNumber: t.cartelaNumber,
            status: t.status,
            pricePaid: Number(t.pricePaid),
            prizeWon: Number(t.prizeWon),
            purchasedAt: t.purchasedAt.toISOString(),
          })),
        },
      });
    } catch (err) {
      console.error("Admin game detail error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_GAME_DETAIL" });
    }
  });

  // =========================================================================
  // 9. GLOBAL WALLET TRANSACTIONS LEDGER
  // =========================================================================
  router.get("/transactions", async (req, res) => {
    try {
      const typeParam = typeof req.query.type === "string" ? req.query.type.toUpperCase() : "ALL";
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(200, Math.max(10, Number(req.query.limit || 40)));
      const skip = (page - 1) * limit;

      const where: Prisma.WalletTransactionWhereInput = {};
      const validTypes: TxType[] = [
        "DEPOSIT",
        "WITHDRAW_LOCK",
        "WITHDRAW_PAID",
        "WITHDRAW_REFUND",
        "TRANSFER_OUT",
        "TRANSFER_IN",
        "BET",
        "BET_REFUND",
        "WIN",
        "WELCOME_BONUS",
        "REFERRAL_BONUS",
        "ADMIN_ADJUSTMENT",
      ];
      if (validTypes.includes(typeParam as TxType)) {
        where.type = typeParam as TxType;
      }
      if (search) {
        where.OR = [
          { note: { contains: search, mode: "insensitive" } },
          { referenceId: { contains: search, mode: "insensitive" } },
          { user: { firstName: { contains: search, mode: "insensitive" } } },
          { user: { phoneNumber: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [total, txs] = await Promise.all([
        prisma.walletTransaction.count({ where }),
        prisma.walletTransaction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            user: { select: { id: true, firstName: true, phoneNumber: true } },
          },
        }),
      ]);

      res.json({
        ok: true,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        transactions: txs.map((t) => ({
          id: t.id,
          userId: t.userId,
          userName: t.user.firstName,
          userPhone: t.user.phoneNumber,
          type: t.type,
          amount: Number(t.amount),
          balanceAfter: Number(t.balanceAfter),
          referenceType: t.referenceType,
          referenceId: t.referenceId,
          note: t.note,
          createdAt: t.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      console.error("Admin transactions error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_TRANSACTIONS" });
    }
  });

  // =========================================================================
  // 10. PAYMENT RECEIVING ACCOUNTS CRUD
  // =========================================================================
  const paymentAccountSchema = z.object({
    provider: z.string().trim().min(1).max(60),
    accountName: z.string().trim().min(1).max(120),
    accountNumber: z.string().trim().min(1).max(80),
    instructionsAm: z.string().max(500).default(""),
    instructionsEn: z.string().max(500).default(""),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  });

  router.get("/payment-accounts", async (_req, res) => {
    try {
      const accounts = await prisma.paymentAccount.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      res.json({ ok: true, accounts });
    } catch (err) {
      console.error("Admin payment accounts error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_PAYMENT_ACCOUNTS" });
    }
  });

  router.post("/payment-accounts", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = paymentAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "Invalid payment account data." });
        return;
      }
      const created = await prisma.paymentAccount.create({ data: parsed.data });
      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "CREATE_PAYMENT_ACCOUNT",
        targetType: "PaymentAccount",
        targetId: created.id,
        after: parsed.data,
      });
      realtimeService.notifyAdminEvent({ type: "payment_account_updated", payload: { accountId: created.id } });
      res.json({ ok: true, account: created });
    } catch (err) {
      console.error("Create payment account error:", err);
      res.status(500).json({ ok: false, error: "FAILED_CREATE_PAYMENT_ACCOUNT" });
    }
  });

  router.put("/payment-accounts/:id", requireSuperAdmin, async (req, res) => {
    try {
      const accountId = paramStr(req.params.id);
      const parsed = paymentAccountSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "Invalid payment account update." });
        return;
      }
      const before = await prisma.paymentAccount.findUnique({ where: { id: accountId } });
      if (!before) {
        res.status(404).json({ ok: false, error: "ACCOUNT_NOT_FOUND" });
        return;
      }
      const updated = await prisma.paymentAccount.update({
        where: { id: accountId },
        data: parsed.data,
      });
      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "UPDATE_PAYMENT_ACCOUNT",
        targetType: "PaymentAccount",
        targetId: updated.id,
        before: { provider: before.provider, accountNumber: before.accountNumber, isActive: before.isActive },
        after: parsed.data,
      });
      realtimeService.notifyAdminEvent({ type: "payment_account_updated", payload: { accountId: updated.id } });
      res.json({ ok: true, account: updated });
    } catch (err) {
      console.error("Update payment account error:", err);
      res.status(500).json({ ok: false, error: "FAILED_UPDATE_PAYMENT_ACCOUNT" });
    }
  });

  router.delete("/payment-accounts/:id", requireSuperAdmin, async (req, res) => {
    try {
      const accountId = paramStr(req.params.id);
      const account = await prisma.paymentAccount.findUnique({
        where: { id: accountId },
        include: { _count: { select: { deposits: true } } },
      });
      if (!account) {
        res.status(404).json({ ok: false, error: "ACCOUNT_NOT_FOUND" });
        return;
      }
      if (account._count.deposits > 0) {
        // Soft disable instead of failing foreign key constraint
        await prisma.paymentAccount.update({
          where: { id: account.id },
          data: { isActive: false },
        });
        await recordAuditLog(prisma, {
          actorId: req.admin!.id,
          actorRole: req.admin!.role,
          action: "DEACTIVATE_PAYMENT_ACCOUNT",
          targetType: "PaymentAccount",
          targetId: account.id,
        });
        realtimeService.notifyAdminEvent({ type: "payment_account_updated", payload: { accountId: account.id } });
        res.json({ ok: true, softDisabled: true });
        return;
      }
      await prisma.paymentAccount.delete({ where: { id: account.id } });
      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "DELETE_PAYMENT_ACCOUNT",
        targetType: "PaymentAccount",
        targetId: account.id,
      });
      realtimeService.notifyAdminEvent({ type: "payment_account_updated", payload: { accountId: account.id } });
      res.json({ ok: true });
    } catch (err) {
      console.error("Delete payment account error:", err);
      res.status(500).json({ ok: false, error: "FAILED_DELETE_PAYMENT_ACCOUNT" });
    }
  });

  // =========================================================================
  // 11. SYSTEM SETTINGS
  // =========================================================================
  router.get("/settings", async (_req, res) => {
    try {
      const s = await getSystemSettings();
      res.json({
        ok: true,
        settings: {
          botName: s.botName,
          welcomeBannerUrl: s.welcomeBannerUrl,
          supportUsername: s.supportUsername,
          channelUrl: s.channelUrl,
          welcomeCaptionAm: s.welcomeCaptionAm,
          welcomeCaptionEn: s.welcomeCaptionEn,
          instructionAm: s.instructionAm,
          instructionEn: s.instructionEn,
          welcomeBonusEnabled: s.welcomeBonusEnabled,
          welcomeBonusAmount: Number(s.welcomeBonusAmount),
          referralBonusEnabled: s.referralBonusEnabled,
          referralTriggerType: s.referralTriggerType,
          referralBonusValue: Number(s.referralBonusValue),
          minDeposit: Number(s.minDeposit),
          maxDeposit: Number(s.maxDeposit),
          minWithdraw: Number(s.minWithdraw),
          maxWithdraw: Number(s.maxWithdraw),
          withdrawProviders: s.withdrawProviders,
          transferEnabled: s.transferEnabled,
          minTransfer: Number(s.minTransfer),
          maxTransfer: Number(s.maxTransfer),
          manualClaimWindowMs: s.manualClaimWindowMs,
          maintenanceMode: s.maintenanceMode,
          maintenanceMessageAm: s.maintenanceMessageAm,
          maintenanceMessageEn: s.maintenanceMessageEn,
        },
      });
    } catch (err) {
      console.error("Admin get settings error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_SETTINGS" });
    }
  });

  const settingsUpdateSchema = z.object({
    botName: z.string().trim().min(1).max(80).optional(),
    welcomeBannerUrl: z.string().trim().max(500).optional(),
    supportUsername: z.string().trim().max(80).optional(),
    channelUrl: z.string().trim().max(250).optional(),
    welcomeCaptionAm: z.string().max(1500).optional(),
    welcomeCaptionEn: z.string().max(1500).optional(),
    instructionAm: z.string().max(4000).optional(),
    instructionEn: z.string().max(4000).optional(),
    welcomeBonusEnabled: z.boolean().optional(),
    welcomeBonusAmount: z.number().min(0).optional(),
    referralBonusEnabled: z.boolean().optional(),
    referralTriggerType: z
      .enum([
        "ON_SIGNUP_VERIFIED",
        "ON_FIRST_DEPOSIT",
        "ON_EVERY_DEPOSIT_PERCENT",
        "ON_EVERY_BET_PERCENT",
      ])
      .optional(),
    referralBonusValue: z.number().min(0).optional(),
    minDeposit: z.number().positive().optional(),
    maxDeposit: z.number().positive().optional(),
    minWithdraw: z.number().positive().optional(),
    maxWithdraw: z.number().positive().optional(),
    withdrawProviders: z.array(z.string().trim().min(1)).optional(),
    transferEnabled: z.boolean().optional(),
    minTransfer: z.number().positive().optional(),
    maxTransfer: z.number().positive().optional(),
    manualClaimWindowMs: z.number().int().min(500).max(10000).optional(),
    maintenanceMode: z.boolean().optional(),
    maintenanceMessageAm: z.string().max(500).optional(),
    maintenanceMessageEn: z.string().max(500).optional(),
  });

  router.put("/settings", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = settingsUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "Invalid settings values." });
        return;
      }
      const before = await getSystemSettings();
      const updated = await prisma.systemSettings.update({
        where: { id: 1 },
        data: parsed.data,
      });

      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "UPDATE_SYSTEM_SETTINGS",
        targetType: "SystemSettings",
        targetId: "1",
        before: {
          maintenanceMode: before.maintenanceMode,
          welcomeBonusAmount: Number(before.welcomeBonusAmount),
          referralBonusValue: Number(before.referralBonusValue),
        },
        after: parsed.data,
      });

      res.json({
        ok: true,
        settings: {
          ...updated,
          welcomeBonusAmount: Number(updated.welcomeBonusAmount),
          referralBonusValue: Number(updated.referralBonusValue),
          minDeposit: Number(updated.minDeposit),
          maxDeposit: Number(updated.maxDeposit),
          minWithdraw: Number(updated.minWithdraw),
          maxWithdraw: Number(updated.maxWithdraw),
          minTransfer: Number(updated.minTransfer),
          maxTransfer: Number(updated.maxTransfer),
        },
      });
    } catch (err) {
      console.error("Update settings error:", err);
      res.status(500).json({ ok: false, error: "FAILED_UPDATE_SETTINGS" });
    }
  });

  // =========================================================================
  // 12. TELEGRAM BROADCAST CENTER
  // =========================================================================
  router.get("/broadcast/audience", requireSuperAdmin, async (_req, res) => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [all, verified, active7d] = await Promise.all([
        prisma.user.count({ where: { isBanned: false } }),
        prisma.user.count({ where: { isBanned: false, phoneNumber: { not: null } } }),
        prisma.user.count({
          where: {
            isBanned: false,
            tickets: { some: { purchasedAt: { gte: sevenDaysAgo } } },
          },
        }),
      ]);
      res.json({ ok: true, counts: { ALL: all, VERIFIED: verified, ACTIVE_7D: active7d } });
    } catch (err) {
      console.error("Broadcast audience error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_AUDIENCE" });
    }
  });

  const broadcastSchema = z.object({
    target: z.enum(["ALL", "VERIFIED", "ACTIVE_7D"]).default("ALL"),
    message: z.string().trim().max(3800).optional().default(""),
    mediaType: z.enum(["photo", "video"]).nullable().optional(),
    mediaDataUrl: z.string().max(45_000_000).nullable().optional(),
    mediaFileName: z.string().max(255).nullable().optional(),
  });

  router.post("/broadcast", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = broadcastSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "Invalid broadcast payload." });
        return;
      }

      const rawMessage = parsed.data.message.trim();
      const mediaType = parsed.data.mediaType || null;
      const mediaDataUrl = parsed.data.mediaDataUrl?.trim() || null;

      if (!rawMessage && !mediaDataUrl) {
        res.status(400).json({ ok: false, error: "Please enter a message or attach a photo/video." });
        return;
      }

      let mediaBuffer: Buffer | null = null;
      let mediaUrl: string | null = null;

      if (mediaDataUrl && mediaType) {
        if (mediaDataUrl.startsWith("data:")) {
          const commaIdx = mediaDataUrl.indexOf(",");
          if (commaIdx !== -1) {
            mediaBuffer = Buffer.from(mediaDataUrl.slice(commaIdx + 1), "base64");
          }
        } else if (mediaDataUrl.startsWith("http://") || mediaDataUrl.startsWith("https://")) {
          mediaUrl = mediaDataUrl;
        }
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const where: Prisma.UserWhereInput = { isBanned: false };
      if (parsed.data.target === "VERIFIED") {
        where.phoneNumber = { not: null };
      } else if (parsed.data.target === "ACTIVE_7D") {
        where.tickets = { some: { purchasedAt: { gte: sevenDaysAgo } } };
      }

      const recipients = await prisma.user.findMany({
        where,
        select: { telegramId: true },
      });

      const formatted = rawMessage ? escapeHtml(rawMessage) : "";
      const { sent, failed } = await botService.sendBroadcastToRecipients(
        recipients.map((r) => r.telegramId),
        {
          htmlText: formatted,
          mediaType,
          mediaBuffer,
          mediaUrl,
          mediaFileName: parsed.data.mediaFileName || (mediaType === "video" ? "video.mp4" : "photo.jpg"),
        }
      );

      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "TELEGRAM_BROADCAST",
        targetType: "Broadcast",
        targetId: parsed.data.target,
        after: {
          target: parsed.data.target,
          mediaType: mediaType || "text",
          total: recipients.length,
          sent,
          failed,
          preview: rawMessage.slice(0, 200),
        },
      });

      res.json({ ok: true, total: recipients.length, sent, failed });
    } catch (err) {
      console.error("Broadcast error:", err);
      res.status(500).json({ ok: false, error: "FAILED_BROADCAST" });
    }
  });

  // =========================================================================
  // 12B. TELEGRAM CHANNEL & GROUP POST CENTER
  // =========================================================================
  router.get("/channel-post/config", requireSuperAdmin, async (_req, res) => {
    try {
      const s = await getSystemSettings();
      const cfg = botService.parseChannelGroupConfig(s.channelUrl);
      res.json({
        ok: true,
        channelTarget: cfg.channelTarget,
        groupTarget: cfg.groupTarget,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: "FAILED_FETCH_CHANNEL_CONFIG" });
    }
  });

  router.put("/channel-post/config", requireSuperAdmin, async (req, res) => {
    try {
      const channelTarget = typeof req.body?.channelTarget === "string" ? req.body.channelTarget.trim() : "";
      const groupTarget = typeof req.body?.groupTarget === "string" ? req.body.groupTarget.trim() : "";
      const combined = botService.formatChannelGroupConfig(channelTarget, groupTarget);
      await prisma.systemSettings.update({
        where: { id: 1 },
        data: { channelUrl: combined },
      });
      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "UPDATE_CHANNEL_GROUP_CONFIG",
        targetType: "SystemSettings",
        targetId: "1",
        after: { channelTarget, groupTarget },
      });
      res.json({ ok: true, channelTarget, groupTarget });
    } catch (err) {
      res.status(500).json({ ok: false, error: "FAILED_SAVE_CHANNEL_CONFIG" });
    }
  });

  const channelPostSchema = z.object({
    target: z.enum(["BOTH", "CHANNEL", "GROUP"]).default("BOTH"),
    message: z.string().trim().max(3800).optional().default(""),
    mediaType: z.enum(["photo", "video"]).nullable().optional(),
    mediaDataUrl: z.string().max(45_000_000).nullable().optional(),
    mediaFileName: z.string().max(255).nullable().optional(),
    channelTarget: z.string().trim().max(250).optional(),
    groupTarget: z.string().trim().max(250).optional(),
  });

  router.post("/channel-post", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = channelPostSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, error: "Invalid post payload." });
        return;
      }

      const rawMessage = parsed.data.message.trim();
      const mediaType = parsed.data.mediaType || null;
      const mediaDataUrl = parsed.data.mediaDataUrl?.trim() || null;

      if (!rawMessage && !mediaDataUrl) {
        res.status(400).json({ ok: false, error: "Please enter a message or attach a photo/video." });
        return;
      }

      // Persist updated channel/group targets if provided
      if (parsed.data.channelTarget !== undefined || parsed.data.groupTarget !== undefined) {
        const s = await getSystemSettings();
        const currentCfg = botService.parseChannelGroupConfig(s.channelUrl);
        const nextCh = parsed.data.channelTarget !== undefined ? parsed.data.channelTarget : currentCfg.channelTarget;
        const nextGr = parsed.data.groupTarget !== undefined ? parsed.data.groupTarget : currentCfg.groupTarget;
        await prisma.systemSettings.update({
          where: { id: 1 },
          data: { channelUrl: botService.formatChannelGroupConfig(nextCh, nextGr) },
        });
      }

      let mediaBuffer: Buffer | null = null;
      let mediaUrl: string | null = null;

      if (mediaDataUrl && mediaType) {
        if (mediaDataUrl.startsWith("data:")) {
          const commaIdx = mediaDataUrl.indexOf(",");
          if (commaIdx !== -1) {
            mediaBuffer = Buffer.from(mediaDataUrl.slice(commaIdx + 1), "base64");
          }
        } else if (mediaDataUrl.startsWith("http://") || mediaDataUrl.startsWith("https://")) {
          mediaUrl = mediaDataUrl;
        }
      }

      const formatted = rawMessage ? escapeHtml(rawMessage) : "";
      const outcome = await botService.postToChannelAndGroup({
        target: parsed.data.target,
        htmlText: formatted,
        mediaType,
        mediaBuffer,
        mediaUrl,
        mediaFileName: parsed.data.mediaFileName || (mediaType === "video" ? "video.mp4" : "photo.jpg"),
        channelOverride: parsed.data.channelTarget,
        groupOverride: parsed.data.groupTarget,
      });

      await recordAuditLog(prisma, {
        actorId: req.admin!.id,
        actorRole: req.admin!.role,
        action: "TELEGRAM_CHANNEL_GROUP_POST",
        targetType: "ChannelGroupPost",
        targetId: parsed.data.target,
        after: {
          target: parsed.data.target,
          mediaType: mediaType || "text",
          results: outcome.results,
          preview: rawMessage.slice(0, 200),
        },
      });

      res.json({ ok: outcome.ok, results: outcome.results });
    } catch (err) {
      console.error("Channel/Group post error:", err);
      res.status(500).json({ ok: false, error: "FAILED_CHANNEL_POST" });
    }
  });

  // =========================================================================
  // 13. IMMUTABLE AUDIT LOGS
  // =========================================================================
  router.get("/audit-logs", async (req, res) => {
    try {
      const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(10, Number(req.query.limit || 40)));
      const skip = (page - 1) * limit;

      const where: Prisma.AuditLogWhereInput = action
        ? { action: { contains: action, mode: "insensitive" } }
        : {};

      const [total, logs] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            actor: { select: { firstName: true, username: true, role: true } },
          },
        }),
      ]);

      res.json({
        ok: true,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        logs: logs.map((l) => ({
          id: l.id,
          actorName: l.actor.firstName,
          actorUsername: l.actor.username,
          actorRole: l.actorRole,
          action: l.action,
          targetType: l.targetType,
          targetId: l.targetId,
          beforeJson: l.beforeJson,
          afterJson: l.afterJson,
          createdAt: l.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      console.error("Admin audit logs error:", err);
      res.status(500).json({ ok: false, error: "FAILED_FETCH_AUDIT_LOGS" });
    }
  });

  return router;
}
