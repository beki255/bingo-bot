import { Prisma, type ReferralTriggerType, type UserRole } from "@prisma/client";
import type { WalletSummary } from "@bingo/shared";
import { prisma } from "../db/prisma.js";
import { recordAuditLog } from "./auditService.js";
import { realtimeService } from "./realtimeService.js";

export function toCents(value: Prisma.Decimal | number | string): number {
  return Math.round(Number(value) * 100);
}

export function centsToDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal((cents / 100).toFixed(2));
}

export function centsToNumber(cents: number): number {
  return Math.round(cents) / 100;
}

export async function getSystemSettings(client: Prisma.TransactionClient | typeof prisma = prisma) {
  let settings = await client.systemSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await client.systemSettings.create({ data: { id: 1 } });
  }
  return settings;
}

export async function lockAndGetWallet(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
  let wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await tx.wallet.create({ data: { userId } });
  }
  return wallet;
}

export async function getUserWalletSummary(userId: string): Promise<WalletSummary> {
  const wallet = await prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  return {
    balance: centsToNumber(toCents(wallet.balance)),
    lockedBalance: centsToNumber(toCents(wallet.lockedBalance)),
  };
}

export async function grantWelcomeBonusTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number> {
  const settings = await getSystemSettings(tx);
  if (!settings.welcomeBonusEnabled) return 0;

  const bonusCents = toCents(settings.welcomeBonusAmount);
  if (bonusCents <= 0) return 0;

  const claimed = await tx.user.updateMany({
    where: {
      id: userId,
      welcomeBonusClaimed: false,
      phoneNumber: { not: null },
      isBanned: false,
    },
    data: { welcomeBonusClaimed: true },
  });
  if (claimed.count !== 1) return 0;

  const wallet = await lockAndGetWallet(tx, userId);
  const newBalanceCents = toCents(wallet.balance) + bonusCents;

  await tx.wallet.update({
    where: { userId },
    data: { balance: centsToDecimal(newBalanceCents) },
  });

  await tx.walletTransaction.create({
    data: {
      userId,
      type: "WELCOME_BONUS",
      amount: centsToDecimal(bonusCents),
      balanceAfter: centsToDecimal(newBalanceCents),
      referenceType: "WELCOME",
      referenceId: userId,
      note: "Welcome bonus on unique phone registration",
    },
  });

  return centsToNumber(bonusCents);
}

export async function processReferralBonusTx(
  tx: Prisma.TransactionClient,
  params: {
    trigger: ReferralTriggerType;
    referredUserId: string;
    baseAmountCents?: number;
    referenceId?: string;
  }
): Promise<{ referrerId: string; bonusAmount: number } | null> {
  const settings = await getSystemSettings(tx);
  if (!settings.referralBonusEnabled) return null;
  if (settings.referralTriggerType !== params.trigger) return null;

  const referredUser = await tx.user.findUnique({
    where: { id: params.referredUserId },
    select: { id: true, referredById: true, phoneNumber: true },
  });
  if (!referredUser?.referredById || referredUser.referredById === referredUser.id) {
    return null;
  }

  const referrer = await tx.user.findUnique({
    where: { id: referredUser.referredById },
    select: { id: true, isBanned: true },
  });
  if (!referrer || referrer.isBanned) return null;

  const valueNum = Number(settings.referralBonusValue);
  const targetCount = 10;
  let bonusCents = 0;
  let refType = String(params.trigger);
  let refId = params.referenceId ?? referredUser.id;
  let txNote = `Referral bonus (${params.trigger})`;

  if (params.trigger === "ON_SIGNUP_VERIFIED") {
    if (!referredUser.phoneNumber) return null;
    const verifiedInviteCount = await tx.user.count({
      where: {
        referredById: referrer.id,
        phoneNumber: { not: null },
      },
    });
    if (verifiedInviteCount === 0 || verifiedInviteCount % targetCount !== 0) {
      return null;
    }
    const milestoneRef = `MILESTONE_${verifiedInviteCount}`;
    const already = await tx.walletTransaction.findFirst({
      where: {
        userId: referrer.id,
        type: "REFERRAL_BONUS",
        referenceType: "REFERRAL_MILESTONE",
        referenceId: milestoneRef,
      },
    });
    if (already) return null;
    bonusCents = Math.round(valueNum * 100);
    refType = "REFERRAL_MILESTONE";
    refId = milestoneRef;
    txNote = `Referral milestone bonus (${verifiedInviteCount} invites)`;
  } else if (params.trigger === "ON_FIRST_DEPOSIT") {
    const approvedCount = await tx.depositRequest.count({
      where: { userId: referredUser.id, status: "APPROVED" },
    });
    if (approvedCount !== 1) return null;
    bonusCents = Math.round(valueNum * 100);
  } else {
    const baseCents = params.baseAmountCents ?? 0;
    bonusCents = Math.floor((baseCents * valueNum) / 100);
  }

  if (bonusCents <= 0) return null;

  const wallet = await lockAndGetWallet(tx, referrer.id);
  const newBalanceCents = toCents(wallet.balance) + bonusCents;

  await tx.wallet.update({
    where: { userId: referrer.id },
    data: { balance: centsToDecimal(newBalanceCents) },
  });

  await tx.walletTransaction.create({
    data: {
      userId: referrer.id,
      type: "REFERRAL_BONUS",
      amount: centsToDecimal(bonusCents),
      balanceAfter: centsToDecimal(newBalanceCents),
      referenceType: refType,
      referenceId: refId,
      note: txNote,
    },
  });

  return { referrerId: referrer.id, bonusAmount: centsToNumber(bonusCents) };
}

