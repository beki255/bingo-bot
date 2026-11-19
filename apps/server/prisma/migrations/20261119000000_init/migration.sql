-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('AM', 'EN');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'CASHIER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('DEPOSIT', 'WITHDRAW_LOCK', 'WITHDRAW_PAID', 'WITHDRAW_REFUND', 'TRANSFER_OUT', 'TRANSFER_IN', 'BET', 'BET_REFUND', 'WIN', 'WELCOME_BONUS', 'REFERRAL_BONUS', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WithdrawStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReferralTriggerType" AS ENUM ('ON_SIGNUP_VERIFIED', 'ON_FIRST_DEPOSIT', 'ON_EVERY_DEPOSIT_PERCENT', 'ON_EVERY_BET_PERCENT');

-- CreateEnum
CREATE TYPE "RoomMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "WinningPattern" AS ENUM ('ONE_LINE', 'TWO_LINES', 'FOUR_CORNERS', 'X_SHAPE', 'FULL_HOUSE');

-- CreateEnum
CREATE TYPE "GameRoundStatus" AS ENUM ('WAITING', 'COUNTDOWN', 'RUNNING', 'CLAIM_WINDOW', 'FINISHED', 'CANCELLED_REFUNDED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ACTIVE', 'BURNED_FALSE_CLAIM', 'WINNER', 'REFUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "phoneNumber" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "username" TEXT,
    "language" "Language",
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "passwordHash" TEXT,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "referralCode" TEXT NOT NULL,
    "referredById" TEXT,
    "welcomeBonusClaimed" BOOLEAN NOT NULL DEFAULT false,
    "botState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lockedBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransfer" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAccount" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "instructionsAm" TEXT NOT NULL DEFAULT '',
    "instructionsEn" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transactionRef" TEXT NOT NULL,
    "receiptText" TEXT,
    "screenshotFileId" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "adminMessageIds" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "WithdrawStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "payoutRef" TEXT,
    "reviewNote" TEXT,
    "adminMessageIds" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "botName" TEXT NOT NULL DEFAULT 'Bingo',
    "welcomeBannerUrl" TEXT NOT NULL DEFAULT '',
    "supportUsername" TEXT NOT NULL DEFAULT '',
    "channelUrl" TEXT NOT NULL DEFAULT '',
    "welcomeCaptionAm" TEXT NOT NULL DEFAULT '',
    "welcomeCaptionEn" TEXT NOT NULL DEFAULT '',
    "instructionAm" TEXT NOT NULL DEFAULT '',
    "instructionEn" TEXT NOT NULL DEFAULT '',
    "welcomeBonusEnabled" BOOLEAN NOT NULL DEFAULT true,
    "welcomeBonusAmount" DECIMAL(12,2) NOT NULL DEFAULT 10,
    "referralBonusEnabled" BOOLEAN NOT NULL DEFAULT true,
    "referralTriggerType" "ReferralTriggerType" NOT NULL DEFAULT 'ON_SIGNUP_VERIFIED',
    "referralBonusValue" DECIMAL(12,2) NOT NULL DEFAULT 50,
    "minDeposit" DECIMAL(12,2) NOT NULL DEFAULT 10,
    "maxDeposit" DECIMAL(12,2) NOT NULL DEFAULT 50000,
    "minWithdraw" DECIMAL(12,2) NOT NULL DEFAULT 50,
    "maxWithdraw" DECIMAL(12,2) NOT NULL DEFAULT 50000,
    "withdrawProviders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transferEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minTransfer" DECIMAL(12,2) NOT NULL DEFAULT 10,
    "maxTransfer" DECIMAL(12,2) NOT NULL DEFAULT 10000,
    "manualClaimWindowMs" INTEGER NOT NULL DEFAULT 2000,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessageAm" TEXT NOT NULL DEFAULT '',
    "maintenanceMessageEn" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "nameAm" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "mode" "RoomMode" NOT NULL DEFAULT 'AUTO',
    "stakeAmount" DECIMAL(12,2) NOT NULL,
    "houseCutPercent" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "maxCartelasPerUser" INTEGER,
    "cartelaPoolSize" INTEGER NOT NULL DEFAULT 100,
    "countdownSeconds" INTEGER NOT NULL DEFAULT 30,
    "waitTimeoutSeconds" INTEGER NOT NULL DEFAULT 300,
    "callIntervalMs" INTEGER NOT NULL DEFAULT 3500,
    "winningPattern" "WinningPattern" NOT NULL DEFAULT 'ONE_LINE',
    "freeCenter" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartelaTemplate" (
    "cartelaNumber" INTEGER NOT NULL,
    "grid" JSONB NOT NULL,

    CONSTRAINT "CartelaTemplate_pkey" PRIMARY KEY ("cartelaNumber")
);

-- CreateTable
CREATE TABLE "GameRound" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" "GameRoundStatus" NOT NULL DEFAULT 'WAITING',
    "calledNumbers" INTEGER[],
    "shuffledDeck" INTEGER[],
    "totalPot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "houseCutAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prizePool" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "countdownEndsAt" TIMESTAMP(3),
    "waitExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTicket" (
    "id" TEXT NOT NULL,
    "gameRoundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cartelaNumber" INTEGER NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "pricePaid" DECIMAL(12,2) NOT NULL,
    "prizeWon" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminOtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminOtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" "UserRole" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_createdAt_idx" ON "WalletTransaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransfer_senderId_createdAt_idx" ON "WalletTransfer"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransfer_receiverId_createdAt_idx" ON "WalletTransfer"("receiverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DepositRequest_transactionRef_key" ON "DepositRequest"("transactionRef");

-- CreateIndex
CREATE INDEX "DepositRequest_status_createdAt_idx" ON "DepositRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DepositRequest_userId_createdAt_idx" ON "DepositRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WithdrawRequest_status_createdAt_idx" ON "WithdrawRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WithdrawRequest_userId_createdAt_idx" ON "WithdrawRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Room_isActive_sortOrder_idx" ON "Room"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "GameRound_roomId_status_idx" ON "GameRound"("roomId", "status");

-- CreateIndex
CREATE INDEX "GameRound_status_createdAt_idx" ON "GameRound"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GameTicket_gameRoundId_userId_idx" ON "GameTicket"("gameRoundId", "userId");

-- CreateIndex
CREATE INDEX "GameTicket_userId_purchasedAt_idx" ON "GameTicket"("userId", "purchasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameTicket_gameRoundId_cartelaNumber_key" ON "GameTicket"("gameRoundId", "cartelaNumber");

-- CreateIndex
CREATE INDEX "AdminOtpCode_userId_code_idx" ON "AdminOtpCode"("userId", "code");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawRequest" ADD CONSTRAINT "WithdrawRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawRequest" ADD CONSTRAINT "WithdrawRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTicket" ADD CONSTRAINT "GameTicket_gameRoundId_fkey" FOREIGN KEY ("gameRoundId") REFERENCES "GameRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTicket" ADD CONSTRAINT "GameTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminOtpCode" ADD CONSTRAINT "AdminOtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

