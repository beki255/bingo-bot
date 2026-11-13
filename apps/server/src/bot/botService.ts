import crypto from "node:crypto";
import { Bot, InlineKeyboard, InputFile, Keyboard } from "grammy";
import type { Language } from "@prisma/client";
import type { Server as SocketIOServer } from "socket.io";
import fs from "node:fs";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { recordAuditLog } from "../services/auditService.js";
import {
  approveDepositRequest,
  createWithdrawRequest,
  getSystemSettings,
  getUserWalletSummary,
  markWithdrawPaid,
  rejectDepositRequest,
  rejectWithdrawRequest,
  transferBetweenPlayers,
} from "../services/walletService.js";
import {
  createDepositRequest,
  extractTransactionRefFromInput,
  findOrCreateTelegramUser,
  normalizePhoneNumber,
  verifyUserPhone,
} from "../services/userService.js";

type BotConvState =
  | { step: "DEPOSIT_AMOUNT" }
  | { step: "DEPOSIT_SELECT_ACCOUNT"; amount: number }
  | { step: "DEPOSIT_RECEIPT"; paymentAccountId: string; amount: number }
  | { step: "WITHDRAW_PROVIDER" }
  | { step: "WITHDRAW_ACC_NAME"; provider: string }
  | { step: "WITHDRAW_ACC_NUM"; provider: string; accountName: string }
  | { step: "WITHDRAW_AMOUNT"; provider: string; accountName: string; accountNumber: string }
  | { step: "TRANSFER_RECEIVER" }
  | { step: "TRANSFER_AMOUNT"; receiverId: string; receiverName: string; receiverPhone: string }
  | { step: "ADMIN_EDIT_PAYMENT_NUMBER"; accountId: string; provider: string }
  | null;

interface AdminMsgRef {
  chatId: string;
  messageId: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

class BotService {
  private bot: Bot | null = null;
  private io: SocketIOServer | null = null;

  private isAdminRole(role: string): boolean {
    return role === "SUPER_ADMIN" || role === "CASHIER";
  }

  attachIO(io: SocketIOServer) {
    this.io = io;
  }

  async sendSafeMessage(telegramId: bigint | string, text: string) {
    if (!this.bot) return;
    try {
      await this.bot.api.sendMessage(telegramId.toString(), text, { parse_mode: "HTML" });
    } catch (err) {
      console.error(`Failed to send Telegram message to ${telegramId}:`, err);
    }
  }

  private shareContactKeyboard(lang: Language) {
    return new Keyboard()
      .requestContact(lang === "AM" ? "📞 ስልክ ቁጥር አጋራ (Share contact)" : "📞 Share contact")
      .resized()
      .oneTime();
  }

  private mainInlineKeyboard(lang: Language) {
    const kb = new InlineKeyboard();
    if (env.miniAppUrl.startsWith("https://")) {
      kb.webApp(lang === "AM" ? "Play 🎮" : "Play 🎮", env.miniAppUrl);
    } else {
      kb.text("Play 🎮", "menu:play");
    }
    kb.text("Register 📝", "menu:register").row();

    kb.text("Check Balance 💵", "menu:balance")
      .text("Deposit 💵", "menu:deposit")
      .row();

    kb.text("Contact Support ☎️", "menu:support")
      .text("Instruction 📖", "menu:instruction")
      .row();

    kb.text("Transfer 🎁", "menu:transfer")
      .text("Withdraw 🤑", "menu:withdraw")
      .row();

    kb.text("Invite 🔗", "menu:invite")
      .text(lang === "AM" ? "🌐 Language (EN)" : "🌐 ቋንቋ (አማ)", "menu:lang");

    return kb;
  }

  private cancelKeyboard(lang: Language) {
    return new InlineKeyboard().text(lang === "AM" ? "❌ ሰርዝ (Cancel)" : "❌ Cancel", "flow:cancel");
  }

  private async setBotState(userId: string, state: BotConvState) {
    if (state === null) {
      await prisma.$executeRaw`UPDATE "User" SET "botState" = NULL WHERE id = ${userId}`;
      return;
    }
    await prisma.user.update({
      where: { id: userId },
      data: { botState: state as unknown as object },
    });
  }

  private async sendLanguagePrompt(ctx: { reply: (text: string, opts?: object) => Promise<unknown> }) {
    const kb = new InlineKeyboard()
      .text("🇪🇹 አማርኛ", "set_lang:AM")
      .text("🇬🇧 English", "set_lang:EN");
    await ctx.reply(
      "🌐 እባክዎ ቋንቋ ይምረጡ / Please choose your language:",
      { reply_markup: kb }
    );
  }

  private async sendRegisterRequired(
    ctx: { reply: (text: string, opts?: object) => Promise<unknown> },
    lang: Language
  ) {
    const settings = await getSystemSettings();
    const bonusNote = settings.welcomeBonusEnabled
      ? lang === "AM"
        ? `\n🎁 ሲመዘገቡ <b>${settings.welcomeBonusAmount.toString()} ብር</b> የእንኳን ደህና መጡ ቦነስ ወደ Wallet-ዎ ይገባል!`
        : `\n🎁 Register now and get <b>${settings.welcomeBonusAmount.toString()} ETB</b> welcome bonus in your Wallet!`
      : "";

    const msg =
      lang === "AM"
        ? `⚠️ ወደ <b>${escapeHtml(settings.botName)}</b> እንኳን በደህና መጡ!\n\nከመጠቀምዎ በፊት መጀመሪያ ከታች ያለውን <b>📞 Share contact</b> ቁልፍ ተጭነው መመዝገብ (Register) አለብዎት።${bonusNote}`
        : `⚠️ Welcome to <b>${escapeHtml(settings.botName)}</b>!\n\nPlease <b>Register</b> first by tapping the <b>📞 Share contact</b> button below before using any option.${bonusNote}`;

    await ctx.reply(msg, {
      parse_mode: "HTML",
      reply_markup: this.shareContactKeyboard(lang),
    });
  }

  private async sendWelcomeMenu(
    sendPhoto: (photo: string | InputFile, opts: object) => Promise<unknown>,
    sendText: (text: string, opts: object) => Promise<unknown>,
    lang: Language
  ) {
    const settings = await getSystemSettings();
    const caption =
      lang === "AM"
        ? `👋 እንኳን ወደ ${settings.botName} በደህና መጡ! ከታች ያሉትን አማራጮች ይምረጡ።`
        : `👋 Welcome to ${settings.botName}! Choose an Option below.`;

    const kb = this.mainInlineKeyboard(lang);

    if (settings.welcomeBannerUrl) {
      try {
        const photoArg =
          settings.welcomeBannerUrl.startsWith("http://") ||
          settings.welcomeBannerUrl.startsWith("https://")
            ? settings.welcomeBannerUrl
            : fs.existsSync(settings.welcomeBannerUrl)
            ? new InputFile(settings.welcomeBannerUrl)
            : null;
        if (photoArg) {
          await sendPhoto(photoArg, { caption, reply_markup: kb });
          return;
        }
      } catch (err) {
        console.error("Failed sending welcome banner photo, falling back to text:", err);
      }
    }

    await sendText(caption, { reply_markup: kb });
  }

  private async sendBalanceCard(
    reply: (text: string, opts?: object) => Promise<unknown>,
    user: { firstName: string; lastName: string | null; phoneNumber: string | null; language: Language | null },
    balance: number
  ) {
    const lang: Language = user.language || "AM";
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    const phone = user.phoneNumber || "-";
    const balStr = Number.isInteger(balance) ? String(balance) : balance.toFixed(2);

    const block = [
      `Name:         ${fullName}`,
      `Phone:        ${phone}`,
      `Wallet:       ${balStr} ETB`,
    ].join("\n");

    const text = `💼 <b>Account Info</b>\n<pre>${escapeHtml(block)}</pre>`;
    const kb = new InlineKeyboard()
      .text(lang === "AM" ? "💵 Deposit" : "💵 Deposit", "menu:deposit")
      .text(lang === "AM" ? "🤑 Withdraw" : "🤑 Withdraw", "menu:withdraw");

    await reply(text, { parse_mode: "HTML", reply_markup: kb });
  }

  private async startDepositFlow(
    userId: string,
    lang: Language,
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const settings = await getSystemSettings();
    await this.setBotState(userId, { step: "DEPOSIT_AMOUNT" });
    const minDep = settings.minDeposit.toString();
    const msg =
      lang === "AM"
        ? `💰 ማስገባት የሚፈልጉትን መጠን ከ${minDep} ብር ጀምሮ ያስገቡ።`
        : `💰 Enter the amount you want to deposit (minimum ${minDep} ETB).`;
    await reply(msg, { reply_markup: this.cancelKeyboard(lang) });
  }