export async function approveDepositRequest(
  depositId: string,
  actorId: string,
  actorRole: UserRole,
  note?: string
) {
  const res = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DepositRequest" WHERE id = ${depositId} FOR UPDATE`;
    const dep = await tx.depositRequest.findUnique({
      where: { id: depositId },
      include: { user: true, paymentAccount: true },
    });
    if (!dep) throw new Error("DEPOSIT_NOT_FOUND");
    if (dep.status !== "PENDING") throw new Error("DEPOSIT_ALREADY_PROCESSED");

    const updated = await tx.depositRequest.update({
      where: { id: depositId },
      data: {
        status: "APPROVED",
        reviewedById: actorId,
        reviewNote: note || null,
        reviewedAt: new Date(),
      },
    });

    const amountCents = toCents(dep.amount);
    const wallet = await lockAndGetWallet(tx, dep.userId);
    const newBalanceCents = toCents(wallet.balance) + amountCents;

    await tx.wallet.update({
      where: { userId: dep.userId },
      data: { balance: centsToDecimal(newBalanceCents) },
    });

    await tx.walletTransaction.create({
      data: {
        userId: dep.userId,
        type: "DEPOSIT",
        amount: centsToDecimal(amountCents),
        balanceAfter: centsToDecimal(newBalanceCents),
        referenceType: "DEPOSIT_REQUEST",
        referenceId: dep.id,
        actorId,
        note: `Approved deposit (${dep.transactionRef})`,
      },
    });

    await recordAuditLog(tx, {
      actorId,
      actorRole,
      action: "APPROVE_DEPOSIT",
      targetType: "DepositRequest",
      targetId: dep.id,
      before: { status: "PENDING" },
      after: { status: "APPROVED", amount: dep.amount.toString(), note },
    });

    const firstDepBonus = await processReferralBonusTx(tx, {
      trigger: "ON_FIRST_DEPOSIT",
      referredUserId: dep.userId,
      baseAmountCents: amountCents,
      referenceId: dep.id,
    });
    const everyDepBonus = await processReferralBonusTx(tx, {
      trigger: "ON_EVERY_DEPOSIT_PERCENT",
      referredUserId: dep.userId,
      baseAmountCents: amountCents,
      referenceId: dep.id,
    });

    return {
      deposit: updated,
      user: dep.user,
      paymentAccount: dep.paymentAccount,
      referralBonus: firstDepBonus ?? everyDepBonus,
      newBalance: centsToNumber(newBalanceCents),
    };
  });

  realtimeService.notifyWalletUpdate(res.user.telegramId, {
    balance: res.newBalance,
    reason: "DEPOSIT_APPROVED",
  });
  realtimeService.notifyAdminEvent({
    type: "deposit_approved",
    payload: { depositId, userId: res.user.id },
  });

  return res;
}

export async function rejectDepositRequest(
  depositId: string,
  actorId: string,
  actorRole: UserRole,
  note?: string
) {
  const res = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DepositRequest" WHERE id = ${depositId} FOR UPDATE`;
    const dep = await tx.depositRequest.findUnique({
      where: { id: depositId },
      include: { user: true },
    });
    if (!dep) throw new Error("DEPOSIT_NOT_FOUND");
    if (dep.status !== "PENDING") throw new Error("DEPOSIT_ALREADY_PROCESSED");

    const updated = await tx.depositRequest.update({
      where: { id: depositId },
      data: {
        status: "REJECTED",
        reviewedById: actorId,
        reviewNote: note || null,
        reviewedAt: new Date(),
      },
    });

    await recordAuditLog(tx, {
      actorId,
      actorRole,
      action: "REJECT_DEPOSIT",
      targetType: "DepositRequest",
      targetId: dep.id,
      before: { status: "PENDING" },
      after: { status: "REJECTED", note },
    });

    return { deposit: updated, user: dep.user };
  });

  realtimeService.notifyAdminEvent({
    type: "deposit_rejected",
    payload: { depositId, userId: res.user.id },
  });

  return res;
}

