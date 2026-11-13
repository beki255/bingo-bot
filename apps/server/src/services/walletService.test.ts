import "../config/env.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import {
  createDepositRequest,
  findOrCreateTelegramUser,
  verifyUserPhone,
} from "./userService.js";
import {
  approveDepositRequest,
  getUserWalletSummary,
  transferBetweenPlayers,
} from "./walletService.js";

describe("wallet & onboarding integration", () => {
  const tgA = BigInt(990000001);
  const tgB = BigInt(990000002);
  const tgC = BigInt(990000003);
  let userAId = "";
  let userBId = "";
  let userCId = "";
  let adminId = "";
  let payAccId = "";

  beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { telegramId: { in: [tgA, tgB, tgC] } },
    });

    const admin = await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
    adminId = admin.id;
    const pay = await prisma.paymentAccount.findFirstOrThrow({ where: { isActive: true } });
    payAccId = pay.id;

    const uA = await findOrCreateTelegramUser({ telegramId: tgA, firstName: "TesterA" });
    const uB = await findOrCreateTelegramUser({ telegramId: tgB, firstName: "TesterB" });
    const uC = await findOrCreateTelegramUser({ telegramId: tgC, firstName: "TesterC" });
    userAId = uA.id;
    userBId = uB.id;
    userCId = uC.id;
  });

  afterAll(async () => {
    await prisma.depositRequest.deleteMany({ where: { userId: { in: [userAId, userBId, userCId] } } });
    await prisma.walletTransfer.deleteMany({
      where: { OR: [{ senderId: userAId }, { receiverId: userBId }] },
    });
    await prisma.user.deleteMany({
      where: { telegramId: { in: [tgA, tgB, tgC] } },
    });
    await prisma.$disconnect();
  });

  it("grants 10 ETB welcome bonus once per unique phone and blocks duplicate phone", async () => {
    const resA = await verifyUserPhone(userAId, "0911998877");
    expect(resA.welcomeBonus).toBe(10);

    const wA = await getUserWalletSummary(userAId);
    expect(wA.balance).toBe(10);

    // Duplicate phone number on another Telegram account must fail
    await expect(verifyUserPhone(userCId, "+251911998877")).rejects.toThrow(
      "PHONE_ALREADY_USED"
    );

    const resB = await verifyUserPhone(userBId, "0922334455");
    expect(resB.welcomeBonus).toBe(10);
  });

  it("prevents duplicate transaction refs and credits approved deposits", async () => {
    const txRef = `TESTTX_${Date.now()}`;
    const dep = await createDepositRequest(userAId, {
      paymentAccountId: payAccId,
      amount: 50,
      transactionRef: txRef,
      receiptText: `Transfer ETB 50.00 Ref ${txRef}`,
    });
    expect(dep.status).toBe("PENDING");

    await expect(
      createDepositRequest(userBId, {
        paymentAccountId: payAccId,
        amount: 50,
        transactionRef: txRef,
      })
    ).rejects.toThrow("DUPLICATE_TX_REF");

    await approveDepositRequest(dep.id, adminId, "SUPER_ADMIN");
    const wA = await getUserWalletSummary(userAId);
    expect(wA.balance).toBe(60); // 10 welcome + 50 deposit
  });

  it("transfers funds atomically between verified players", async () => {
    const res = await transferBetweenPlayers(userAId, userBId, 25);
    expect(res.senderBalance).toBe(35);
    expect(res.receiverBalance).toBe(35);
  });
});