  private async startWithdrawFlow(
    userId: string,
    lang: Language,
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const [wallet, settings] = await Promise.all([
      getUserWalletSummary(userId),
      getSystemSettings(),
    ]);
    if (wallet.balance < Number(settings.minWithdraw)) {
      await reply(
        lang === "AM"
          ? `⚠️ ለማውጣት ቢያንስ <b>${settings.minWithdraw.toString()} ብር</b> ያስፈልጋል።\nWallet: <b>${wallet.balance.toFixed(2)} ብር</b>`
          : `⚠️ Minimum withdrawal is <b>${settings.minWithdraw.toString()} ETB</b>.\nWallet: <b>${wallet.balance.toFixed(2)} ETB</b>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const kb = new InlineKeyboard()
      .text("Telebirr", "wd_prov:Telebirr")
      .text("CBE", "wd_prov:CBE")
      .row()
      .text("CBE Birr", "wd_prov:CBE Birr")
      .text("BOA", "wd_prov:BOA")
      .row()
      .text(lang === "AM" ? "❌ ሰርዝ" : "❌ Cancel", "flow:cancel");

    await reply(
      lang === "AM"
        ? `🤑 Wallet: <b>${wallet.balance.toFixed(2)} ብር</b>\nገንዘቡ የሚላክበትን መንገድ ይምረጡ፦`
        : `🤑 Wallet: <b>${wallet.balance.toFixed(2)} ETB</b>\nSelect withdrawal method:`,
      { parse_mode: "HTML", reply_markup: kb }
    );
  }

  private async startTransferFlow(
    userId: string,
    lang: Language,
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const settings = await getSystemSettings();
    if (!settings.transferEnabled) {
      await reply(
        lang === "AM" ? "⚠️ Transfer በአሁኑ ጊዜ ዝግ ነው።" : "⚠️ Transfers are currently disabled."
      );
      return;
    }
    await this.setBotState(userId, { step: "TRANSFER_RECEIVER" });
    await reply(
      lang === "AM"
        ? "🎁 ገንዘብ የሚቀበለውን ተጫዋች <b>ስልክ ቁጥር</b> ይጻፉ (ለምሳሌ <code>0911223344</code>)፦"
        : "🎁 Enter the recipient player's <b>Phone Number</b> (e.g. <code>0911223344</code>):",
      { parse_mode: "HTML", reply_markup: this.cancelKeyboard(lang) }
    );
  }

  private async sendInviteInfo(
    user: { id: string; referralCode: string; language: Language | null },
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const lang: Language = user.language || "AM";
    const [settings, referralCount] = await Promise.all([
      getSystemSettings(),
      prisma.user.count({ where: { referredById: user.id } }),
    ]);
    const botUser = env.botUsername || this.bot?.botInfo?.username || "BingoBot";
    const link = `https://t.me/${botUser}?start=${user.referralCode}`;
    const msg =
      lang === "AM"
        ? `🔗 <b>ጓደኛ ይጋብዙ!</b>\n\nየእርስዎ መጋበዣ ሊንክ:\n<code>${link}</code>\n\n👥 የጋበዟቸው ሰዎች: <b>${referralCount}</b>\n🎁 Referral Bonus: ${
            settings.referralBonusEnabled
              ? `✅ ክፍት (${settings.referralBonusValue.toString()})`
              : "❌ ዝግ"
          }`
        : `🔗 <b>Invite Friends!</b>\n\nYour invite link:\n<code>${link}</code>\n\n👥 Invited Users: <b>${referralCount}</b>\n🎁 Referral Bonus: ${
            settings.referralBonusEnabled
              ? `✅ Active (${settings.referralBonusValue.toString()})`
              : "❌ Disabled"
          }`;
    await reply(msg, { parse_mode: "HTML" });
  }

  private async sendInstruction(
    lang: Language,
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const msg =
      lang === "AM"
        ? `📖 <b>የጨዋታ መመሪያ</b>\n\n` +
          `1. <b>Deposit 💵</b> በመጫን ብር ያስገቡ።\n` +
          `2. <b>Play 🎮</b> በመጫን የሚፈልጉትን የጨዋታ ክፍል (Auto ወይም Manual) እና ካርቴላ ይምረጡ።\n` +
          `3. Manual ክፍል ውስጥ ቁጥሮችን በእጅ Mark አድርገው ሲሞሉ <b>BINGO!</b> ይጫኑ።\n` +
          `4. <b>Withdraw 🤑</b> በመጫን ያሸነፉትን ገንዘብ ወዲያው ማውጣት ይችላሉ።`
        : `📖 <b>How to Play</b>\n\n` +
          `1. Tap <b>Deposit 💵</b> to top up your Wallet.\n` +
          `2. Tap <b>Play 🎮</b> to pick an Auto or Manual room and buy cartelas.\n` +
          `3. In Manual rooms, mark numbers and press <b>BINGO!</b> when you complete the pattern.\n` +
          `4. Tap <b>Withdraw 🤑</b> anytime to cash out.`;
    await reply(msg, { parse_mode: "HTML" });
  }

  private async sendSupport(
    lang: Language,
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const settings = await getSystemSettings();
    const msg =
      lang === "AM"
        ? `☎️ <b>እርዳታ / Support</b>\n\nማንኛውም ጥያቄ ወይም የክፍያ ችግር ካለ ${escapeHtml(settings.supportUsername)} ላይ ያናግሩን።`
        : `☎️ <b>Contact Support</b>\n\nNeed help? Message ${escapeHtml(settings.supportUsername)}.`;
    await reply(msg, { parse_mode: "HTML" });
  }

  private async sendPlayPrompt(
    lang: Language,
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const kb = new InlineKeyboard();
    if (env.miniAppUrl.startsWith("https://")) {
      kb.webApp("🎮 Open Mini App", env.miniAppUrl);
    }
    const msg = env.miniAppUrl.startsWith("https://")
      ? lang === "AM"
        ? "🎮 ወደ ቢንጎ ጨዋታ ለመግባት ከታች ያለውን ቁልፍ ይጫኑ፦"
        : "🎮 Tap below to launch the Bingo Mini App:"
      : lang === "AM"
      ? `🎮 Mini App በአሁኑ ጊዜ Local dev ላይ ነው (${env.miniAppUrl}) — Production HTTPS URL ሲገባ እዚህ በቀጥታ ይከፈታል።`
      : `🎮 Mini App is currently running on local dev (${env.miniAppUrl}) — it opens directly inside Telegram once HTTPS URL is set.`;

    await reply(msg, { reply_markup: env.miniAppUrl.startsWith("https://") ? kb : undefined });
  }

  private async sendAdminPanel(
    reply: (text: string, opts?: object) => Promise<unknown>,
    user: { role: string; firstName: string; language: Language | null }
  ) {
    const lang: Language = user.language || "AM";
    const [pendingDeposits, pendingWithdraws, totalUsers, settings] = await Promise.all([
      prisma.depositRequest.count({ where: { status: "PENDING" } }),
      prisma.withdrawRequest.count({ where: { status: "PENDING" } }),
      prisma.user.count(),
      getSystemSettings(),
    ]);

    const msg =
      lang === "AM"
        ? `🛡️ <b>${escapeHtml(settings.botName)} — Admin Panel</b>\n\n` +
          `👤 Role: <b>${escapeHtml(user.role)}</b>\n` +
          `👥 ጠቅላላ ተጠቃሚዎች: <b>${totalUsers}</b>\n` +
          `⏳ Pending Deposits: <b>${pendingDeposits}</b>\n` +
          `⏳ Pending Withdraws: <b>${pendingWithdraws}</b>\n\n` +
          `<i>ከታች ፈጣን የBot መቆጣጠሪያዎች አሉ፤ ሙሉ አስተዳደር በWeb Admin Portal ላይ ይገኛል።</i>`
        : `🛡️ <b>${escapeHtml(settings.botName)} — Admin Panel</b>\n\n` +
          `👤 Role: <b>${escapeHtml(user.role)}</b>\n` +
          `👥 Total Users: <b>${totalUsers}</b>\n` +
          `⏳ Pending Deposits: <b>${pendingDeposits}</b>\n` +
          `⏳ Pending Withdraws: <b>${pendingWithdraws}</b>\n\n` +
          `<i>Quick bot controls below; full management is on the Web Admin Portal.</i>`;

    const kb = new InlineKeyboard()
      .text(`💳 Deposits (${pendingDeposits})`, "adm:pending_deposits")
      .text(`💸 Withdraws (${pendingWithdraws})`, "adm:pending_withdraws")
      .row()
      .text("📊 Live Stats", "adm:stats")
      .text("🏦 Payment Accounts", "adm:accounts")
      .row()
      .text("🔐 Web Admin Code", "adm:web_code")
      .text(lang === "AM" ? "🌐 Language (EN)" : "🌐 ቋንቋ (አማ)", "adm:lang")
      .row()
      .text(lang === "AM" ? "👤 Player Menu (ለሙከራ)" : "👤 Player Menu (Test)", "adm:player_view");

    await reply(msg, { parse_mode: "HTML", reply_markup: kb });
  }

  private async sendAdminStats(
    reply: (text: string, opts?: object) => Promise<unknown>,
    lang: Language
  ) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [totalUsers, pendingDeposits, pendingWithdraws, todayDepAgg, todayRoundAgg] =
      await Promise.all([
        prisma.user.count(),
        prisma.depositRequest.count({ where: { status: "PENDING" } }),
        prisma.withdrawRequest.count({ where: { status: "PENDING" } }),
        prisma.depositRequest.aggregate({
          where: { status: "APPROVED", reviewedAt: { gte: startOfDay } },
          _sum: { amount: true },
        }),
        prisma.gameRound.aggregate({
          where: { status: "FINISHED", endedAt: { gte: startOfDay } },
          _sum: { houseCutAmount: true, totalPot: true },
        }),
      ]);

    const kb = new InlineKeyboard().text(lang === "AM" ? "🔙 Admin Panel" : "🔙 Admin Panel", "adm:home");
    await reply(
      `📊 <b>Live Stats</b>\n\n` +
        `👥 Users: <b>${totalUsers}</b>\n` +
        `⏳ Pending Deposits: <b>${pendingDeposits}</b>\n` +
        `⏳ Pending Withdraws: <b>${pendingWithdraws}</b>\n` +
        `💵 Today Deposits: <b>${Number(todayDepAgg._sum.amount ?? 0).toFixed(2)} ETB</b>\n` +
        `🏦 Today House Cut: <b>${Number(todayRoundAgg._sum.houseCutAmount ?? 0).toFixed(2)} ETB</b>`,
      { parse_mode: "HTML", reply_markup: kb }
    );
  }

  private async sendAdminLoginCode(
    userId: string,
    lang: Language,
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const code = String(crypto.randomInt(100000, 999999));
    await prisma.adminOtpCode.create({
      data: { userId, code, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    });
    const kb = new InlineKeyboard().text("🔙 Admin Panel", "adm:home");
    await reply(
      lang === "AM"
        ? `🔐 <b>Web Admin Login Code</b>\n\nCode: <code>${code}</code>\nለ5 ደቂቃ ያገለግላል።\nPortal: ${escapeHtml(env.adminWebUrl)}`
        : `🔐 <b>Web Admin Login Code</b>\n\nCode: <code>${code}</code>\nExpires in 5 minutes.\nPortal: ${escapeHtml(env.adminWebUrl)}`,
      { parse_mode: "HTML", reply_markup: kb }
    );
  }

  private async sendPendingDepositsToAdmin(
    reply: (text: string, opts?: object) => Promise<unknown>,
    lang: Language
  ) {
    const list = await prisma.depositRequest.findMany({
      where: { status: "PENDING" },
      include: { user: true, paymentAccount: true },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
    const backKb = new InlineKeyboard().text("🔙 Admin Panel", "adm:home");
    if (list.length === 0) {
      await reply(
        lang === "AM" ? "✅ በመጠባበቅ ላይ ያለ Deposit የለም።" : "✅ No pending deposit requests.",
        { reply_markup: backKb }
      );
      return;
    }

    for (const dep of list) {
      const caption =
        `💳 <b>Pending Deposit</b>\n` +
        `👤 ${escapeHtml(dep.user.firstName)} (${escapeHtml(dep.user.phoneNumber ?? "No phone")})\n` +
        `🏦 ${escapeHtml(dep.paymentAccount.provider)} - ${escapeHtml(dep.paymentAccount.accountNumber)}\n` +
        `💵 Amount: <b>${dep.amount.toString()} ETB</b>\n` +
        `🔖 Tx Ref: <code>${escapeHtml(dep.transactionRef)}</code>` +
        (dep.receiptText ? `\n📝 SMS:\n<code>${escapeHtml(dep.receiptText.slice(0, 300))}</code>` : "");
      const kb = new InlineKeyboard()
        .text("✅ Approve", `dep_approve:${dep.id}`)
        .text("❌ Reject", `dep_reject:${dep.id}`);
      await reply(caption, { parse_mode: "HTML", reply_markup: kb });
    }
    await reply(
      lang === "AM" ? `⬆️ ከላይ ${list.length} Deposit ጥያቄዎች ታይተዋል።` : `⬆️ Showing ${list.length} pending deposits.`,
      { reply_markup: backKb }
    );
  }

  private async sendPendingWithdrawsToAdmin(
    reply: (text: string, opts?: object) => Promise<unknown>,
    lang: Language
  ) {
    const list = await prisma.withdrawRequest.findMany({
      where: { status: "PENDING" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
    const backKb = new InlineKeyboard().text("🔙 Admin Panel", "adm:home");
    if (list.length === 0) {
      await reply(
        lang === "AM" ? "✅ በመጠባበቅ ላይ ያለ Withdraw የለም።" : "✅ No pending withdrawal requests.",
        { reply_markup: backKb }
      );
      return;
    }

    for (const wr of list) {
      const text =
        `💸 <b>Pending Withdrawal</b>\n` +
        `👤 ${escapeHtml(wr.user.firstName)} (${escapeHtml(wr.user.phoneNumber ?? "No phone")})\n` +
        `🏦 ${escapeHtml(wr.provider)} | ${escapeHtml(wr.accountName)}\n` +
        `🔢 Account: <code>${escapeHtml(wr.accountNumber)}</code>\n` +
        `💵 Amount: <b>${wr.amount.toString()} ETB</b>`;
      const kb = new InlineKeyboard()
        .text("✅ Mark Paid", `wd_paid:${wr.id}`)
        .text("❌ Reject & Refund", `wd_reject:${wr.id}`);
      await reply(text, { parse_mode: "HTML", reply_markup: kb });
    }
    await reply(
      lang === "AM" ? `⬆️ ከላይ ${list.length} Withdraw ጥያቄዎች ታይተዋል።` : `⬆️ Showing ${list.length} pending withdrawals.`,
      { reply_markup: backKb }
    );
  }

  private async sendPaymentAccountsAdmin(
    reply: (text: string, opts?: object) => Promise<unknown>,
    userRole: string,
    lang: Language
  ) {
    const accounts = await prisma.paymentAccount.findMany({ orderBy: { sortOrder: "asc" } });
    const kb = new InlineKeyboard();
    const lines: string[] = [];

    for (const acc of accounts) {
      const statusBadge = acc.isActive ? "✅ Active" : "⏸ Inactive";
      lines.push(
        `• <b>${escapeHtml(acc.provider)}</b> (${statusBadge})\n` +
          `  Number: <code>${escapeHtml(acc.accountNumber)}</code> (${escapeHtml(acc.accountName)})`
      );
      if (userRole === "SUPER_ADMIN") {
        kb.text(
          `${acc.isActive ? "⏸ Disable" : "✅ Enable"} ${acc.provider}`,
          `adm:acc_toggle:${acc.id}`
        )
          .text(`✏️ Edit ${acc.provider} #`, `adm:acc_num:${acc.id}`)
          .row();
      }
    }
    kb.text("🔙 Admin Panel", "adm:home");

    const header =
      lang === "AM"
        ? `🏦 <b>የክፍያ አካውንቶች (Payment Accounts)</b>\n\n`
        : `🏦 <b>Payment Accounts</b>\n\n`;
    const body =
      lines.length > 0
        ? lines.join("\n\n")
        : lang === "AM"
        ? "ምንም አካውንት የለም።"
        : "No payment accounts.";
    const footer =
      lang === "AM"
        ? "\n\n<i>አዲስ አካውንት መጨመር/ማጥፋት በWeb Admin Portal ላይ ይሠራል።</i>"
        : "\n\n<i>Adding/deleting accounts is available in the Web Admin Portal.</i>";

    await reply(`${header}${body}${footer}`, { parse_mode: "HTML", reply_markup: kb });
  }

  async notifyAdminsNewDeposit(depositId: string) {
    const dep = await prisma.depositRequest.findUnique({
      where: { id: depositId },
      include: { user: true, paymentAccount: true },
    });
    if (!dep) return;

    this.io?.to("admins").emit("admin:depositCreated", {
      id: dep.id,
      amount: Number(dep.amount),
      transactionRef: dep.transactionRef,
      userName: dep.user.firstName,
      phone: dep.user.phoneNumber,
    });

    if (!this.bot) return;

    const admins = await prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "CASHIER"] }, isBanned: false },
    });

    const caption =
      `💳 <b>New Deposit Request</b>\n` +
      `👤 User: ${escapeHtml(dep.user.firstName)} (${escapeHtml(dep.user.phoneNumber ?? "No phone")})\n` +
      `🏦 Account: ${escapeHtml(dep.paymentAccount.provider)} - ${escapeHtml(dep.paymentAccount.accountNumber)}\n` +
      `💵 Amount: <b>${dep.amount.toString()} ETB</b>\n` +
      `🔖 Tx Ref: <code>${escapeHtml(dep.transactionRef)}</code>` +
      (dep.receiptText ? `\n📝 SMS:\n<code>${escapeHtml(dep.receiptText.slice(0, 400))}</code>` : "");

    const kb = new InlineKeyboard()
      .text("✅ Approve", `dep_approve:${dep.id}`)
      .text("❌ Reject", `dep_reject:${dep.id}`);

    const refs: AdminMsgRef[] = [];
    for (const admin of admins) {
      try {
        const sent = dep.screenshotFileId
          ? await this.bot.api.sendPhoto(admin.telegramId.toString(), dep.screenshotFileId, {
              caption,
              parse_mode: "HTML",
              reply_markup: kb,
            })
          : await this.bot.api.sendMessage(admin.telegramId.toString(), caption, {
              parse_mode: "HTML",
              reply_markup: kb,
            });
        refs.push({ chatId: admin.telegramId.toString(), messageId: sent.message_id });
      } catch (err) {
        console.error("Failed notifying admin for deposit:", err);
      }
    }

    if (refs.length > 0) {
      await prisma.depositRequest.update({
        where: { id: dep.id },
        data: { adminMessageIds: refs as unknown as object },
      });
    }
  }

  async notifyAdminsNewWithdraw(withdrawId: string) {
    const wr = await prisma.withdrawRequest.findUnique({
      where: { id: withdrawId },
      include: { user: true },
    });
    if (!wr) return;

    this.io?.to("admins").emit("admin:withdrawCreated", {
      id: wr.id,
      amount: Number(wr.amount),
      provider: wr.provider,
      accountNumber: wr.accountNumber,
      userName: wr.user.firstName,
    });

    if (!this.bot) return;

    const admins = await prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "CASHIER"] }, isBanned: false },
    });

    const text =
      `💸 <b>New Withdrawal Request</b>\n` +
      `👤 User: ${escapeHtml(wr.user.firstName)} (${escapeHtml(wr.user.phoneNumber ?? "No phone")})\n` +
      `🏦 Provider: ${escapeHtml(wr.provider)}\n` +
      `📛 Name: ${escapeHtml(wr.accountName)}\n` +
      `🔢 Account: <code>${escapeHtml(wr.accountNumber)}</code>\n` +
      `💵 Amount: <b>${wr.amount.toString()} ETB</b>`;

    const kb = new InlineKeyboard()
      .text("✅ Mark Paid", `wd_paid:${wr.id}`)
      .text("❌ Reject & Refund", `wd_reject:${wr.id}`);

    const refs: AdminMsgRef[] = [];
    for (const admin of admins) {
      try {
        const sent = await this.bot.api.sendMessage(admin.telegramId.toString(), text, {
          parse_mode: "HTML",
          reply_markup: kb,
        });
        refs.push({ chatId: admin.telegramId.toString(), messageId: sent.message_id });
      } catch (err) {
        console.error("Failed notifying admin for withdraw:", err);
      }
    }

    if (refs.length > 0) {
      await prisma.withdrawRequest.update({
        where: { id: wr.id },
        data: { adminMessageIds: refs as unknown as object },
      });
    }
  }

  async syncAdminMessageResolution(
    adminMessageIds: unknown,
    statusLine: string,
    isPhoto: boolean,
    clicked?: AdminMsgRef & { isPhoto: boolean }
  ) {
    if (!this.bot) return;
    const refs: AdminMsgRef[] = Array.isArray(adminMessageIds)
      ? [...(adminMessageIds as AdminMsgRef[])]
      : [];
    if (
      clicked &&
      !refs.some(
        (r) => String(r.chatId) === String(clicked.chatId) && Number(r.messageId) === Number(clicked.messageId)
      )
    ) {
      refs.push({ chatId: clicked.chatId, messageId: clicked.messageId });
    }
    for (const ref of refs) {
      const usePhoto =
        clicked && String(ref.chatId) === String(clicked.chatId) && Number(ref.messageId) === Number(clicked.messageId)
          ? clicked.isPhoto
          : isPhoto;
      try {
        if (usePhoto) {
          await this.bot.api.editMessageCaption(ref.chatId, ref.messageId, {
            caption: statusLine,
            parse_mode: "HTML",
          });
        } else {
          await this.bot.api.editMessageText(ref.chatId, ref.messageId, statusLine, {
            parse_mode: "HTML",
          });
        }
      } catch {
        // Ignore if already edited
      }
    }
  }

  async start() {
    if (!env.botToken || env.botToken === "placeholder") {
      console.log("BOT_TOKEN not set — Telegram Bot polling skipped (API & DB active).");
      return;
    }

    const bot = new Bot(env.botToken);
    this.bot = bot;

    bot.catch((err) => {
      console.error("Telegram bot error:", err.error);
    });

    // Register exact Bot Menu Commands shown in screenshots
    try {
      await bot.api.setMyCommands([
        { command: "start", description: "Start" },
        { command: "register", description: "Register" },
        { command: "play", description: "Play" },
        { command: "deposit", description: "Deposit" },
        { command: "balance", description: "Balance" },
        { command: "withdraw", description: "Withdraw" },
        { command: "transfer", description: "Transfer" },
        { command: "invite", description: "Invite" },
        { command: "instruction", description: "Instruction" },
        { command: "support", description: "Support" },
      ]);
    } catch (err) {
      console.error("Failed setting bot commands:", err);
    }

    // Helper: fetch or create user and enforce Language -> Registration gate
    const ensureOnboarded = async (
      ctx: {
        from?: { id: number; first_name: string; last_name?: string; username?: string };
        reply: (text: string, opts?: object) => Promise<unknown>;
      },
      options?: { allowUnregistered?: boolean }
    ) => {
      if (!ctx.from) return null;
      const user = await findOrCreateTelegramUser({
        telegramId: BigInt(ctx.from.id),
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        username: ctx.from.username,
      });
      if (user.isBanned) {
        await ctx.reply("🚫 Your account has been suspended.");
        return null;
      }
      if (!user.language) {
        await this.sendLanguagePrompt(ctx);
        return null;
      }
      if (!user.phoneNumber && !options?.allowUnregistered) {
        await this.sendRegisterRequired(ctx, user.language);
        return null;
      }
      return user;
    };

    // /start [refCode]
    bot.command("start", async (ctx) => {
      if (!ctx.from) return;
      const startParam = typeof ctx.match === "string" ? ctx.match.trim() : "";
      const user = await findOrCreateTelegramUser({
        telegramId: BigInt(ctx.from.id),
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        username: ctx.from.username,
        referralCodeUsed: startParam || undefined,
      });

      await this.setBotState(user.id, null);
      if (user.isBanned) {
        await ctx.reply("🚫 Your account has been suspended.");
        return;
      }

      if (this.isAdminRole(user.role)) {
        await this.sendAdminPanel((text, opts) => ctx.reply(text, opts), user);
        return;
      }

      if (!user.language) {
        await this.sendLanguagePrompt(ctx);
        return;
      }

      if (!user.phoneNumber) {
        await this.sendRegisterRequired(ctx, user.language);
        return;
      }

      await this.sendWelcomeMenu(
        (photo, opts) => ctx.replyWithPhoto(photo, opts),
        (text, opts) => ctx.reply(text, opts),
        user.language
      );
    });

    bot.command("admin", async (ctx) => {
      if (!ctx.from) return;
      const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
      if (!user || !this.isAdminRole(user.role) || user.isBanned) return;
      await this.setBotState(user.id, null);
      await this.sendAdminPanel((text, opts) => ctx.reply(text, opts), user);
    });

    bot.command("register", async (ctx) => {
      const user = await ensureOnboarded(ctx, { allowUnregistered: true });
      if (!user) return;
      const lang: Language = user.language || "AM";
      if (user.phoneNumber) {
        await ctx.reply(
          lang === "AM"
            ? `✅ አስቀድመው በስልክ ቁጥር (${user.phoneNumber}) ተመዝግበዋል!`
            : `✅ You are already registered with ${user.phoneNumber}!`
        );
        return;
      }
      await this.sendRegisterRequired(ctx, lang);
    });

    bot.command("play", async (ctx) => {
      const user = await ensureOnboarded(ctx);
      if (!user) return;
      await this.setBotState(user.id, null);
      await this.sendPlayPrompt(user.language!, (text, opts) => ctx.reply(text, opts));
    });

    bot.command("balance", async (ctx) => {
      const user = await ensureOnboarded(ctx);
      if (!user) return;
      await this.setBotState(user.id, null);
      const w = await getUserWalletSummary(user.id);
      await this.sendBalanceCard((text, opts) => ctx.reply(text, opts), user, w.balance);
    });

    bot.command("deposit", async (ctx) => {
      const user = await ensureOnboarded(ctx);
      if (!user) return;
      await this.startDepositFlow(user.id, user.language!, (text, opts) => ctx.reply(text, opts));
    });

    bot.command("withdraw", async (ctx) => {
      const user = await ensureOnboarded(ctx);
      if (!user) return;
      await this.setBotState(user.id, null);
      await this.startWithdrawFlow(user.id, user.language!, (text, opts) => ctx.reply(text, opts));
    });

    bot.command("transfer", async (ctx) => {
      const user = await ensureOnboarded(ctx);
      if (!user) return;
      await this.startTransferFlow(user.id, user.language!, (text, opts) => ctx.reply(text, opts));
    });

    bot.command("invite", async (ctx) => {
      const user = await ensureOnboarded(ctx);
      if (!user) return;
      await this.setBotState(user.id, null);
      await this.sendInviteInfo(user, (text, opts) => ctx.reply(text, opts));
    });

    bot.command("instruction", async (ctx) => {
      const user = await ensureOnboarded(ctx);
      if (!user) return;
      await this.setBotState(user.id, null);
      await this.sendInstruction(user.language!, (text, opts) => ctx.reply(text, opts));
    });

    bot.command("support", async (ctx) => {
      const user = await ensureOnboarded(ctx);
      if (!user) return;
      await this.setBotState(user.id, null);
      await this.sendSupport(user.language!, (text, opts) => ctx.reply(text, opts));
    });

    bot.command("cancel", async (ctx) => {
      if (!ctx.from) return;
      const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
      if (!user) return;
      await this.setBotState(user.id, null);
      const lang: Language = user.language || "AM";
      await ctx.reply(lang === "AM" ? "❌ ተሰርዟል።" : "❌ Cancelled.");
    });

    // Admin commands: /adminlogin, /stats, /broadcast
    bot.command("adminlogin", async (ctx) => {
      if (!ctx.from) return;
      const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
      if (!user || !this.isAdminRole(user.role) || user.isBanned) return;
      await this.sendAdminLoginCode(user.id, user.language || "AM", (text, opts) => ctx.reply(text, opts));
    });

    bot.command("stats", async (ctx) => {
      if (!ctx.from) return;
      const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
      if (!user || !this.isAdminRole(user.role) || user.isBanned) return;
      await this.sendAdminStats((text, opts) => ctx.reply(text, opts), user.language || "AM");
    });

    bot.command("broadcast", async (ctx) => {
      if (!ctx.from) return;
      const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
      if (!user || user.role !== "SUPER_ADMIN" || user.isBanned) return;

      const text = typeof ctx.match === "string" ? ctx.match.trim() : "";
      if (!text) {
        await ctx.reply("Usage: <code>/broadcast Message here</code>", { parse_mode: "HTML" });
        return;
      }
      const targets = await prisma.user.findMany({
        where: { isBanned: false },
        select: { telegramId: true },
      });
      await ctx.reply(`📣 Sending to ${targets.length} users...`);
      let sent = 0;
      for (const target of targets) {
        try {
          await bot.api.sendMessage(target.telegramId.toString(), `📢 ${text}`);
          sent++;
        } catch {
          // blocked
        }
        await new Promise((r) => setTimeout(r, 40));
      }
      await ctx.reply(`✅ Broadcast sent: ${sent}/${targets.length}`);
    });

    // Contact verification handler (Step 2 -> Step 3)
    bot.on("message:contact", async (ctx) => {
      if (!ctx.from || !ctx.message.contact) return;
      if (ctx.message.contact.user_id !== ctx.from.id) {
        await ctx.reply("⚠️ እባክዎ የራስዎን ስልክ ቁጥር ብቻ ያጋሩ / Please share your own contact only.");
        return;
      }

      const user = await findOrCreateTelegramUser({
        telegramId: BigInt(ctx.from.id),
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        username: ctx.from.username,
      });

      const lang: Language = user.language || "AM";
      try {
        const res = await verifyUserPhone(user.id, ctx.message.contact.phone_number);
        let msg =
          lang === "AM"
            ? `✅ በተሳካ ሁኔታ ተመዝግበዋል (${res.user.phoneNumber})!`
            : `✅ Registered successfully (${res.user.phoneNumber})!`;
        if (res.welcomeBonus > 0) {
          msg +=
            lang === "AM"
              ? `\n🎁 የ<b>${res.welcomeBonus} ብር</b> Welcome Bonus ወደ Wallet-ዎ ገብቷል!`
              : `\n🎁 <b>${res.welcomeBonus} ETB</b> Welcome Bonus added to your Wallet!`;
        }
        await ctx.reply(msg, {
          parse_mode: "HTML",
          reply_markup: { remove_keyboard: true },
        });
        await this.sendWelcomeMenu(
          (photo, opts) => ctx.replyWithPhoto(photo, opts),
          (text, opts) => ctx.reply(text, opts),
          lang
        );
      } catch (err: unknown) {
        const code = err instanceof Error ? err.message : "";
        if (code === "PHONE_ALREADY_USED") {
          await ctx.reply(
            lang === "AM"
              ? "❌ ይህ ስልክ ቁጥር ቀደም ብሎ በሌላ አካውንት ተመዝግቧል።"
              : "❌ This phone number is already registered on another account."
          );
        } else {
          await ctx.reply("❌ Registration failed. Please try again.");
        }
      }
    });

    // Inline callback queries
    bot.on("callback_query:data", async (ctx) => {
      if (!ctx.from) return;
      const data = ctx.callbackQuery.data;

      const caller = await findOrCreateTelegramUser({
        telegramId: BigInt(ctx.from.id),
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        username: ctx.from.username,
      });

      if (caller.isBanned) {
        await ctx.answerCallbackQuery({ text: "Account suspended", show_alert: true });
        return;
      }

      // Cancel active flow (accessible for players and admins alike)
      if (data === "flow:cancel") {
        const cancelLang: Language = caller.language || "AM";
        await this.setBotState(caller.id, null);
        await ctx.answerCallbackQuery({ text: cancelLang === "AM" ? "ተሰርዟል" : "Cancelled" });
        await ctx.reply(cancelLang === "AM" ? "❌ ተሰርዟል።" : "❌ Cancelled.");
        return;
      }

      // Admin Panel navigation & quick actions
      if (data.startsWith("adm:")) {
        if (!this.isAdminRole(caller.role)) {
          await ctx.answerCallbackQuery({ text: "Admin/Cashier only", show_alert: true });
          return;
        }
        const adminLang: Language = caller.language || "AM";

        if (data === "adm:home") {
          await this.setBotState(caller.id, null);
          await ctx.answerCallbackQuery();
          await this.sendAdminPanel((t, opts) => ctx.reply(t, opts), caller);
          return;
        }

        if (data === "adm:lang") {
          const nextLang: Language = adminLang === "AM" ? "EN" : "AM";
          const updated = await prisma.user.update({
            where: { id: caller.id },
            data: { language: nextLang },
          });
          await ctx.answerCallbackQuery({
            text: nextLang === "AM" ? "ቋንቋ ወደ አማርኛ ተቀይሯል" : "Language set to English",
          });
          await this.sendAdminPanel((t, opts) => ctx.reply(t, opts), updated);
          return;
        }

        if (data === "adm:stats") {
          await ctx.answerCallbackQuery();
          await this.sendAdminStats((t, opts) => ctx.reply(t, opts), adminLang);
          return;
        }

        if (data === "adm:web_code") {
          await ctx.answerCallbackQuery();
          await this.sendAdminLoginCode(caller.id, adminLang, (t, opts) => ctx.reply(t, opts));
          return;
        }

        if (data === "adm:pending_deposits") {
          await ctx.answerCallbackQuery();
          await this.sendPendingDepositsToAdmin((t, opts) => ctx.reply(t, opts), adminLang);
          return;
        }

        if (data === "adm:pending_withdraws") {
          await ctx.answerCallbackQuery();
          await this.sendPendingWithdrawsToAdmin((t, opts) => ctx.reply(t, opts), adminLang);
          return;
        }

        if (data === "adm:accounts") {
          await ctx.answerCallbackQuery();
          await this.sendPaymentAccountsAdmin((t, opts) => ctx.reply(t, opts), caller.role, adminLang);
          return;
        }

        if (data.startsWith("adm:acc_toggle:")) {
          if (caller.role !== "SUPER_ADMIN") {
            await ctx.answerCallbackQuery({ text: "Super Admin only", show_alert: true });
            return;
          }
          const accId = data.slice("adm:acc_toggle:".length);
          const acc = await prisma.paymentAccount.findUnique({ where: { id: accId } });
          if (!acc) {
            await ctx.answerCallbackQuery({ text: "Account not found", show_alert: true });
            return;
          }
          const updated = await prisma.paymentAccount.update({
            where: { id: acc.id },
            data: { isActive: !acc.isActive },
          });
          await recordAuditLog(prisma, {
            actorId: caller.id,
            actorRole: caller.role,
            action: "TOGGLE_PAYMENT_ACCOUNT",
            targetType: "PaymentAccount",
            targetId: updated.id,
            before: { isActive: acc.isActive },
            after: { isActive: updated.isActive },
          });
          await ctx.answerCallbackQuery({
            text: updated.isActive ? `✅ ${updated.provider} enabled` : `⏸ ${updated.provider} disabled`,
          });
          await this.sendPaymentAccountsAdmin((t, opts) => ctx.reply(t, opts), caller.role, adminLang);
          return;
        }

        if (data.startsWith("adm:acc_num:")) {
          if (caller.role !== "SUPER_ADMIN") {
            await ctx.answerCallbackQuery({ text: "Super Admin only", show_alert: true });
            return;
          }
          const accId = data.slice("adm:acc_num:".length);
          const acc = await prisma.paymentAccount.findUnique({ where: { id: accId } });
          if (!acc) {
            await ctx.answerCallbackQuery({ text: "Account not found", show_alert: true });
            return;
          }
          await this.setBotState(caller.id, {
            step: "ADMIN_EDIT_PAYMENT_NUMBER",
            accountId: acc.id,
            provider: acc.provider,
          });
          await ctx.answerCallbackQuery();
          await ctx.reply(
            adminLang === "AM"
              ? `✏️ የ<b>${escapeHtml(acc.provider)}</b> አዲሱን ስልክ/አካውንት ቁጥር ይጻፉ (የአሁኑ: <code>${escapeHtml(acc.accountNumber)}</code>)፦`
              : `✏️ Enter new number for <b>${escapeHtml(acc.provider)}</b> (current: <code>${escapeHtml(acc.accountNumber)}</code>):`,
            { parse_mode: "HTML", reply_markup: this.cancelKeyboard(adminLang) }
          );
          return;
        }

        if (data === "adm:player_view") {
          await this.setBotState(caller.id, null);
          await ctx.answerCallbackQuery();
          await this.sendWelcomeMenu(
            (photo, opts) => ctx.replyWithPhoto(photo, opts),
            (t, opts) => ctx.reply(t, opts),
            adminLang
          );
          await ctx.reply(
            adminLang === "AM"
              ? "👤 <b>Player View</b> — ወደ Admin Panel ለመመለስ /admin ወይም /start ይላኩ።"
              : "👤 <b>Player View</b> — Send /admin or /start anytime to return to the Admin Panel.",
            { parse_mode: "HTML" }
          );
          return;
        }
      }

      // Admin/Cashier resolution buttons (work directly without player language/phone gates)
      if (
        data.startsWith("dep_approve:") ||
        data.startsWith("dep_reject:") ||
        data.startsWith("wd_paid:") ||
        data.startsWith("wd_reject:")
      ) {
        if (!this.isAdminRole(caller.role)) {
          await ctx.answerCallbackQuery({ text: "Admin/Cashier only", show_alert: true });
          return;
        }

        const clickedMsg = ctx.callbackQuery.message;
        const clickedRef = clickedMsg
          ? {
              chatId: String(clickedMsg.chat.id),
              messageId: clickedMsg.message_id,
              isPhoto: Boolean("photo" in clickedMsg && Array.isArray(clickedMsg.photo) && clickedMsg.photo.length > 0),
            }
          : undefined;

        if (data.startsWith("dep_approve:")) {
          const depositId = data.slice("dep_approve:".length);
          try {
            const res = await approveDepositRequest(depositId, caller.id, caller.role);
            await ctx.answerCallbackQuery({ text: "✅ Approved!" });
            await this.syncAdminMessageResolution(
              res.deposit.adminMessageIds,
              `✅ <b>APPROVED</b> by ${escapeHtml(caller.firstName)}\n👤 ${escapeHtml(res.user.firstName)} | 💵 ${res.deposit.amount.toString()} ETB\n🔖 <code>${escapeHtml(res.deposit.transactionRef)}</code>`,
              Boolean(res.deposit.screenshotFileId),
              clickedRef
            );
            this.io?.to("admins").emit("admin:depositUpdated", { id: depositId, status: "APPROVED" });
            const uLang = res.user.language || "AM";
            await this.sendSafeMessage(
              res.user.telegramId,
              uLang === "AM"
                ? `✅ የ<b>${res.deposit.amount.toString()} ብር</b> Deposit ጥያቄዎ ጸድቋል! ሂሳብዎ ወደ Wallet-ዎ ገብቷል።`
                : `✅ Your deposit of <b>${res.deposit.amount.toString()} ETB</b> has been approved!`
            );
          } catch (err) {
            await ctx.answerCallbackQuery({
              text: err instanceof Error ? err.message : "Error",
              show_alert: true,
            });
          }
          return;
        }

        if (data.startsWith("dep_reject:")) {
          const depositId = data.slice("dep_reject:".length);
          try {
            const res = await rejectDepositRequest(depositId, caller.id, caller.role, "Rejected via Bot");
            await ctx.answerCallbackQuery({ text: "❌ Rejected" });
            await this.syncAdminMessageResolution(
              res.deposit.adminMessageIds,
              `❌ <b>REJECTED</b> by ${escapeHtml(caller.firstName)}\n👤 ${escapeHtml(res.user.firstName)} | 💵 ${res.deposit.amount.toString()} ETB\n🔖 <code>${escapeHtml(res.deposit.transactionRef)}</code>`,
              Boolean(res.deposit.screenshotFileId),
              clickedRef
            );
            this.io?.to("admins").emit("admin:depositUpdated", { id: depositId, status: "REJECTED" });
            const uLang = res.user.language || "AM";
            await this.sendSafeMessage(
              res.user.telegramId,
              uLang === "AM"
                ? `❌ የ<b>${res.deposit.amount.toString()} ብር</b> Deposit ጥያቄዎ ውድቅ ተደርጓል። እባክዎ መረጃዎን ያረጋግጡ።`
                : `❌ Your deposit of <b>${res.deposit.amount.toString()} ETB</b> was rejected.`
            );
          } catch (err) {
            await ctx.answerCallbackQuery({
              text: err instanceof Error ? err.message : "Error",
              show_alert: true,
            });
          }
          return;
        }

        if (data.startsWith("wd_paid:")) {
          const withdrawId = data.slice("wd_paid:".length);
          try {
            const res = await markWithdrawPaid(withdrawId, caller.id, caller.role);
            await ctx.answerCallbackQuery({ text: "✅ Marked Paid!" });
            await this.syncAdminMessageResolution(
              res.withdraw.adminMessageIds,
              `✅ <b>PAID</b> by ${escapeHtml(caller.firstName)}\n👤 ${escapeHtml(res.user.firstName)} | 💵 ${res.withdraw.amount.toString()} ETB`,
              false,
              clickedRef
            );
            this.io?.to("admins").emit("admin:withdrawUpdated", { id: withdrawId, status: "PAID" });
            const uLang = res.user.language || "AM";
            await this.sendSafeMessage(
              res.user.telegramId,
              uLang === "AM"
                ? `✅ የ<b>${res.withdraw.amount.toString()} ብር</b> Withdraw ክፍያዎ ተልኳል!`
                : `✅ Your withdrawal of <b>${res.withdraw.amount.toString()} ETB</b> has been paid!`
            );
          } catch (err) {
            await ctx.answerCallbackQuery({
              text: err instanceof Error ? err.message : "Error",
              show_alert: true,
            });
          }
          return;
        }

        if (data.startsWith("wd_reject:")) {
          const withdrawId = data.slice("wd_reject:".length);
          try {
            const res = await rejectWithdrawRequest(
              withdrawId,
              caller.id,
              caller.role,
              "Rejected via Bot"
            );
            await ctx.answerCallbackQuery({ text: "❌ Rejected & Refunded" });
            await this.syncAdminMessageResolution(
              res.withdraw.adminMessageIds,
              `❌ <b>REJECTED & REFUNDED</b> by ${escapeHtml(caller.firstName)}\n👤 ${escapeHtml(res.user.firstName)} | 💵 ${res.withdraw.amount.toString()} ETB`,
              false,
              clickedRef
            );
            this.io?.to("admins").emit("admin:withdrawUpdated", { id: withdrawId, status: "REJECTED" });
            const uLang = res.user.language || "AM";
            await this.sendSafeMessage(
              res.user.telegramId,
              uLang === "AM"
                ? `❌ የ<b>${res.withdraw.amount.toString()} ብር</b> Withdraw ጥያቄዎ ውድቅ ተደርጎ ብሩ ወደ Wallet-ዎ ተመልሷል።`
                : `❌ Your withdrawal of <b>${res.withdraw.amount.toString()} ETB</b> was rejected and refunded.`
            );
          } catch (err) {
            await ctx.answerCallbackQuery({
              text: err instanceof Error ? err.message : "Error",
              show_alert: true,
            });
          }
          return;
        }
      }

      // Language selection FIRST
      if (data === "set_lang:AM" || data === "set_lang:EN") {
        const chosen: Language = data === "set_lang:AM" ? "AM" : "EN";
        await prisma.user.update({ where: { id: caller.id }, data: { language: chosen } });
        await ctx.answerCallbackQuery();

        if (!caller.phoneNumber) {
          await this.sendRegisterRequired(ctx, chosen);
          return;
        }
        await this.sendWelcomeMenu(
          (photo, opts) => ctx.replyWithPhoto(photo, opts),
          (text, opts) => ctx.reply(text, opts),
          chosen
        );
        return;
      }

      // Enforce language selected
      if (!caller.language) {
        await ctx.answerCallbackQuery();
        await this.sendLanguagePrompt(ctx);
        return;
      }
      const lang = caller.language;

      // Enforce registration before ANY menu action except Register 📝
      if (data === "menu:register") {
        await ctx.answerCallbackQuery();
        if (caller.phoneNumber) {
          await ctx.reply(
            lang === "AM"
              ? `✅ አስቀድመው ተመዝግበዋል (${caller.phoneNumber})`
              : `✅ Already registered (${caller.phoneNumber})`
          );
        } else {
          await this.sendRegisterRequired(ctx, lang);
        }
        return;
      }

      // Strict registration gate for all remaining callbacks
      if (!caller.phoneNumber) {
        await ctx.answerCallbackQuery({
          text:
            lang === "AM"
              ? "⚠️ መጀመሪያ Register ማድረግ አለብዎት!"
              : "⚠️ Please Register first!",
          show_alert: true,
        });
        await this.sendRegisterRequired(ctx, lang);
        return;
      }

      if (data === "menu:lang") {
        const nextLang: Language = lang === "AM" ? "EN" : "AM";
        await prisma.user.update({ where: { id: caller.id }, data: { language: nextLang } });
        await ctx.answerCallbackQuery({
          text: nextLang === "AM" ? "ቋንቋ ወደ አማርኛ ተቀይሯል" : "Language set to English",
        });
        await this.sendWelcomeMenu(
          (photo, opts) => ctx.replyWithPhoto(photo, opts),
          (text, opts) => ctx.reply(text, opts),
          nextLang
        );
        return;
      }

      if (data === "menu:play") {
        await ctx.answerCallbackQuery();
        await this.sendPlayPrompt(lang, (text, opts) => ctx.reply(text, opts));
        return;
      }

      if (data === "menu:balance") {
        await ctx.answerCallbackQuery();
        const w = await getUserWalletSummary(caller.id);
        await this.sendBalanceCard((text, opts) => ctx.reply(text, opts), caller, w.balance);
        return;
      }

      if (data === "menu:deposit") {
        await ctx.answerCallbackQuery();
        await this.startDepositFlow(caller.id, lang, (text, opts) => ctx.reply(text, opts));
        return;
      }

      if (data === "menu:withdraw") {
        await ctx.answerCallbackQuery();
        await this.startWithdrawFlow(caller.id, lang, (text, opts) => ctx.reply(text, opts));
        return;
      }

      if (data === "menu:transfer") {
        await ctx.answerCallbackQuery();
        await this.startTransferFlow(caller.id, lang, (text, opts) => ctx.reply(text, opts));
        return;
      }

      if (data === "menu:invite") {
        await ctx.answerCallbackQuery();
        await this.sendInviteInfo(caller, (text, opts) => ctx.reply(text, opts));
        return;
      }

      if (data === "menu:instruction") {
        await ctx.answerCallbackQuery();
        await this.sendInstruction(lang, (text, opts) => ctx.reply(text, opts));
        return;
      }

      if (data === "menu:support") {
        await ctx.answerCallbackQuery();
        await this.sendSupport(lang, (text, opts) => ctx.reply(text, opts));
        return;
      }

      // Deposit Step 2 -> Step 3: Player clicked PaymentAccount button (e.g. Telebirr)
      if (data.startsWith("dep_acc:")) {
        const accountId = data.slice("dep_acc:".length);
        const state = caller.botState as BotConvState;
        if (!state || state.step !== "DEPOSIT_SELECT_ACCOUNT") {
          await ctx.answerCallbackQuery({ text: "Session expired, start /deposit again", show_alert: true });
          return;
        }
        const [acc, settings] = await Promise.all([
          prisma.paymentAccount.findUnique({ where: { id: accountId } }),
          getSystemSettings(),
        ]);
        if (!acc || !acc.isActive) {
          await ctx.answerCallbackQuery({ text: "Account inactive", show_alert: true });
          return;
        }

        await this.setBotState(caller.id, {
          step: "DEPOSIT_RECEIPT",
          paymentAccountId: acc.id,
          amount: state.amount,
        });
        await ctx.answerCallbackQuery();

        const msg =
          lang === "AM"
            ? `የሚያጋጥማቹ የክፍያ ችግር:\n${escapeHtml(settings.supportUsername)} ላይ ፃፉልን።\n\n` +
              `1. ከታች ባለው የ<b>${escapeHtml(acc.provider)}</b> አካውንት <b>${state.amount}</b> ብር ያስገቡ\n\n` +
              `    Account: <code>${escapeHtml(acc.accountNumber)}</code>\n` +
              `    Name: ${escapeHtml(acc.accountName)}\n\n` +
              `2. የከፈሉበትን አጭር የጹሁፍ መልዕክት(message) copy በማድረግ እዚ ላይ Paste አድርገው ያስገቡና ይላኩት 👇👇👇`
            : `Payment issue?\nMessage ${escapeHtml(settings.supportUsername)}.\n\n` +
              `1. Transfer <b>${state.amount} ETB</b> to the <b>${escapeHtml(acc.provider)}</b> account below:\n\n` +
              `    Account: <code>${escapeHtml(acc.accountNumber)}</code>\n` +
              `    Name: ${escapeHtml(acc.accountName)}\n\n` +
              `2. Copy & paste your payment confirmation SMS message here and send it 👇👇👇`;

        await ctx.reply(msg, { parse_mode: "HTML", reply_markup: this.cancelKeyboard(lang) });
        return;
      }

      // Withdraw provider choice
      if (data.startsWith("wd_prov:")) {
        const provider = data.slice("wd_prov:".length);
        await this.setBotState(caller.id, { step: "WITHDRAW_ACC_NAME", provider });
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "AM"
            ? `🏦 <b>${escapeHtml(provider)}</b>\nየሚቀበሉበትን <b>ሙሉ ስም</b> ይጻፉ፦`
            : `🏦 <b>${escapeHtml(provider)}</b>\nEnter recipient <b>Full Name</b>:`,
          { parse_mode: "HTML", reply_markup: this.cancelKeyboard(lang) }
        );
      }
    });

    // Optional photo screenshot support during DEPOSIT_RECEIPT
    bot.on("message:photo", async (ctx) => {
      if (!ctx.from) return;
      const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
      if (!user || user.isBanned) return;
      const state = user.botState as BotConvState;
      if (!state || state.step !== "DEPOSIT_RECEIPT") return;

      const lang: Language = user.language || "AM";
      const captionText = (ctx.message.caption || "").trim();
      const txRef = extractTransactionRefFromInput(captionText);
      if (!txRef) {
        await ctx.reply(
          lang === "AM"
            ? "⚠️ እባክዎ የክፍያውን የSMS መልዕክት (ወይም ከፎቶው ጋር Transaction ID በCaption) ይላኩ።"
            : "⚠️ Please paste the payment SMS text (or include Transaction ID in the photo caption)."
        );
        return;
      }

      const fileId = ctx.message.photo[ctx.message.photo.length - 1]?.file_id;
      try {
        const dep = await createDepositRequest(user.id, {
          paymentAccountId: state.paymentAccountId,
          amount: state.amount,
          transactionRef: txRef,
          receiptText: captionText || undefined,
          screenshotFileId: fileId,
        });
        await this.setBotState(user.id, null);
        await ctx.reply(
          lang === "AM"
            ? `✅ የ<b>${state.amount} ብር</b> Deposit ጥያቄዎ ለአድሚን ተልኳል! ሲጸድቅ መልዕክት ይደርስዎታል።`
            : `✅ Your deposit request of <b>${state.amount} ETB</b> has been sent for approval!`,
          { parse_mode: "HTML" }
        );
        await this.notifyAdminsNewDeposit(dep.id);
      } catch (err) {
        const code = err instanceof Error ? err.message : "ERROR";
        if (code === "DUPLICATE_TX_REF") {
          await ctx.reply(
            lang === "AM"
              ? "❌ ይህ Transaction ID / SMS መልዕክት ከዚህ በፊት ጥቅም ላይ ውሏል!"
              : "❌ This Transaction ID / SMS has already been used!"
          );
          return;
        }
        await this.setBotState(user.id, null);
        await ctx.reply(`❌ ${code}`);
      }
    });

    // Multi-step text input handler
    bot.on("message:text", async (ctx) => {
      if (!ctx.from) return;
      const text = ctx.message.text.trim();
      if (text.startsWith("/")) return;

      const rawUser = await findOrCreateTelegramUser({
        telegramId: BigInt(ctx.from.id),
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        username: ctx.from.username,
      });
      if (rawUser.isBanned) return;

      const rawState = rawUser.botState as BotConvState;
      if (rawUser.role === "SUPER_ADMIN" && rawState?.step === "ADMIN_EDIT_PAYMENT_NUMBER") {
        const adminLang: Language = rawUser.language || "AM";
        if (text.length < 5 || text.length > 30) {
          await ctx.reply(
            adminLang === "AM"
              ? "⚠️ ትክክለኛ የስልክ ወይም የአካውንት ቁጥር ያስገቡ (ከ5 እስከ 30 ፊደላት)።"
              : "⚠️ Enter a valid account/phone number (5-30 chars).",
            { reply_markup: this.cancelKeyboard(adminLang) }
          );
          return;
        }
        const existingAcc = await prisma.paymentAccount.findUnique({
          where: { id: rawState.accountId },
        });
        if (!existingAcc) {
          await this.setBotState(rawUser.id, null);
          await ctx.reply("❌ Account not found.");
          return;
        }
        const updatedAcc = await prisma.paymentAccount.update({
          where: { id: existingAcc.id },
          data: { accountNumber: text },
        });
        await recordAuditLog(prisma, {
          actorId: rawUser.id,
          actorRole: rawUser.role,
          action: "UPDATE_PAYMENT_ACCOUNT_NUMBER",
          targetType: "PaymentAccount",
          targetId: updatedAcc.id,
          before: { accountNumber: existingAcc.accountNumber },
          after: { accountNumber: updatedAcc.accountNumber },
        });
        await this.setBotState(rawUser.id, null);
        await ctx.reply(
          adminLang === "AM"
            ? `✅ የ<b>${escapeHtml(updatedAcc.provider)}</b> አካውንት ቁጥር ወደ <code>${escapeHtml(updatedAcc.accountNumber)}</code> ተቀይሯል!`
            : `✅ <b>${escapeHtml(updatedAcc.provider)}</b> account number updated to <code>${escapeHtml(updatedAcc.accountNumber)}</code>!`,
          { parse_mode: "HTML" }
        );
        await this.sendPaymentAccountsAdmin((t, opts) => ctx.reply(t, opts), rawUser.role, adminLang);
        return;
      }

      const user = await ensureOnboarded(ctx);
      if (!user) return;
      const lang: Language = user.language!;
      const state = user.botState as BotConvState;
      if (!state) return;

      // DEPOSIT STEP 1 -> STEP 2
      if (state.step === "DEPOSIT_AMOUNT") {
        const amount = Number(text);
        const settings = await getSystemSettings();
        if (
          !Number.isFinite(amount) ||
          amount < Number(settings.minDeposit) ||
          amount > Number(settings.maxDeposit)
        ) {
          await ctx.reply(
            lang === "AM"
              ? `⚠️ ትክክለኛ መጠን ያስገቡ (ከ ${settings.minDeposit.toString()} እስከ ${settings.maxDeposit.toString()} ብር)።`
              : `⚠️ Enter a valid amount (${settings.minDeposit.toString()} – ${settings.maxDeposit.toString()} ETB).`,
            { reply_markup: this.cancelKeyboard(lang) }
          );
          return;
        }

        const accounts = await prisma.paymentAccount.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        });
        if (accounts.length === 0) {
          await this.setBotState(user.id, null);
          await ctx.reply(
            lang === "AM" ? "⚠️ በአሁኑ ጊዜ ክፍት የክፍያ አካውንት የለም።" : "⚠️ No active payment accounts right now."
          );
          return;
        }

        await this.setBotState(user.id, { step: "DEPOSIT_SELECT_ACCOUNT", amount });
        const providersList = Array.from(new Set(accounts.map((a) => a.provider))).join(" / ");
        const kb = new InlineKeyboard();
        for (const a of accounts) {
          kb.text(`${a.provider}`, `dep_acc:${a.id}`).row();
        }
        kb.text(lang === "AM" ? "❌ ሰርዝ (Cancel)" : "❌ Cancel", "flow:cancel");

        const msg =
          lang === "AM"
            ? `❇️ ብር ማስገባት የሚችሉት አሁን በተቀመጠው የ<b>${escapeHtml(providersList)}</b> አካውንት ብቻ ነው።\n\n` +
              `🚫 ከዚህ ውጭ የላከ አናስተናግድም 🚫\n\n` +
              `👇 ከታች ያለውን ይምረጡ 👇`
            : `❇️ Deposits are ONLY accepted via the listed <b>${escapeHtml(providersList)}</b> account(s) below.\n\n` +
              `🚫 Transfers outside these accounts will not be processed 🚫\n\n` +
              `👇 Choose below 👇`;

        await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb });
        return;
      }

      // DEPOSIT STEP 3 -> COMPLETE (SMS Paste or Tx Ref)
      if (state.step === "DEPOSIT_RECEIPT") {
        const txRef = extractTransactionRefFromInput(text);
        if (!txRef) {
          await ctx.reply(
            lang === "AM"
              ? "⚠️ ከላኩት ጽሁፍ ውስጥ Transaction ID ማግኘት አልተቻለም። እባክዎ ሙሉውን የክፍያ SMS መልዕክት Copy/Paste ያድርጉ።"
              : "⚠️ Could not find a Transaction ID in your message. Please paste the full payment SMS confirmation.",
            { reply_markup: this.cancelKeyboard(lang) }
          );
          return;
        }

        try {
          const dep = await createDepositRequest(user.id, {
            paymentAccountId: state.paymentAccountId,
            amount: state.amount,
            transactionRef: txRef,
            receiptText: text,
          });
          await this.setBotState(user.id, null);
          await ctx.reply(
            lang === "AM"
              ? `✅ የ<b>${state.amount} ብር</b> Deposit ጥያቄዎ (Ref: <code>${escapeHtml(txRef)}</code>) ለአድሚን ተልኳል! ሲጸድቅ መልዕክት ይደርስዎታል።`
              : `✅ Your deposit request of <b>${state.amount} ETB</b> (Ref: <code>${escapeHtml(txRef)}</code>) has been submitted!`,
            { parse_mode: "HTML" }
          );
          await this.notifyAdminsNewDeposit(dep.id);
        } catch (err) {
          const code = err instanceof Error ? err.message : "ERROR";
          if (code === "DUPLICATE_TX_REF") {
            await ctx.reply(
              lang === "AM"
                ? "❌ ይህ የክፍያ መልዕክት (Transaction ID) ቀደም ብሎ ጥቅም ላይ ውሏል! ሌላ ትክክለኛ መልዕክት ይላኩ ወይም Cancel ይጫኑ።"
                : "❌ This Transaction ID has already been used! Send a valid SMS or tap Cancel.",
              { reply_markup: this.cancelKeyboard(lang) }
            );
            return;
          }
          await this.setBotState(user.id, null);
          await ctx.reply(`❌ ${code}`);
        }
        return;
      }

      // WITHDRAW STEPS
      if (state.step === "WITHDRAW_ACC_NAME") {
        if (text.length < 2) return;
        await this.setBotState(user.id, {
          step: "WITHDRAW_ACC_NUM",
          provider: state.provider,
          accountName: text,
        });
        await ctx.reply(
          lang === "AM"
            ? "🔢 የስልክ ወይም የባንክ <b>አካውንት ቁጥር</b> ይጻፉ፦"
            : "🔢 Enter the <b>Phone or Account Number</b>:",
          { parse_mode: "HTML", reply_markup: this.cancelKeyboard(lang) }
        );
        return;
      }

      if (state.step === "WITHDRAW_ACC_NUM") {
        if (text.length < 5) return;
        await this.setBotState(user.id, {
          step: "WITHDRAW_AMOUNT",
          provider: state.provider,
          accountName: state.accountName,
          accountNumber: text,
        });
        await ctx.reply(
          lang === "AM"
            ? "💵 ማውጣት የሚፈልጉትን <b>መጠን (ETB)</b> ይጻፉ፦"
            : "💵 Enter the <b>Amount (ETB)</b> to withdraw:",
          { parse_mode: "HTML", reply_markup: this.cancelKeyboard(lang) }
        );
        return;
      }

      if (state.step === "WITHDRAW_AMOUNT") {
        const amount = Number(text);
        if (!Number.isFinite(amount) || amount <= 0) {
          await ctx.reply(lang === "AM" ? "⚠️ ትክክለኛ ቁጥር ያስገቡ።" : "⚠️ Enter a valid number.");
          return;
        }
        try {
          const { withdraw } = await createWithdrawRequest(user.id, {
            provider: state.provider,
            accountName: state.accountName,
            accountNumber: state.accountNumber,
            amount,
          });
          await this.setBotState(user.id, null);
          await ctx.reply(
            lang === "AM"
              ? `✅ የ<b>${amount} ብር</b> Withdraw ጥያቄዎ ቀርቧል! ክፍያው እስኪላክ ገንዘቡ ተይዟል።`
              : `✅ Withdrawal request of <b>${amount} ETB</b> submitted!`,
            { parse_mode: "HTML" }
          );
          await this.notifyAdminsNewWithdraw(withdraw.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "ERROR";
          await this.setBotState(user.id, null);
          await ctx.reply(`❌ ${msg}`);
        }
        return;
      }

      // TRANSFER STEPS
      if (state.step === "TRANSFER_RECEIVER") {
        const normalized = normalizePhoneNumber(text);
        const receiver = await prisma.user.findUnique({ where: { phoneNumber: normalized } });
        if (!receiver || receiver.isBanned) {
          await ctx.reply(
            lang === "AM"
              ? "❌ በዚህ ስልክ ቁጥር የተመዘገበ ተጫዋች አልተገኘም። ቁጥሩን አረጋግጠው እንደገና ይጻፉ ወይም Cancel ይጫኑ።"
              : "❌ No registered player found with that phone number. Try again or Cancel.",
            { reply_markup: this.cancelKeyboard(lang) }
          );
          return;
        }
        if (receiver.id === user.id) {
          await ctx.reply(
            lang === "AM" ? "⚠️ ለራስዎ መላክ አይችሉም።" : "⚠️ You cannot transfer to yourself."
          );
          return;
        }
        await this.setBotState(user.id, {
          step: "TRANSFER_AMOUNT",
          receiverId: receiver.id,
          receiverName: receiver.firstName,
          receiverPhone: receiver.phoneNumber!,
        });
        await ctx.reply(
          lang === "AM"
            ? `👤 ተቀባይ: <b>${escapeHtml(receiver.firstName)}</b> (${escapeHtml(receiver.phoneNumber!)})\n\n💵 የሚልኩትን <b>መጠን (ETB)</b> ይጻፉ፦`
            : `👤 Recipient: <b>${escapeHtml(receiver.firstName)}</b> (${escapeHtml(receiver.phoneNumber!)})\n\n💵 Enter <b>Amount (ETB)</b> to transfer:`,
          { parse_mode: "HTML", reply_markup: this.cancelKeyboard(lang) }
        );
        return;
      }

      if (state.step === "TRANSFER_AMOUNT") {
        const amount = Number(text);
        if (!Number.isFinite(amount) || amount <= 0) {
          await ctx.reply(lang === "AM" ? "⚠️ ትክክለኛ ቁጥር ያስገቡ።" : "⚠️ Enter a valid amount.");
          return;
        }
        try {
          const res = await transferBetweenPlayers(user.id, state.receiverId, amount);
          await this.setBotState(user.id, null);
          await ctx.reply(
            lang === "AM"
              ? `✅ <b>${amount} ብር</b> ወደ <b>${escapeHtml(res.receiver.firstName)}</b> (${escapeHtml(res.receiver.phoneNumber!)}) በተሳካ ሁኔታ ተልኳል!\n💰 ቀሪ Wallet: <b>${res.senderBalance.toFixed(2)} ብር</b>`
              : `✅ Transferred <b>${amount} ETB</b> to <b>${escapeHtml(res.receiver.firstName)}</b>!\n💰 New Wallet: <b>${res.senderBalance.toFixed(2)} ETB</b>`,
            { parse_mode: "HTML" }
          );
          const rLang: Language = res.receiver.language || "AM";
          await this.sendSafeMessage(
            res.receiver.telegramId,
            rLang === "AM"
              ? `🎁 ከ<b>${escapeHtml(res.sender.firstName)}</b> <b>${amount} ብር</b> Transfer ደርሶዎታል!\n💰 Wallet: <b>${res.receiverBalance.toFixed(2)} ብር</b>`
              : `🎁 You received <b>${amount} ETB</b> from <b>${escapeHtml(res.sender.firstName)}</b>!\n💰 Wallet: <b>${res.receiverBalance.toFixed(2)} ETB</b>`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "ERROR";
          await this.setBotState(user.id, null);
          await ctx.reply(`❌ ${msg}`);
        }
      }
    });

    void bot
      .start({
        onStart: (info) => {
          console.log(`Telegram Bot @${info.username} started!`);
        },
      })
      .catch((err) => {
        console.error("Telegram Bot polling failed:", err);
      });
  }

  async stop() {
    if (this.bot) {
      await this.bot.stop();
    }
  }
}

export const botService = new BotService();