export async function createWithdrawRequest(
  userId: string,
  input: {
    provider: string;
    accountName: string;
    accountNumber: string;
    amount: number;
  }
) {
  const res = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.isBanned) throw new Error("USER_BANNED");
    if (!user.phoneNumber) throw new Error("PHONE_NOT_VERIFIED");

    const settings = await getSystemSettings(tx);
    const amountCents = Math.round(input.amount * 100);
    if (amountCents < toCents(settings.minWithdraw)) {
      throw new Error(`MIN_WITHDRAW:${settings.minWithdraw.toString()}`);
    }
    if (amountCents > toCents(settings.maxWithdraw)) {
      throw new Error(`MAX_WITHDRAW:${settings.maxWithdraw.toString()}`);
    }

    const wallet = await lockAndGetWallet(tx, userId);
    const balanceCents = toCents(wallet.balance);
    if (amountCents > balanceCents) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    const newBalanceCents = balanceCents - amountCents;
    const newLockedCents = toCents(wallet.lockedBalance) + amountCents;

    await tx.wallet.update({
      where: { userId },
      data: {
        balance: centsToDecimal(newBalanceCents),
        lockedBalance: centsToDecimal(newLockedCents),
      },
    });

    const withdraw = await tx.withdrawRequest.create({
      data: {
        userId,
        provider: input.provider,
        accountName: input.accountName,
        accountNumber: input.accountNumber,
        amount: centsToDecimal(amountCents),
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId,
        type: "WITHDRAW_LOCK",
        amount: centsToDecimal(-amountCents),
        balanceAfter: centsToDecimal(newBalanceCents),
        referenceType: "WITHDRAW_REQUEST",
        referenceId: withdraw.id,
        note: "Locked for withdrawal",
      },
    });

    return { withdraw, user, newBalance: centsToNumber(newBalanceCents) };
  });

  realtimeService.notifyWalletUpdate(res.user.telegramId, {
    balance: res.newBalance,
    reason: "WITHDRAW_LOCKED",
  });
  realtimeService.notifyAdminEvent({
    type: "withdrawal_created",
    payload: { withdrawalId: res.withdraw.id, userId },
  });

  return res;
}

export async function markWithdrawPaid(
  withdrawId: string,
  actorId: string,
  actorRole: UserRole,
  payoutRef?: string,
  note?: string
) {
  const res = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WithdrawRequest" WHERE id = ${withdrawId} FOR UPDATE`;
    const wr = await tx.withdrawRequest.findUnique({
      where: { id: withdrawId },
      include: { user: true },
    });
    if (!wr) throw new Error("WITHDRAW_NOT_FOUND");
    if (wr.status !== "PENDING") throw new Error("WITHDRAW_ALREADY_PROCESSED");

    const wallet = await lockAndGetWallet(tx, wr.userId);
    const amountCents = toCents(wr.amount);
    const newLocked = Math.max(0, toCents(wallet.lockedBalance) - amountCents);

    await tx.wallet.update({
      where: { userId: wr.userId },
      data: { lockedBalance: centsToDecimal(newLocked) },
    });

    const updated = await tx.withdrawRequest.update({
      where: { id: withdrawId },
      data: {
        status: "PAID",
        reviewedById: actorId,
        payoutRef: payoutRef || null,
        reviewNote: note || null,
        reviewedAt: new Date(),
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId: wr.userId,
        type: "WITHDRAW_PAID",
        amount: centsToDecimal(-amountCents),
        balanceAfter: wallet.balance,
        referenceType: "WITHDRAW_REQUEST",
        referenceId: wr.id,
        actorId,
        note: payoutRef ? `Paid (${payoutRef})` : "Withdrawal paid",
      },
    });

    await recordAuditLog(tx, {
      actorId,
      actorRole,
      action: "MARK_WITHDRAW_PAID",
      targetType: "WithdrawRequest",
      targetId: wr.id,
      before: { status: "PENDING" },
      after: { status: "PAID", payoutRef, note },
    });

    return { withdraw: updated, user: wr.user };
  });

  realtimeService.notifyAdminEvent({
    type: "withdrawal_paid",
    payload: { withdrawalId: withdrawId, userId: res.user.id },
  });

  return res;
}

