import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import {
  getSystemSettings,
  grantWelcomeBonusTx,
  processReferralBonusTx,
  toCents,
} from "./walletService.js";
import { realtimeService } from "./realtimeService.js";

function makeReferralCode(): string {
  return "BG" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

export function normalizePhoneNumber(raw: string): string {
  const cleaned = raw.trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("09") || cleaned.startsWith("07")) {
    return "+251" + cleaned.slice(1);
  }
  if (cleaned.startsWith("251")) return "+" + cleaned;
  return "+" + cleaned;
}

/**
 * Extracts a unique Transaction Reference from either a full Telebirr/CBE SMS message,
 * a Telebirr receipt URL, or a directly typed Transaction ID.
 */
export function extractTransactionRefFromInput(rawInput: string): string | null {
  const text = rawInput.trim();
  if (text.length < 4) return null;

  // 1. Telebirr receipt URL: https://transactioninfo.ethiotelecom.et/receipt/XXXX
  const urlMatch = text.match(/receipt\/([A-Za-z0-9_-]{5,30})/i);
  if (urlMatch?.[1]) return urlMatch[1].toUpperCase();

  // 2. Explicit transaction phrase in English or Amharic Telebirr/CBE SMS
  const phraseMatch = text.match(
    /(?:transaction\s*(?:number|id|ref(?:erence)?)|ref(?:\s*no)?|ft\s*no|ቁጥር)\s*(?:is|:|#)?\s*([A-Za-z0-9]{6,25})/i
  );
  if (phraseMatch?.[1]) return phraseMatch[1].toUpperCase();

  // 3. Standard CBE FT code (starts with FT + alphanumeric)
  const ftMatch = text.match(/\b(FT[A-Z0-9]{6,20})\b/i);
  if (ftMatch?.[1]) return ftMatch[1].toUpperCase();

  // 4. Single short token directly entered by user
  if (!/\s/.test(text) && /^[A-Za-z0-9_-]{4,35}$/.test(text)) {
    return text.toUpperCase();
  }

  // 5. Fallback: find an alphanumeric code containing digits (length 7..20) in SMS
  const tokenMatch = text.match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{7,20}\b/i);
  if (tokenMatch?.[0]) return tokenMatch[0].toUpperCase();

  // 6. Last resort for numeric-only ref inside short text
  const digitsMatch = text.match(/\b\d{8,20}\b/);
  if (digitsMatch?.[0]) return digitsMatch[0];

  return null;
}

export async function findOrCreateTelegramUser(input: {
  telegramId: bigint;
  firstName: string;
  lastName?: string;
  username?: string;
  referralCodeUsed?: string;
}) {
  let referredById: string | null = null;
  if (input.referralCodeUsed) {
    const rawRef = input.referralCodeUsed.trim();
    const referrer = /^\d+$/.test(rawRef)
      ? await prisma.user.findUnique({
          where: { telegramId: BigInt(rawRef) },
          select: { id: true, telegramId: true, isBanned: true },
        })
      : await prisma.user.findUnique({
          where: { referralCode: rawRef.toUpperCase() },
          select: { id: true, telegramId: true, isBanned: true },
        });
    if (referrer && !referrer.isBanned && referrer.telegramId !== input.telegramId) {
      referredById = referrer.id;
    }
  }

  const existing = await prisma.user.findUnique({
    where: { telegramId: input.telegramId },
    include: { wallet: true },
  });
  if (existing) {
    const shouldAttachReferrer =
      !existing.referredById && !existing.phoneNumber && referredById && referredById !== existing.id;
    const nextUsername =
      existing.role !== "PLAYER" && existing.username
        ? existing.username
        : (input.username ?? null);
    if (
      shouldAttachReferrer ||
      existing.firstName !== input.firstName ||
      existing.lastName !== (input.lastName ?? null) ||
      existing.username !== nextUsername
    ) {
      return prisma.user.update({
        where: { id: existing.id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          username: nextUsername,
          ...(shouldAttachReferrer ? { referredById } : {}),
        },
        include: { wallet: true },
      });
    }
    return existing;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const referralCode = makeReferralCode();
    try {
      return await prisma.user.create({
        data: {
          telegramId: input.telegramId,
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          username: input.username ?? null,
          language: null,
          referralCode,
          referredById,
          wallet: { create: {} },
        },
        include: { wallet: true },
      });
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("FAILED_CREATE_USER");
}

export async function verifyUserPhone(userId: string, rawPhone: string) {
  const phone = normalizePhoneNumber(rawPhone);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.isBanned) throw new Error("USER_BANNED");

    const owner = await tx.user.findUnique({ where: { phoneNumber: phone } });
    if (owner && owner.id !== userId) {
      throw new Error("PHONE_ALREADY_USED");
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { phoneNumber: phone },
    });

    const welcomeBonus = await grantWelcomeBonusTx(tx, userId);
    const referralBonus = await processReferralBonusTx(tx, {
      trigger: "ON_SIGNUP_VERIFIED",
      referredUserId: userId,
    });

    return { user: updated, welcomeBonus, referralBonus };
  });
}

export async function createDepositRequest(
  userId: string,
  input: {
    paymentAccountId: string;
    amount: number;
    transactionRef: string;
    receiptText?: string;
    screenshotFileId?: string;
  }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.isBanned) throw new Error("USER_BANNED");
  if (!user.phoneNumber) throw new Error("PHONE_NOT_VERIFIED");

  const settings = await getSystemSettings();
  const amountCents = Math.round(input.amount * 100);
  if (amountCents < toCents(settings.minDeposit)) {
    throw new Error(`MIN_DEPOSIT:${settings.minDeposit.toString()}`);
  }
  if (amountCents > toCents(settings.maxDeposit)) {
    throw new Error(`MAX_DEPOSIT:${settings.maxDeposit.toString()}`);
  }

  const account = await prisma.paymentAccount.findUnique({
    where: { id: input.paymentAccountId },
  });
  if (!account || !account.isActive) {
    throw new Error("INVALID_PAYMENT_ACCOUNT");
  }

  const normalizedRef = input.transactionRef.trim().toUpperCase();
  if (normalizedRef.length < 4) {
    throw new Error("INVALID_TRANSACTION_REF");
  }

  const duplicate = await prisma.depositRequest.findUnique({
    where: { transactionRef: normalizedRef },
  });
  if (duplicate) {
    throw new Error("DUPLICATE_TX_REF");
  }

  const dep = await prisma.depositRequest.create({
    data: {
      userId,
      paymentAccountId: account.id,
      amount: input.amount,
      transactionRef: normalizedRef,
      receiptText: input.receiptText ?? null,
      screenshotFileId: input.screenshotFileId ?? null,
    },
    include: {
      user: true,
      paymentAccount: true,
    },
  });

  realtimeService.notifyAdminEvent({
    type: "deposit_created",
    payload: { depositId: dep.id, userId: dep.userId, amount: dep.amount },
  });

  return dep;
}