export async function rejectWithdrawRequest(
  withdrawId: string,
  actorId: string,
  actorRole: UserRole,
  note?: string
) {
  const res = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WithdrawRequest" WHERE id = ${withdrawId} FOR UPDATE`;
    const wr = await tx.withdrawRequest.findUnique({
      where: { id: withdrawId },
      include: { user: true },
    });
    if (!wr) throw new Error("WITHDRAW_NOT_FOUND");
    if (wr.status !== "PENDING") throw new Error("WITHDRAW_ALREADY_PROCESSED");

    const wallet = await lockAndGetWallet(tx, wr.userId);
    const amountCents = toCents(wr.amount);
    const newLocked = Math.max(0, toCents(wallet.lockedBalance) - amountCents);
    const newBalance = toCents(wallet.balance) + amountCents;

    await tx.wallet.update({
      where: { userId: wr.userId },
      data: {
        lockedBalance: centsToDecimal(newLocked),
        balance: centsToDecimal(newBalance),
      },
    });

    const updated = await tx.withdrawRequest.update({
      where: { id: withdrawId },
      data: {
        status: "REJECTED",
        reviewedById: actorId,
        reviewNote: note || null,
        reviewedAt: new Date(),
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId: wr.userId,
        type: "WITHDRAW_REFUND",
        amount: centsToDecimal(amountCents),
        balanceAfter: centsToDecimal(newBalance),
        referenceType: "WITHDRAW_REQUEST",
        referenceId: wr.id,
        actorId,
        note: note || "Withdrawal rejected - refunded",
      },
    });

    await recordAuditLog(tx, {
      actorId,
      actorRole,
      action: "REJECT_WITHDRAW",
      targetType: "WithdrawRequest",
      targetId: wr.id,
      before: { status: "PENDING" },
      after: { status: "REJECTED", note },
    });

    return { withdraw: updated, user: wr.user, newBalance: centsToNumber(newBalance) };
  });

  realtimeService.notifyWalletUpdate(res.user.telegramId, {
    balance: res.newBalance,
    reason: "WITHDRAW_REFUNDED",
  });
  realtimeService.notifyAdminEvent({
    type: "withdrawal_rejected",
    payload: { withdrawalId: withdrawId, userId: res.user.id },
  });

  return res;
}

export async function transferBetweenPlayers(
  senderId: string,
  receiverId: string,
  amount: number,
  note?: string
) {
  if (senderId === receiverId) throw new Error("CANNOT_TRANSFER_TO_SELF");

  return prisma.$transaction(async (tx) => {
    const settings = await getSystemSettings(tx);
    if (!settings.transferEnabled) throw new Error("TRANSFER_DISABLED");

    const amountCents = Math.round(amount * 100);
    if (amountCents < toCents(settings.minTransfer)) {
      throw new Error(`MIN_TRANSFER:${settings.minTransfer.toString()}`);
    }
    if (amountCents > toCents(settings.maxTransfer)) {
      throw new Error(`MAX_TRANSFER:${settings.maxTransfer.toString()}`);
    }

    const [sender, receiver] = await Promise.all([
      tx.user.findUnique({ where: { id: senderId } }),
      tx.user.findUnique({ where: { id: receiverId } }),
    ]);
    if (!sender || sender.isBanned || !sender.phoneNumber) {
      throw new Error("SENDER_NOT_ELIGIBLE");
    }
    if (!receiver || receiver.isBanned || !receiver.phoneNumber) {
      throw new Error("RECEIVER_NOT_FOUND");
    }

    // Lock wallets in deterministic sorted userId order to avoid deadlocks
    const [firstId, secondId] =
      senderId < receiverId ? [senderId, receiverId] : [receiverId, senderId];
    await lockAndGetWallet(tx, firstId);
    await lockAndGetWallet(tx, secondId);

    const senderWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: senderId } });
    const receiverWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: receiverId } });

    const senderBalCents = toCents(senderWallet.balance);
    if (senderBalCents < amountCents) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    const nextSenderCents = senderBalCents - amountCents;
    const nextReceiverCents = toCents(receiverWallet.balance) + amountCents;

    await tx.wallet.update({
      where: { userId: senderId },
      data: { balance: centsToDecimal(nextSenderCents) },
    });
    await tx.wallet.update({
      where: { userId: receiverId },
      data: { balance: centsToDecimal(nextReceiverCents) },
    });

    const transfer = await tx.walletTransfer.create({
      data: {
        senderId,
        receiverId,
        amount: centsToDecimal(amountCents),
        note: note || null,
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId: senderId,
        type: "TRANSFER_OUT",
        amount: centsToDecimal(-amountCents),
        balanceAfter: centsToDecimal(nextSenderCents),
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        note: `Transfer to ${receiver.firstName} (${receiver.phoneNumber})`,
      },
    });

    await tx.walletTransaction.create({
      data: {
        userId: receiverId,
        type: "TRANSFER_IN",
        amount: centsToDecimal(amountCents),
        balanceAfter: centsToDecimal(nextReceiverCents),
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        note: `Transfer from ${sender.firstName} (${sender.phoneNumber})`,
      },
    });

    return {
      transfer,
      sender,
      receiver,
      senderBalance: centsToNumber(nextSenderCents),
      receiverBalance: centsToNumber(nextReceiverCents),
    };
  });
}

export async function adminAdjustWallet(
  targetUserId: string,
  deltaAmount: number,
  actorId: string,
  actorRole: UserRole,
  note: string
) {
  const res = await prisma.$transaction(async (tx) => {
    const wallet = await lockAndGetWallet(tx, targetUserId);
    const deltaCents = Math.round(deltaAmount * 100);
    if (deltaCents === 0) throw new Error("ZERO_ADJUSTMENT");

    const beforeCents = toCents(wallet.balance);
    const afterCents = beforeCents + deltaCents;
    if (afterCents < 0) throw new Error("NEGATIVE_BALANCE_NOT_ALLOWED");

    await tx.wallet.update({
      where: { userId: targetUserId },
      data: { balance: centsToDecimal(afterCents) },
    });

    await tx.walletTransaction.create({
      data: {
        userId: targetUserId,
        type: "ADMIN_ADJUSTMENT",
        amount: centsToDecimal(deltaCents),
        balanceAfter: centsToDecimal(afterCents),
        referenceType: "ADMIN",
        referenceId: actorId,
        actorId,
        note,
      },
    });

    await recordAuditLog(tx, {
      actorId,
      actorRole,
      action: "ADMIN_ADJUST_WALLET",
      targetType: "User",
      targetId: targetUserId,
      before: { balance: centsToNumber(beforeCents) },
      after: { balance: centsToNumber(afterCents), delta: deltaAmount, note },
    });

    return {
      balance: centsToNumber(afterCents),
      lockedBalance: centsToNumber(toCents(wallet.lockedBalance)),
    };
  });

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { telegramId: true },
  });
  if (targetUser && targetUser.telegramId) {
    realtimeService.notifyWalletUpdate(targetUser.telegramId, {
      balance: res.balance,
      reason: "ADMIN_ADJUST",
    });
  }
  realtimeService.notifyAdminEvent({
    type: "user_adjusted",
    payload: { userId: targetUserId, balance: res.balance },
  });

  return res;
}

export async function deductBetTx(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  roundId: string
) {
  const cents = toCents(amount);
  const wallet = await lockAndGetWallet(tx, userId);
  const currentCents = toCents(wallet.balance);
  if (currentCents < cents) {
    throw new Error("INSUFFICIENT_BALANCE");
  }
  const nextCents = currentCents - cents;
  const balanceAfter = centsToDecimal(nextCents);

  await tx.wallet.update({
    where: { userId },
    data: { balance: balanceAfter },
  });

  await tx.walletTransaction.create({
    data: {
      userId,
      type: "BET",
      amount: centsToDecimal(cents),
      balanceAfter,
      referenceType: "GAME_ROUND",
      referenceId: roundId,
      note: `Game bet in round ${roundId}`,
    },
  });

  return balanceAfter;
}

export async function creditWinTx(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  roundId: string
) {
  const cents = toCents(amount);
  const wallet = await lockAndGetWallet(tx, userId);
  const currentCents = toCents(wallet.balance);
  const nextCents = currentCents + cents;
  const balanceAfter = centsToDecimal(nextCents);

  await tx.wallet.update({
    where: { userId },
    data: { balance: balanceAfter },
  });

  await tx.walletTransaction.create({
    data: {
      userId,
      type: "WIN",
      amount: centsToDecimal(cents),
      balanceAfter,
      referenceType: "GAME_ROUND",
      referenceId: roundId,
      note: `Bingo prize in round ${roundId}`,
    },
  });

  return balanceAfter;
}

