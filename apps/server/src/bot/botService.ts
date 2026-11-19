import crypto from "node:crypto";
import { Bot, InlineKeyboard, InputFile, Keyboard } from "grammy";
import type { Language, Prisma } from "@prisma/client";
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

type AdminSettingKey =
  | "botName"
  | "supportUsername"
  | "channelUrl"
  | "welcomeCaptionAm"
  | "welcomeCaptionEn"
  | "instructionAm"
  | "instructionEn"
  | "welcomeBonusAmount"
  | "referralBonusValue"
  | "minDeposit"
  | "maxDeposit"
  | "minWithdraw"
  | "maxWithdraw"
  | "minTransfer"
  | "maxTransfer"
  | "withdrawProviders"
  | "maintenanceMessageAm"
  | "maintenanceMessageEn";

type AdminBoolSettingKey =
  | "welcomeBonusEnabled"
  | "referralBonusEnabled"
  | "transferEnabled"
  | "maintenanceMode";

const SETTINGS_META: Record<
  AdminSettingKey,
  { label: string; kind: "text" | "nullableText" | "number" | "list"; min?: number; hintAm: string; hintEn: string }
> = {
  botName: { label: "Bot Name", kind: "text", hintAm: "የቦቱን ስም ይጻፉ (ለምሳሌ Beteseb Bingo)", hintEn: "Enter new Bot Name" },
  supportUsername: { label: "Support Username", kind: "nullableText", hintAm: "Support username (@...) ይጻፉ ወይም clear ይላኩ", hintEn: "Enter @username or 'clear'" },
  channelUrl: { label: "Channel URL", kind: "nullableText", hintAm: "የChannel ሊንክ (https://t.me/...) ይጻፉ ወይም clear ይላኩ", hintEn: "Enter channel URL or 'clear'" },
  welcomeCaptionAm: { label: "Welcome Text (AM)", kind: "nullableText", hintAm: "በ/start ላይ የሚታየውን የአማርኛ መልዕክት ይጻፉ (ለነባሪ clear ይላኩ)", hintEn: "Enter Amharic /start caption or 'clear'" },
  welcomeCaptionEn: { label: "Welcome Text (EN)", kind: "nullableText", hintAm: "በ/start ላይ የሚታየውን የEnglish መልዕክት ይጻፉ (ለነባሪ clear ይላኩ)", hintEn: "Enter English /start caption or 'clear'" },
  instructionAm: { label: "Instruction (AM)", kind: "nullableText", hintAm: "የአማርኛ ጨዋታ መመሪያ (/instruction) ይጻፉ (ለነባሪ clear ይላኩ)", hintEn: "Enter Amharic instruction text or 'clear'" },
  instructionEn: { label: "Instruction (EN)", kind: "nullableText", hintAm: "የEnglish ጨዋታ መመሪያ ይጻፉ (ለነባሪ clear ይላኩ)", hintEn: "Enter English instruction text or 'clear'" },
  welcomeBonusAmount: { label: "Welcome Bonus (ETB)", kind: "number", min: 0, hintAm: "ለአዲስ ተመዝጋቢ የሚሰጠውን Bonus ብር (ቁጥር) ይጻፉ", hintEn: "Enter Welcome Bonus amount (ETB)" },
  referralBonusValue: { label: "Referral Bonus (10 Invites ETB)", kind: "number", min: 0, hintAm: "10 ሰው ሲጋብዙ የሚሰጠውን Bonus መጠን በብር (ለምሳሌ 50) ይጻፉ", hintEn: "Enter Referral Bonus amount in ETB for 10 invites (e.g. 50)" },
  minDeposit: { label: "Min Deposit", kind: "number", min: 1, hintAm: "ዝቅተኛ Deposit መጠን (ቁጥር) ይጻፉ", hintEn: "Enter Minimum Deposit (ETB)" },
  maxDeposit: { label: "Max Deposit", kind: "number", min: 1, hintAm: "ከፍተኛ Deposit መጠን (ቁጥር) ይጻፉ", hintEn: "Enter Maximum Deposit (ETB)" },
  minWithdraw: { label: "Min Withdraw", kind: "number", min: 1, hintAm: "ዝቅተኛ Withdraw መጠን (ቁጥር) ይጻፉ", hintEn: "Enter Minimum Withdraw (ETB)" },
  maxWithdraw: { label: "Max Withdraw", kind: "number", min: 1, hintAm: "ከፍተኛ Withdraw መጠን (ቁጥር) ይጻፉ", hintEn: "Enter Maximum Withdraw (ETB)" },
  minTransfer: { label: "Min Transfer", kind: "number", min: 1, hintAm: "ዝቅተኛ Transfer መጠን (ቁጥር) ይጻፉ", hintEn: "Enter Minimum Transfer (ETB)" },
  maxTransfer: { label: "Max Transfer", kind: "number", min: 1, hintAm: "ከፍተኛ Transfer መጠን (ቁጥር) ይጻፉ", hintEn: "Enter Maximum Transfer (ETB)" },
  withdrawProviders: { label: "Withdraw Methods", kind: "list", hintAm: "የWithdraw አማራጮችን በኮማ ለይተው ይጻፉ (ለምሳሌ: Telebirr, CBE, CBE Birr) ወይም clear", hintEn: "Enter comma-separated payout methods (e.g. Telebirr, CBE) or 'clear'" },
  maintenanceMessageAm: { label: "Maintenance Msg (AM)", kind: "nullableText", hintAm: "የጥገና መልዕክት (አማርኛ) ይጻፉ ወይም clear", hintEn: "Enter Amharic maintenance message or 'clear'" },
  maintenanceMessageEn: { label: "Maintenance Msg (EN)", kind: "nullableText", hintAm: "የጥገና መልዕክት (English) ይጻፉ ወይም clear", hintEn: "Enter English maintenance message or 'clear'" },
};

const SETTINGS_BOOL_LABELS: Record<AdminBoolSettingKey, string> = {
  welcomeBonusEnabled: "Welcome Bonus",
  referralBonusEnabled: "Referral Bonus",
  transferEnabled: "Player Transfer",
  maintenanceMode: "Maintenance Mode",
};

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
  | { step: "ADMIN_ADD_ACC_PROVIDER" }
  | { step: "ADMIN_ADD_ACC_NAME"; provider: string }
  | { step: "ADMIN_ADD_ACC_NUMBER"; provider: string; accountName: string }
  | { step: "ADMIN_EDIT_PAYMENT_FIELD"; accountId: string; field: "accountNumber" | "accountName" | "provider" }
  | { step: "ADMIN_EDIT_SETTING"; field: AdminSettingKey }
  | { step: "ADMIN_EDIT_BANNER" }
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
  private cachedBanner: { source: string; fileId: string } | null = null;

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

  async sendDirectMessage(
    telegramId: bigint | string,
    text: string
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.bot) return { ok: false, error: "BOT_NOT_RUNNING" };
    try {
      await this.bot.api.sendMessage(telegramId.toString(), text, { parse_mode: "HTML" });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "SEND_FAILED" };
    }
  }

  emitAdminEvent(event: string, payload: unknown) {
    this.io?.to("admins").emit(event, payload);
  }

  async getTelegramFileBuffer(
    fileId: string
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (!this.bot || !env.botToken) return null;
    try {
      const file = await this.bot.api.getFile(fileId);
      if (!file.file_path) return null;
      const url = `https://api.telegram.org/file/bot${env.botToken}/${file.file_path}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      const lower = file.file_path.toLowerCase();
      const contentType = lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".webp")
          ? "image/webp"
          : lower.endsWith(".gif")
            ? "image/gif"
            : "image/jpeg";
      return { buffer: Buffer.from(arrayBuf), contentType };
    } catch (err) {
      console.error("Failed to fetch Telegram file:", err);
      return null;
    }
  }

  private shareContactKeyboard(lang: Language) {
    return new Keyboard()
      .requestContact(lang === "AM" ? "📞 ስልክ ቁጥር አጋራ" : "📞 Share contact")
      .resized()
      .oneTime();
  }

  private mainInlineKeyboard(lang: Language) {
    const kb = new InlineKeyboard();
    const playLabel = lang === "AM" ? "🎮 ቢንጎ ተጫወት (Play Bingo)" : "🎮 Play Bingo";
    if (env.miniAppUrl.startsWith("https://")) {
      kb.webApp(playLabel, env.miniAppUrl);
    } else {
      kb.text(playLabel, "menu:play");
    }
    kb.row();

    kb.text(lang === "AM" ? "ይመዝገቡ 📝" : "Register 📝", "menu:register")
      .text(lang === "AM" ? "ቀሪ ሂሳብ 💵" : "Check Balance 💵", "menu:balance")
      .row();

    kb.text(lang === "AM" ? "ገንዘብ አስገባ 💵" : "Deposit 💵", "menu:deposit")
      .text(lang === "AM" ? "ገንዘብ አውጣ 🤑" : "Withdraw 🤑", "menu:withdraw")
      .row();

    kb.text(lang === "AM" ? "ገንዘብ ላክ 🎁" : "Transfer 🎁", "menu:transfer")
      .text(lang === "AM" ? "ጓደኛ ጋብዝ 🔗" : "Invite 🔗", "menu:invite")
      .row();

    kb.text(lang === "AM" ? "መመሪያ 📖" : "Instruction 📖", "menu:instruction")
      .text(lang === "AM" ? "እርዳታ ☎️" : "Contact Support ☎️", "menu:support")
      .row();

    kb.text(lang === "AM" ? "🌐 English" : "🌐 አማርኛ", "menu:lang");

    return kb;
  }

  private cancelKeyboard(lang: Language) {
    return new InlineKeyboard().text(lang === "AM" ? "❌ ሰርዝ" : "❌ Cancel", "flow:cancel");
  }

  private formatWalletError(err: unknown, lang: Language): string {
    const raw = err instanceof Error ? err.message : "ERROR";
    if (raw === "INSUFFICIENT_BALANCE") {
      return lang === "AM" ? "❌ በቂ ቀሪ ሂሳብ የለዎትም።" : "❌ Insufficient wallet balance.";
    }
    if (raw === "PHONE_NOT_VERIFIED") {
      return lang === "AM" ? "⚠️ መጀመሪያ ስልክ ቁጥርዎን አጋርተው ይመዝገቡ።" : "⚠️ Please verify your phone number first.";
    }
    if (raw.startsWith("MIN_WITHDRAW:")) {
      const val = raw.split(":")[1] || "";
      return lang === "AM" ? `⚠️ ዝቅተኛው የወጪ መጠን ${val} ብር ነው።` : `⚠️ Minimum withdrawal is ${val} ETB.`;
    }
    if (raw.startsWith("MAX_WITHDRAW:")) {
      const val = raw.split(":")[1] || "";
      return lang === "AM" ? `⚠️ ከፍተኛው የወጪ መጠን ${val} ብር ነው።` : `⚠️ Maximum withdrawal is ${val} ETB.`;
    }
    if (raw.startsWith("MIN_TRANSFER:")) {
      const val = raw.split(":")[1] || "";
      return lang === "AM" ? `⚠️ ዝቅተኛው የመላኪያ መጠን ${val} ብር ነው።` : `⚠️ Minimum transfer is ${val} ETB.`;
    }
    if (raw.startsWith("MAX_TRANSFER:")) {
      const val = raw.split(":")[1] || "";
      return lang === "AM" ? `⚠️ ከፍተኛው የመላኪያ መጠን ${val} ብር ነው።` : `⚠️ Maximum transfer is ${val} ETB.`;
    }
    if (raw === "TRANSFER_DISABLED") {
      return lang === "AM" ? "⚠️ ገንዘብ መላክ ለጊዜው ዝግ ነው።" : "⚠️ Transfers are currently disabled.";
    }
    if (raw === "CANNOT_TRANSFER_TO_SELF") {
      return lang === "AM" ? "⚠️ ለራስዎ ገንዘብ መላክ አይችሉም።" : "⚠️ You cannot transfer to yourself.";
    }
    return `❌ ${raw}`;
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

  private async sendBannerOrText(
    sendPhoto: (photo: string | InputFile, opts: object) => Promise<unknown>,
    sendText: (text: string, opts: object) => Promise<unknown>,
    caption: string,
    replyMarkup: InlineKeyboard
  ) {
    const settings = await getSystemSettings();
    const banner = settings.welcomeBannerUrl.trim() || env.welcomeBannerUrl.trim();
    if (banner) {
      try {
        let photoArg: string | InputFile;
        if (this.cachedBanner && this.cachedBanner.source === banner) {
          photoArg = this.cachedBanner.fileId;
        } else if (banner.startsWith("http://") || banner.startsWith("https://")) {
          photoArg = banner;
        } else if (fs.existsSync(banner)) {
          photoArg = new InputFile(banner);
        } else {
          photoArg = banner; // Telegram file_id uploaded via Admin Bot
        }
        const sent = (await sendPhoto(photoArg, {
          caption,
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        })) as { photo?: Array<{ file_id: string }> } | undefined;
        const uploadedFileId = sent?.photo?.[sent.photo.length - 1]?.file_id;
        if (uploadedFileId && (!this.cachedBanner || this.cachedBanner.source !== banner)) {
          this.cachedBanner = { source: banner, fileId: uploadedFileId };
        }
        return;
      } catch (err) {
        console.error("Failed sending welcome banner photo, falling back to text:", err);
      }
    }

    await sendText(caption, { parse_mode: "HTML", reply_markup: replyMarkup });
  }

  private async sendLanguagePrompt(ctx: {
    reply: (text: string, opts?: object) => Promise<unknown>;
    replyWithPhoto?: (photo: string | InputFile, opts?: object) => Promise<unknown>;
  }) {
    const kb = new InlineKeyboard()
      .text("🇪🇹 አማርኛ", "set_lang:AM")
      .text("🇬🇧 English", "set_lang:EN");
    const caption = "🌐 እባክዎ ቋንቋ ይምረጡ / Please choose your language:";
    if (ctx.replyWithPhoto) {
      await this.sendBannerOrText(
        (photo, opts) => ctx.replyWithPhoto!(photo, opts),
        (text, opts) => ctx.reply(text, opts),
        caption,
        kb
      );
      return;
    }
    await ctx.reply(caption, { reply_markup: kb });
  }

  private async sendRegisterRequired(
    ctx: { reply: (text: string, opts?: object) => Promise<unknown> },
    lang: Language
  ) {
    const settings = await getSystemSettings();
    const bonusNote = settings.welcomeBonusEnabled
      ? lang === "AM"
        ? `\n🎁 ሲመዘገቡ <b>${settings.welcomeBonusAmount.toString()} ብር</b> የእንኳን ደህና መጡ ስጦታ ወደ ሂሳብዎ ይገባል!`
        : `\n🎁 Register now and get <b>${settings.welcomeBonusAmount.toString()} ETB</b> welcome bonus in your Wallet!`
      : "";

    const msg =
      lang === "AM"
        ? `⚠️ ወደ <b>${escapeHtml(settings.botName)}</b> እንኳን በደህና መጡ!\n\nከመጠቀምዎ በፊት መጀመሪያ ከታች ያለውን <b>📞 ስልክ ቁጥር አጋራ</b> ቁልፍ ተጭነው መመዝገብ አለብዎት።${bonusNote}`
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
    const customCaption =
      lang === "AM" ? settings.welcomeCaptionAm.trim() : settings.welcomeCaptionEn.trim();
    const caption =
      customCaption ||
      (lang === "AM"
        ? `👋 እንኳን ወደ ${settings.botName} በደህና መጡ! ከታች ያሉትን አማራጮች ይምረጡ።`
        : `👋 Welcome to ${settings.botName}! Choose an Option below.`);

    const kb = this.mainInlineKeyboard(lang);
    await this.sendBannerOrText(sendPhoto, sendText, caption, kb);
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

    const block =
      lang === "AM"
        ? [`ስም:           ${fullName}`, `ስልክ:          ${phone}`, `ቀሪ ሂሳብ:       ${balStr} ብር`].join("\n")
        : [`Name:         ${fullName}`, `Phone:        ${phone}`, `Wallet:       ${balStr} ETB`].join("\n");

    const title = lang === "AM" ? "💼 <b>የአካውንት መረጃ</b>" : "💼 <b>Account Info</b>";
    const text = `${title}\n<pre>${escapeHtml(block)}</pre>`;
    const kb = new InlineKeyboard()
      .text(lang === "AM" ? "💵 ገንዘብ አስገባ" : "💵 Deposit", "menu:deposit")
      .text(lang === "AM" ? "🤑 ገንዘብ አውጣ" : "🤑 Withdraw", "menu:withdraw");

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
        : `💰 Enter the amount you want to deposit (starting from ${minDep} ETB).`;
    await reply(msg);
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
      const minW = settings.minWithdraw.toString();
      await reply(
        lang === "AM"
          ? `🚫 Withdraw ለማዘዝ ቢያንስ ${minW} ብር Deposit ያድርጉ።`
          : `🚫 Please deposit at least ${minW} ETB to request a withdrawal.`
      );
      return;
    }

    const providers = settings.withdrawProviders.filter((p) => p.trim().length > 0);
    if (providers.length === 0) {
      await reply(
        lang === "AM"
          ? "⚠️ የገንዘብ ማውጫ መንገዶች ገና በአድሚን አልተጨመሩም።"
          : "⚠️ Withdrawal methods are not configured by Admin yet."
      );
      return;
    }

    const kb = new InlineKeyboard();
    providers.forEach((prov, idx) => {
      kb.text(prov, `wd_prov:${prov}`);
      if (idx % 2 === 1) kb.row();
    });
    if (providers.length % 2 === 1) kb.row();
    kb.text(lang === "AM" ? "❌ ሰርዝ" : "❌ Cancel", "flow:cancel");

    await reply(
      lang === "AM"
        ? `🤑 ቀሪ ሂሳብ: <b>${wallet.balance.toFixed(2)} ብር</b>\nገንዘቡ የሚላክበትን መንገድ ይምረጡ፦`
        : `🤑 Wallet: <b>${wallet.balance.toFixed(2)} ETB</b>\nSelect withdrawal method:`,
      { parse_mode: "HTML", reply_markup: kb }
    );
  }

  private async startTransferFlow(
    userId: string,
    lang: Language,
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const [wallet, settings] = await Promise.all([
      getUserWalletSummary(userId),
      getSystemSettings(),
    ]);
    if (!settings.transferEnabled) {
      await reply(
        lang === "AM" ? "⚠️ ገንዘብ መላክ በአሁኑ ጊዜ ዝግ ነው።" : "⚠️ Transfers are currently disabled."
      );
      return;
    }
    const minT = Number(settings.minTransfer);
    if (wallet.balance < minT) {
      await reply(
        lang === "AM"
          ? `🚫 ገንዘብ ለመላክ በWallet-ዎ ውስጥ ቢያንስ <b>${settings.minTransfer.toString()} ብር</b> ሊኖርዎት ይገባል።\n💰 ቀሪ ሂሳብ: <b>${wallet.balance.toFixed(2)} ብር</b>`
          : `🚫 You need at least <b>${settings.minTransfer.toString()} ETB</b> in your Wallet to transfer.\n💰 Wallet: <b>${wallet.balance.toFixed(2)} ETB</b>`,
        { parse_mode: "HTML" }
      );
      return;
    }
    await this.setBotState(userId, { step: "TRANSFER_RECEIVER" });
    await reply(
      lang === "AM"
        ? `🎁 ቀሪ ሂሳብ: <b>${wallet.balance.toFixed(2)} ብር</b>\nገንዘብ የሚቀበለውን ተጫዋች <b>ስልክ ቁጥር</b> ይጻፉ (ለምሳሌ <code>0911223344</code>)፦`
        : `🎁 Wallet: <b>${wallet.balance.toFixed(2)} ETB</b>\nEnter the recipient player's <b>Phone Number</b> (e.g. <code>0911223344</code>):`,
      { parse_mode: "HTML", reply_markup: this.cancelKeyboard(lang) }
    );
  }

  private async sendInviteInfo(
    user: { id: string; telegramId: bigint; referralCode: string; language: Language | null },
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const lang: Language = user.language || "AM";
    const [settings, referralCount] = await Promise.all([
      getSystemSettings(),
      prisma.user.count({ where: { referredById: user.id } }),
    ]);
    const botUser = env.botUsername || this.bot?.botInfo?.username || "tunnel_bingo_bot";
    const link = `https://t.me/${botUser}?start=${user.telegramId.toString()}`;
    const botName = escapeHtml(settings.botName);
    const targetCount = 10;
    const rewardAmount = settings.referralBonusValue.toString();

    const rewardLineAm = settings.referralBonusEnabled
      ? `💰 <b>${targetCount} ሰዎችን ሲጋብዙ ${rewardAmount} ብር</b> በቀጥታ ወደ Wallet-ዎ ይገባል!\n\n`
      : "";
    const rewardLineEn = settings.referralBonusEnabled
      ? `💰 <b>Invite ${targetCount} friends and get ${rewardAmount} ETB</b> directly in your Wallet!\n\n`
      : "";

    const msg =
      lang === "AM"
        ? `🔗 ጓደኞችዎን ወደ ${botName} ይጋብዙ እና ሽልማት ያግኙ!\n${rewardLineAm}🎁 ${link}`
        : `🔗 Invite your friends to ${botName} and earn rewards!\n${rewardLineEn}🎁 ${link}`;

    const shareText =
      lang === "AM"
        ? `🎮 ${settings.botName} ይቀላቀሉ እና ይጫወቱ!`
        : `🎮 Join ${settings.botName} and play!`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;

    const kb = new InlineKeyboard()
      .url(lang === "AM" ? "📨 መጋበዣ ሊንክ አጋራ" : "📨 Share Invite Link", shareUrl)
      .row()
      .text(
        lang === "AM" ? `👥 የጋበዝኳቸው ሰዎች (${referralCount})` : `👥 My Invites (${referralCount})`,
        "menu:my_invites"
      );

    await reply(msg, { parse_mode: "HTML", reply_markup: kb });
  }

  private async sendInviteDetails(
    user: { id: string; language: Language | null },
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const lang: Language = user.language || "AM";
    const [settings, invitedUsers, bonusAgg, totalCount, verifiedCount] = await Promise.all([
      getSystemSettings(),
      prisma.user.findMany({
        where: { referredById: user.id },
        select: {
          firstName: true,
          lastName: true,
          username: true,
          phoneNumber: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.walletTransaction.aggregate({
        where: { userId: user.id, type: "REFERRAL_BONUS" },
        _sum: { amount: true },
      }),
      prisma.user.count({ where: { referredById: user.id } }),
      prisma.user.count({
        where: { referredById: user.id, phoneNumber: { not: null } },
      }),
    ]);

    const targetCount = 10;
    const rewardAmount = settings.referralBonusValue.toString();
    const currentProgress = verifiedCount % targetCount;
    const totalBonus = Number(bonusAgg._sum.amount ?? 0).toFixed(2);

    const lines = invitedUsers.map((u, idx) => {
      const fullName = escapeHtml([u.firstName, u.lastName].filter(Boolean).join(" "));
      const handle = u.username ? ` (@${escapeHtml(u.username)})` : "";
      const status = u.phoneNumber
        ? lang === "AM"
          ? "✅ ተመዝግቧል"
          : "✅ Registered"
        : lang === "AM"
        ? "⏳ አልተመዘገበም"
        : "⏳ Pending";
      return `${idx + 1}. <b>${fullName}</b>${handle} — ${status}`;
    });

    const listText =
      lines.length > 0
        ? lines.join("\n")
        : lang === "AM"
        ? "<i>ገና ማንንም አልጋበዙም። የመጋበዣ ሊንክዎን ለጓደኞችዎ ያጋሩ!</i>"
        : "<i>You haven't invited anyone yet. Share your invite link with friends!</i>";

    const msg =
      lang === "AM"
        ? `👥 <b>የጋበዟቸው ሰዎች ዝርዝር</b>\n\n` +
          `🎯 ሽልማት: <b>በየ${targetCount} ግብዣ ${rewardAmount} ብር</b>\n` +
          `📊 የአሁኑ ዙር ሂደት: <b>${currentProgress} / ${targetCount}</b>\n` +
          `• ጠቅላላ የጋበዟቸው: <b>${totalCount}</b>\n` +
          `• ስልክ አረጋግጠው የተመዘገቡ: <b>${verifiedCount}</b>\n` +
          `• ከግብዣ ያገኙት ጠቅላላ ቦነስ: <b>${totalBonus} ብር</b>\n\n` +
          `${listText}`
        : `👥 <b>Your Invited Friends</b>\n\n` +
          `🎯 Reward: <b>${rewardAmount} ETB for every ${targetCount} invites</b>\n` +
          `📊 Current Milestone Progress: <b>${currentProgress} / ${targetCount}</b>\n` +
          `• Total Invited: <b>${totalCount}</b>\n` +
          `• Registered (Verified): <b>${verifiedCount}</b>\n` +
          `• Total Referral Bonus Earned: <b>${totalBonus} ETB</b>\n\n` +
          `${listText}`;

    await reply(msg, { parse_mode: "HTML" });
  }

  private async sendInstruction(
    lang: Language,
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const settings = await getSystemSettings();
    const custom = lang === "AM" ? settings.instructionAm.trim() : settings.instructionEn.trim();
    const msg = custom
      ? escapeHtml(custom)
      : lang === "AM"
      ? `🃏 <b>የካርቴላ (መጫወቻ ካርድ) ምርጫ</b>\n\n` +
        `1. ወደ ጨዋታው ሲገቡ ከ1 እስከ 600 ካሉት ቁጥሮች ውስጥ በአንድ ዙር እስከ 2 ካርቴላ መምረጥ ይችላሉ።\n\n` +
        `2. በመምረጫ ሰሌዳው ላይ በቀይ ቀለም የበሩ ቁጥሮች ቀድመው በሌሎች ተጫዋቾች የተያዙ ካርቴላዎችን ያመለክታሉ።\n\n` +
        `3. ማንኛውንም ነፃ ቁጥር ሲነኩ ካርቴላው በውስጡ የያዛቸውን የቢንጎ ቁጥሮች ከታች አስቀድመው ማየት ይችላሉ።\n\n` +
        `4. የሚፈልጉትን ካርቴላ መርጠው የመግቢያው ሰዓት (Countdown) 0 ሲደርስ ጨዋታው በቀጥታ ይጀምራል።\n\n` +
        `🎮 <b>የጨዋታው ሂደት</b>\n\n` +
        `1. ጨዋታው እንደተጀመረ የመረጡት ካርቴላ በስክሪኑ የታችኛው ክፍል ላይ ይታይዎታል።\n\n` +
        `2. ሲስተሙ ከ1 እስከ 75 ያሉትን ቁጥሮች በዘፈቀደ (Randomly) በተከታታይ መጥራት ይጀምራል።\n\n` +
        `3. የተጠራው ቁጥር በእርስዎ ካርቴላ ላይ ካለ በመንካት ምልክት ያድርጉበት (ያጥቁሩት)፤ ወይም ሲስተሙ ራሱ እንዲሞላልዎ Automatic ሁነታን ማብራት ይችላሉ።\n\n` +
        `🏆 <b>የማሸነፊያ ህጎች</b>\n\n` +
        `1. በካርቴላዎ ላይ ምልክት የተደረገባቸው ቁጥሮች ከሚከተሉት አንዱን ከሰሩ አሸናፊ ይሆናሉ፦\n` +
        `   • ወደ ጎን (አግድም) ወይም ወደ ታች (ቁልቁል) ሙሉ መስመር ሲሰሩ\n` +
        `   • በሁለቱም አቅጣጫ ሰያፍ (Diagonal) መስመር ሲሰሩ\n` +
        `   • የካርቴላውን አራቱንም ማዕዘናት (4 Corners) ሲያሟሉ\n\n` +
        `2. በአንድ ዙር ሁለት ወይም ከዚያ በላይ ተጫዋቾች በተመሳሳይ ጊዜ ቢያሸንፉ፣ አጠቃላይ የዙሩ ሽልማት (ደራሽ) ለአሸናፊዎቹ እኩል ይከፋፈላል።`
      : `🃏 <b>Choosing Your Cartela (Game Card)</b>\n\n` +
        `1. Before the round starts, pick up to 2 cartelas from the 1–600 selection board.\n\n` +
        `2. Numbers highlighted in red on the board are already taken by other players.\n\n` +
        `3. Tapping any available number previews the exact 5×5 numbers on that cartela below the board.\n\n` +
        `4. Once you lock in your cartela(s) and the countdown timer reaches 0, the live game starts automatically.\n\n` +
        `🎮 <b>How the Game Plays</b>\n\n` +
        `1. When the game begins, your active cartela(s) appear on the lower-right area of the screen.\n\n` +
        `2. The system randomly draws numbers from 1 to 75 one by one.\n\n` +
        `3. Tap matching numbers on your cartela as they are called, or switch on Automatic mode to have them marked automatically.\n\n` +
        `🏆 <b>How to Win</b>\n\n` +
        `1. You win as soon as your marked numbers complete any of the following patterns:\n` +
        `   • A full Horizontal or Vertical line\n` +
        `   • Either Diagonal line\n` +
        `   • All Four Corners of the cartela\n\n` +
        `2. If two or more players win on the same called number, the total prize pot is split equally among all winners.`;
    await reply(msg, { parse_mode: "HTML" });
  }

  private async sendSupport(
    lang: Language,
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const settings = await getSystemSettings();
    const handle = settings.supportUsername.trim();
    const channel = settings.channelUrl.trim();
    const lines: string[] = [];
    if (handle) {
      lines.push(
        lang === "AM"
          ? `ማንኛውም ጥያቄ ወይም የክፍያ ችግር ካለ ${escapeHtml(handle)} ላይ ያናግሩን።`
          : `Need help? Message ${escapeHtml(handle)}.`
      );
    }
    if (channel) {
      lines.push(
        lang === "AM"
          ? `📢 ቻናላችን: ${escapeHtml(channel)}`
          : `📢 Channel: ${escapeHtml(channel)}`
      );
    }
    const header = lang === "AM" ? "☎️ <b>እርዳታ</b>\n\n" : "☎️ <b>Contact Support</b>\n\n";
    const body =
      lines.length > 0
        ? lines.join("\n")
        : lang === "AM"
        ? "የእርዳታ አድራሻ ገና በአድሚን አልተሞላም።"
        : "Support contact is not configured yet.";
    await reply(`${header}${body}`, { parse_mode: "HTML" });
  }

  private async sendPlayPrompt(
    lang: Language,
    reply: (text: string, opts?: object) => Promise<unknown>
  ) {
    const kb = new InlineKeyboard();
    if (env.miniAppUrl.startsWith("https://")) {
      kb.webApp(lang === "AM" ? "🎮 ጨዋታውን ክፈት" : "🎮 Open Mini App", env.miniAppUrl);
    }
    const msg = env.miniAppUrl.startsWith("https://")
      ? lang === "AM"
        ? "🎮 ወደ ቢንጎ ጨዋታ ለመግባት ከታች ያለውን ቁልፍ ይጫኑ፦"
        : "🎮 Tap below to launch the Bingo Mini App:"
      : lang === "AM"
      ? `🎮 የመጫወቻ መተግበሪያው በአሁኑ ጊዜ በሙከራ ላይ ነው (${env.miniAppUrl}) — Production HTTPS ሊንክ ሲገባ እዚህ በቀጥታ ይከፈታል።`
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
        ? `🛡️ <b>${escapeHtml(settings.botName)} — የአድሚን ፈጣን መቆጣጠሪያ (Cashier Bot)</b>\n\n` +
          `👤 ኃላፊነት: <b>${escapeHtml(user.role)}</b>\n` +
          `⏳ በመጠባበቅ ላይ ያሉ ገቢዎች: <b>${pendingDeposits}</b>\n` +
          `⏳ በመጠባበቅ ላይ ያሉ ወጪዎች: <b>${pendingWithdraws}</b>\n\n` +
          `<i>ይህ ቦት ለፈጣን የገንዘብ ማጽደቂያ ብቻ የተዘጋጀ ነው። ሙሉ የተጠቃሚዎች፣ ሩሞችና የሲስተም አስተዳደር በWeb Admin Portal ላይ ይገኛል!</i>`
        : `🛡️ <b>${escapeHtml(settings.botName)} — Admin Cashier Bot</b>\n\n` +
          `👤 Role: <b>${escapeHtml(user.role)}</b>\n` +
          `⏳ Pending Deposits: <b>${pendingDeposits}</b>\n` +
          `⏳ Pending Withdraws: <b>${pendingWithdraws}</b>\n\n` +
          `<i>Streamlined for instant approvals. Full management is on the Web Admin Portal!</i>`;

    const kb = new InlineKeyboard();
    kb.text(
      lang === "AM" ? `💳 ገቢዎች (${pendingDeposits})` : `💳 Deposits (${pendingDeposits})`,
      "adm:pending_deposits"
    )
      .text(
        lang === "AM" ? `💸 ወጪዎች (${pendingWithdraws})` : `💸 Withdraws (${pendingWithdraws})`,
        "adm:pending_withdraws"
      )
      .row();

    if (env.adminWebUrl) {
      if (env.adminWebUrl.startsWith("https://")) {
        kb.webApp(lang === "AM" ? "🌐 Admin Web Portal ክፈት" : "🌐 Open Admin Web", env.adminWebUrl).row();
      } else {
        kb.url(lang === "AM" ? "🌐 Admin Web Portal ክፈት" : "🌐 Open Admin Web", env.adminWebUrl).row();
      }
    }

    kb.text(lang === "AM" ? "🔐 የWeb መግቢያ ኮድ (OTP)" : "🔐 Web Login OTP", "adm:web_code")
      .text(lang === "AM" ? "🌐 ቋንቋ / Language" : "🌐 ቋንቋ / Language", "adm:lang");

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

  private async isBlockedByMaintenance(
    user: { role: string; language: Language | null },
    reply: (text: string, opts?: object) => Promise<unknown>
  ): Promise<boolean> {
    if (this.isAdminRole(user.role)) return false;
    const settings = await getSystemSettings();
    if (!settings.maintenanceMode) return false;
    const lang: Language = user.language || "AM";
    const custom =
      lang === "AM" ? settings.maintenanceMessageAm.trim() : settings.maintenanceMessageEn.trim();
    await reply(
      custom
        ? escapeHtml(custom)
        : lang === "AM"
        ? "🚧 ሲስተሙ ለጊዜው በጥገና ላይ ነው — በቅርቡ ይመለሳል።"
        : "🚧 System is currently under maintenance. Please check back soon.",
      { parse_mode: "HTML" }
    );
    return true;
  }

  private async sendPaymentAccountsAdmin(
    reply: (text: string, opts?: object) => Promise<unknown>,
    userRole: string,
    lang: Language
  ) {
    const accounts = await prisma.paymentAccount.findMany({ orderBy: { sortOrder: "asc" } });
    const kb = new InlineKeyboard();
    const lines: string[] = [];

    if (userRole === "SUPER_ADMIN") {
      kb.text(lang === "AM" ? "➕ አካውንት ጨምር (Add)" : "➕ Add Payment Account", "adm:acc_add").row();
    }

    for (const acc of accounts) {
      const statusBadge = acc.isActive ? "✅ Active" : "⏸ Inactive";
      lines.push(
        `• <b>${escapeHtml(acc.provider)}</b> (${statusBadge})\n` +
          `  Number: <code>${escapeHtml(acc.accountNumber)}</code>\n` +
          `  Name: ${escapeHtml(acc.accountName)}`
      );
      if (userRole === "SUPER_ADMIN") {
        kb.text(
          `${acc.isActive ? "⏸ Disable" : "✅ Enable"} ${acc.provider}`,
          `adm:acc_toggle:${acc.id}`
        )
          .text(`✏️ # ${acc.provider}`, `adm:acc_field:${acc.id}:accountNumber`)
          .row()
          .text(`✏️ Name`, `adm:acc_field:${acc.id}:accountName`)
          .text(`🗑️ Delete`, `adm:acc_del:${acc.id}`)
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
        ? "ምንም የክፍያ አካውንት አልተጨመረም። ከታች ➕ በመጫን ይጨምሩ።"
        : "No payment accounts yet. Tap ➕ below to add one.";

    await reply(`${header}${body}`, { parse_mode: "HTML", reply_markup: kb });
  }

  private async sendAdminSettingsPanel(
    reply: (text: string, opts?: object) => Promise<unknown>,
    lang: Language
  ) {
    const s = await getSystemSettings();
    const boolIcon = (v: boolean) => (v ? "✅ ON" : "❌ OFF");
    const providers = s.withdrawProviders.length > 0 ? s.withdrawProviders.join(", ") : "-";
    const bannerLabel = s.welcomeBannerUrl ? "✅ Set" : "❌ None";

    const msg =
      `⚙️ <b>${lang === "AM" ? "የሲስተም ቅንብሮች (Customizable Settings)" : "System Settings"}</b>\n\n` +
      `🏷️ Bot Name: <b>${escapeHtml(s.botName)}</b>\n` +
      `🖼️ Banner: <b>${bannerLabel}</b>\n` +
      `☎️ Support: <code>${escapeHtml(s.supportUsername || "-")}</code>\n` +
      `📢 Channel: <code>${escapeHtml(s.channelUrl || "-")}</code>\n` +
      `🎁 Welcome Bonus: <b>${boolIcon(s.welcomeBonusEnabled)}</b> (${s.welcomeBonusAmount.toString()} ETB)\n` +
      `🔗 Referral Bonus: <b>${boolIcon(s.referralBonusEnabled)}</b> (10 invites -> ${s.referralBonusValue.toString()} ETB)\n` +
      `💵 Deposit: <b>${s.minDeposit.toString()} – ${s.maxDeposit.toString()} ETB</b>\n` +
      `🤑 Withdraw: <b>${s.minWithdraw.toString()} – ${s.maxWithdraw.toString()} ETB</b>\n` +
      `🏦 Withdraw Methods: <code>${escapeHtml(providers)}</code>\n` +
      `🔁 Transfer: <b>${boolIcon(s.transferEnabled)}</b> | 🚧 Maintenance: <b>${boolIcon(s.maintenanceMode)}</b>`;

    const kb = new InlineKeyboard()
      .text(`🎁 Welcome: ${boolIcon(s.welcomeBonusEnabled)}`, "adm:toggle:welcomeBonusEnabled")
      .text(`🚧 Maint: ${boolIcon(s.maintenanceMode)}`, "adm:toggle:maintenanceMode")
      .row()
      .text(`🔗 Ref Bonus: ${boolIcon(s.referralBonusEnabled)}`, "adm:toggle:referralBonusEnabled")
      .text(`🔁 Transfer: ${boolIcon(s.transferEnabled)}`, "adm:toggle:transferEnabled")
      .row()
      .text("🏷️ Bot Name", "adm:set:botName")
      .text("🖼️ Banner Photo", "adm:set_banner")
      .row()
      .text("☎️ Support @user", "adm:set:supportUsername")
      .text("📢 Channel URL", "adm:set:channelUrl")
      .row()
      .text("👋 Welcome AM", "adm:set:welcomeCaptionAm")
      .text("👋 Welcome EN", "adm:set:welcomeCaptionEn")
      .row()
      .text("📖 Rules AM", "adm:set:instructionAm")
      .text("📖 Rules EN", "adm:set:instructionEn")
      .row()
      .text("🎁 Bonus ETB", "adm:set:welcomeBonusAmount")
      .text("🔗 Ref Bonus ETB", "adm:set:referralBonusValue")
      .row()
      .text("💸 Withdraw Methods", "adm:set:withdrawProviders")
      .row()
      .text("💵 Min Deposit", "adm:set:minDeposit")
      .text("💵 Max Deposit", "adm:set:maxDeposit")
      .row()
      .text("🤑 Min Withdraw", "adm:set:minWithdraw")
      .text("🤑 Max Withdraw", "adm:set:maxWithdraw")
      .row()
      .text("🚧 Maint Msg AM", "adm:set:maintenanceMessageAm")
      .text("🚧 Maint Msg EN", "adm:set:maintenanceMessageEn")
      .row()
      .text("🔙 Admin Panel", "adm:home");

    await reply(msg, { parse_mode: "HTML", reply_markup: kb });
  }

  private async handleAdminTextState(
    user: { id: string; role: string; language: Language | null },
    state: NonNullable<BotConvState>,
    text: string,
    reply: (t: string, opts?: object) => Promise<unknown>
  ): Promise<boolean> {
    if (user.role !== "SUPER_ADMIN") return false;
    const lang: Language = user.language || "AM";

    if (state.step === "ADMIN_EDIT_BANNER") {
      this.cachedBanner = null;
      if (text.toLowerCase() === "clear") {
        await prisma.systemSettings.update({ where: { id: 1 }, data: { welcomeBannerUrl: "" } });
        await recordAuditLog(prisma, {
          actorId: user.id,
          actorRole: "SUPER_ADMIN",
          action: "UPDATE_SETTING_welcomeBannerUrl",
          targetType: "SystemSettings",
          targetId: "1",
          after: { welcomeBannerUrl: "" },
        });
        await this.setBotState(user.id, null);
        await reply(lang === "AM" ? "✅ Banner ተነስቷል።" : "✅ Banner cleared.");
        await this.sendAdminSettingsPanel(reply, lang);
        return true;
      }
      if (!text.startsWith("http://") && !text.startsWith("https://")) {
        await reply(
          lang === "AM"
            ? "⚠️ እባክዎ <b>ፎቶ በቀጥታ ይላኩ</b>፣ ወይም `https://...` URL ይጻፉ (ለማጥፋት `clear`)።"
            : "⚠️ Send a <b>Photo directly</b>, paste an `https://...` URL, or send `clear`.",
          { parse_mode: "HTML", reply_markup: this.cancelKeyboard(lang) }
        );
        return true;
      }
      await prisma.systemSettings.update({ where: { id: 1 }, data: { welcomeBannerUrl: text } });
      await recordAuditLog(prisma, {
        actorId: user.id,
        actorRole: "SUPER_ADMIN",
        action: "UPDATE_SETTING_welcomeBannerUrl",
        targetType: "SystemSettings",
        targetId: "1",
        after: { welcomeBannerUrl: text },
      });
      await this.setBotState(user.id, null);
      await reply(lang === "AM" ? "✅ Welcome Banner URL ተቀምጧል!" : "✅ Welcome Banner URL updated!");
      await this.sendAdminSettingsPanel(reply, lang);
      return true;
    }

    if (state.step === "ADMIN_EDIT_SETTING") {
      const meta = SETTINGS_META[state.field];
      let value: unknown;

      if (meta.kind === "number") {
        const num = Number(text);
        if (!Number.isFinite(num) || (meta.min !== undefined && num < meta.min)) {
          await reply(
            lang === "AM" ? `⚠️ ትክክለኛ ቁጥር ያስገቡ (ቢያንስ ${meta.min ?? 0})።` : `⚠️ Enter a valid number (min ${meta.min ?? 0}).`,
            { reply_markup: this.cancelKeyboard(lang) }
          );
          return true;
        }
        value = num;
      } else if (meta.kind === "list") {
        value =
          text.toLowerCase() === "clear"
            ? []
            : text
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
      } else if (meta.kind === "nullableText") {
        value = text.toLowerCase() === "clear" ? "" : text;
      } else {
        if (text.length < 1 || text.length > 80) {
          await reply(lang === "AM" ? "⚠️ ከ1 እስከ 80 ፊደላት ያስገቡ።" : "⚠️ Enter 1-80 characters.", {
            reply_markup: this.cancelKeyboard(lang),
          });
          return true;
        }
        value = text;
      }

      const updateData = { [state.field]: value } as Prisma.SystemSettingsUpdateInput;
      await prisma.systemSettings.update({ where: { id: 1 }, data: updateData });
      await recordAuditLog(prisma, {
        actorId: user.id,
        actorRole: "SUPER_ADMIN",
        action: `UPDATE_SETTING_${state.field}`,
        targetType: "SystemSettings",
        targetId: "1",
        after: { [state.field]: value },
      });
      await this.setBotState(user.id, null);
      await reply(`✅ <b>${escapeHtml(meta.label)}</b> updated!`, { parse_mode: "HTML" });
      await this.sendAdminSettingsPanel(reply, lang);
      return true;
    }

    if (state.step === "ADMIN_ADD_ACC_PROVIDER") {
      if (text.length < 2 || text.length > 40) {
        await reply(lang === "AM" ? "⚠️ ትክክለኛ ስም ይጻፉ (ለምሳሌ Telebirr)።" : "⚠️ Enter valid provider name.", {
          reply_markup: this.cancelKeyboard(lang),
        });
        return true;
      }
      await this.setBotState(user.id, { step: "ADMIN_ADD_ACC_NAME", provider: text });
      await reply(
        lang === "AM"
          ? `🏦 Provider: <b>${escapeHtml(text)}</b>\n\nየአካውንቱን ባለቤት <b>ስም (Account Name)</b> ይጻፉ፦`
          : `🏦 Provider: <b>${escapeHtml(text)}</b>\n\nEnter the <b>Account Holder Name</b>:`,
        { parse_mode: "HTML", reply_markup: this.cancelKeyboard(lang) }
      );
      return true;
    }

    if (state.step === "ADMIN_ADD_ACC_NAME") {
      if (text.length < 2 || text.length > 60) {
        await reply(lang === "AM" ? "⚠️ ትክክለኛ ስም ይጻፉ።" : "⚠️ Enter valid account holder name.", {
          reply_markup: this.cancelKeyboard(lang),
        });
        return true;
      }
      await this.setBotState(user.id, {
        step: "ADMIN_ADD_ACC_NUMBER",
        provider: state.provider,
        accountName: text,
      });
      await reply(
        lang === "AM"
          ? `🔢 የ<b>${escapeHtml(state.provider)}</b> ስልክ ወይም የባንክ <b>አካውንት ቁጥር</b> ይጻፉ፦`
          : `🔢 Enter the <b>Account / Phone Number</b> for <b>${escapeHtml(state.provider)}</b>:`,
        { parse_mode: "HTML", reply_markup: this.cancelKeyboard(lang) }
      );
      return true;
    }

    if (state.step === "ADMIN_ADD_ACC_NUMBER") {
      if (text.length < 5 || text.length > 40) {
        await reply(lang === "AM" ? "⚠️ ትክክለኛ ቁጥር ይጻፉ (ቢያንስ 5 ፊደላት)።" : "⚠️ Enter valid number (min 5 chars).", {
          reply_markup: this.cancelKeyboard(lang),
        });
        return true;
      }
      const maxOrder = await prisma.paymentAccount.aggregate({ _max: { sortOrder: true } });
      const created = await prisma.paymentAccount.create({
        data: {
          provider: state.provider,
          accountName: state.accountName,
          accountNumber: text,
          isActive: true,
          sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        },
      });
      await recordAuditLog(prisma, {
        actorId: user.id,
        actorRole: "SUPER_ADMIN",
        action: "CREATE_PAYMENT_ACCOUNT",
        targetType: "PaymentAccount",
        targetId: created.id,
        after: { provider: created.provider, accountName: created.accountName, accountNumber: created.accountNumber },
      });
      await this.setBotState(user.id, null);
      await reply(
        lang === "AM"
          ? `✅ አዲስ <b>${escapeHtml(created.provider)}</b> አካውንት ተጨምሯል!`
          : `✅ Added <b>${escapeHtml(created.provider)}</b> payment account!`,
        { parse_mode: "HTML" }
      );
      await this.sendPaymentAccountsAdmin(reply, user.role, lang);
      return true;
    }

    if (state.step === "ADMIN_EDIT_PAYMENT_FIELD") {
      if (text.length < 2 || text.length > 60) {
        await reply(lang === "AM" ? "⚠️ ትክክለኛ እሴት ይጻፉ።" : "⚠️ Enter valid value.", {
          reply_markup: this.cancelKeyboard(lang),
        });
        return true;
      }
      const existingAcc = await prisma.paymentAccount.findUnique({ where: { id: state.accountId } });
      if (!existingAcc) {
        await this.setBotState(user.id, null);
        await reply("❌ Account not found.");
        return true;
      }
      const updatedAcc = await prisma.paymentAccount.update({
        where: { id: existingAcc.id },
        data: { [state.field]: text } as Prisma.PaymentAccountUpdateInput,
      });
      await recordAuditLog(prisma, {
        actorId: user.id,
        actorRole: "SUPER_ADMIN",
        action: `UPDATE_PAYMENT_ACCOUNT_${state.field}`,
        targetType: "PaymentAccount",
        targetId: updatedAcc.id,
        before: { [state.field]: existingAcc[state.field] },
        after: { [state.field]: updatedAcc[state.field] },
      });
      await this.setBotState(user.id, null);
      await reply(
        lang === "AM"
          ? `✅ የ<b>${escapeHtml(updatedAcc.provider)}</b> መረጃ ተቀይሯል!`
          : `✅ Updated <b>${escapeHtml(updatedAcc.provider)}</b>!`,
        { parse_mode: "HTML" }
      );
      await this.sendPaymentAccountsAdmin(reply, user.role, lang);
      return true;
    }

    return false;
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
    const currentSettings = await getSystemSettings();
    const initUpdates: Prisma.SystemSettingsUpdateInput = {};
    if (!currentSettings.welcomeBannerUrl && env.welcomeBannerUrl) {
      initUpdates.welcomeBannerUrl = env.welcomeBannerUrl;
    }
    if (currentSettings.botName === "Bingo" && env.botName && env.botName !== "Bingo") {
      initUpdates.botName = env.botName;
    }
    if (!currentSettings.supportUsername && env.supportUsername) {
      initUpdates.supportUsername = env.supportUsername;
    }
    if (currentSettings.withdrawProviders.length === 0) {
      initUpdates.withdrawProviders = ["Telebirr"];
    }
    if (Object.keys(initUpdates).length > 0) {
      await prisma.systemSettings.update({ where: { id: 1 }, data: initUpdates });
    }

    const accountCount = await prisma.paymentAccount.count();
    if (accountCount === 0) {
      await prisma.paymentAccount.create({
        data: {
          provider: "Telebirr",
          accountName: "Telebirr",
          accountNumber: "0911111111",
          isActive: true,
          sortOrder: 1,
        },
      });
    }

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
        { command: "play", description: "🎮 Play Bingo / ቢንጎ ተጫወት" },
        { command: "start", description: "Start / አስጀምር" },
        { command: "balance", description: "Balance / ቀሪ ሂሳብ" },
        { command: "deposit", description: "Deposit / ገንዘብ አስገባ" },
        { command: "withdraw", description: "Withdraw / ገንዘብ አውጣ" },
        { command: "transfer", description: "Transfer / ገንዘብ ላክ" },
        { command: "invite", description: "Invite / ጓደኛ ጋብዝ" },
        { command: "instruction", description: "Instruction / መመሪያ" },
        { command: "support", description: "Support / እርዳታ" },
        { command: "language", description: "Language / ቋንቋ ቀይር" },
        { command: "register", description: "Register / ይመዝገቡ" },
      ]);

      // Keep Menu button as "commands" list so users can always access /deposit, /withdraw, /balance, /play, etc.
      await bot.api.setChatMenuButton({
        menu_button: { type: "commands" },
      }).catch((err) => console.error("Failed setting chat menu button:", err));
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
      if (await this.isBlockedByMaintenance(user, (t, opts) => ctx.reply(t, opts))) {
        return null;
      }
      if (!user.language) {
        await this.sendLanguagePrompt(ctx);
        return null;
      }
      if (!user.phoneNumber && !options?.allowUnregistered && !this.isAdminRole(user.role)) {
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

      if (await this.isBlockedByMaintenance(user, (t, opts) => ctx.reply(t, opts))) {
        return;
      }

      if (!user.language || !user.phoneNumber) {
        await this.sendLanguagePrompt(ctx);
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

    bot.command(["language", "lang"], async (ctx) => {
      if (!ctx.from) return;
      const user = await findOrCreateTelegramUser({
        telegramId: BigInt(ctx.from.id),
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        username: ctx.from.username,
      });
      if (user.isBanned) return;
      if (await this.isBlockedByMaintenance(user, (t, opts) => ctx.reply(t, opts))) return;
      await this.setBotState(user.id, null);
      await this.sendLanguagePrompt(ctx);
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
        if (res.user.referredById) {
          const referrer = await prisma.user.findUnique({ where: { id: res.user.referredById } });
          if (referrer) {
            const rLang: Language = referrer.language || "AM";
            const bonusNote =
              res.referralBonus && res.referralBonus.bonusAmount > 0
                ? rLang === "AM"
                  ? `\n🎁 የ<b>${res.referralBonus.bonusAmount} ብር</b> የግብዣ ቦነስ ወደ Wallet-ዎ ገብቷል!`
                  : `\n🎁 <b>${res.referralBonus.bonusAmount} ETB</b> referral bonus added to your Wallet!`
                : "";
            await this.sendSafeMessage(
              referrer.telegramId,
              rLang === "AM"
                ? `🎉 በመጋበዣ ሊንክዎ <b>${escapeHtml(res.user.firstName)}</b> ተመዝግቧል!${bonusNote}`
                : `🎉 <b>${escapeHtml(res.user.firstName)}</b> registered using your invite link!${bonusNote}`
            );
          }
        }
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

      if (await this.isBlockedByMaintenance(caller, (t, opts) => ctx.reply(t, opts))) {
        await ctx.answerCallbackQuery();
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

        if (data === "adm:acc_add") {
          if (caller.role !== "SUPER_ADMIN") {
            await ctx.answerCallbackQuery({ text: "Super Admin only", show_alert: true });
            return;
          }
          await this.setBotState(caller.id, { step: "ADMIN_ADD_ACC_PROVIDER" });
          await ctx.answerCallbackQuery();
          await ctx.reply(
            adminLang === "AM"
              ? "➕ <b>አዲስ የክፍያ አካውንት</b>\n\nየክፍያውን Provider ስም ይጻፉ (ለምሳሌ: <code>Telebirr</code>፣ <code>CBE</code>፣ <code>BOA</code>)፦"
              : "➕ <b>New Payment Account</b>\n\nEnter provider name (e.g. <code>Telebirr</code>, <code>CBE</code>):",
            { parse_mode: "HTML", reply_markup: this.cancelKeyboard(adminLang) }
          );
          return;
        }

        if (data.startsWith("adm:acc_field:")) {
          if (caller.role !== "SUPER_ADMIN") {
            await ctx.answerCallbackQuery({ text: "Super Admin only", show_alert: true });
            return;
          }
          const parts = data.split(":");
          const accId = parts[2];
          const field = parts[3] as "accountNumber" | "accountName" | "provider";
          if (!accId || (field !== "accountNumber" && field !== "accountName" && field !== "provider")) {
            await ctx.answerCallbackQuery({ text: "Invalid field", show_alert: true });
            return;
          }
          const acc = await prisma.paymentAccount.findUnique({ where: { id: accId } });
          if (!acc) {
            await ctx.answerCallbackQuery({ text: "Account not found", show_alert: true });
            return;
          }
          await this.setBotState(caller.id, { step: "ADMIN_EDIT_PAYMENT_FIELD", accountId: acc.id, field });
          await ctx.answerCallbackQuery();
          await ctx.reply(
            adminLang === "AM"
              ? `✏️ የ<b>${escapeHtml(acc.provider)}</b> አዲስ <b>${field === "accountNumber" ? "ቁጥር" : "ስም"}</b> ይጻፉ (የአሁኑ: <code>${escapeHtml(acc[field])}</code>)፦`
              : `✏️ Enter new <b>${field}</b> for <b>${escapeHtml(acc.provider)}</b> (current: <code>${escapeHtml(acc[field])}</code>):`,
            { parse_mode: "HTML", reply_markup: this.cancelKeyboard(adminLang) }
          );
          return;
        }

        if (data.startsWith("adm:acc_del:")) {
          if (caller.role !== "SUPER_ADMIN") {
            await ctx.answerCallbackQuery({ text: "Super Admin only", show_alert: true });
            return;
          }
          const accId = data.slice("adm:acc_del:".length);
          const depCount = await prisma.depositRequest.count({ where: { paymentAccountId: accId } });
          if (depCount > 0) {
            await prisma.paymentAccount.update({ where: { id: accId }, data: { isActive: false } });
            await ctx.answerCallbackQuery({ text: "Has deposit history — disabled instead", show_alert: true });
          } else {
            await prisma.paymentAccount.delete({ where: { id: accId } }).catch(() => {});
            await recordAuditLog(prisma, {
              actorId: caller.id,
              actorRole: caller.role,
              action: "DELETE_PAYMENT_ACCOUNT",
              targetType: "PaymentAccount",
              targetId: accId,
            });
            await ctx.answerCallbackQuery({ text: "🗑️ Account deleted" });
          }
          await this.sendPaymentAccountsAdmin((t, opts) => ctx.reply(t, opts), caller.role, adminLang);
          return;
        }

        if (data === "adm:settings") {
          if (caller.role !== "SUPER_ADMIN") {
            await ctx.answerCallbackQuery({ text: "Super Admin only", show_alert: true });
            return;
          }
          await ctx.answerCallbackQuery();
          await this.sendAdminSettingsPanel((t, opts) => ctx.reply(t, opts), adminLang);
          return;
        }

        if (data.startsWith("adm:toggle:")) {
          if (caller.role !== "SUPER_ADMIN") {
            await ctx.answerCallbackQuery({ text: "Super Admin only", show_alert: true });
            return;
          }
          const field = data.slice("adm:toggle:".length) as AdminBoolSettingKey;
          if (!(field in SETTINGS_BOOL_LABELS)) {
            await ctx.answerCallbackQuery({ text: "Unknown toggle", show_alert: true });
            return;
          }
          const current = await getSystemSettings();
          const nextVal = !current[field];
          await prisma.systemSettings.update({
            where: { id: 1 },
            data: { [field]: nextVal } as Prisma.SystemSettingsUpdateInput,
          });
          await recordAuditLog(prisma, {
            actorId: caller.id,
            actorRole: caller.role,
            action: `TOGGLE_SETTING_${field}`,
            targetType: "SystemSettings",
            targetId: "1",
            before: { [field]: current[field] },
            after: { [field]: nextVal },
          });
          await ctx.answerCallbackQuery({
            text: `${SETTINGS_BOOL_LABELS[field]}: ${nextVal ? "ON" : "OFF"}`,
          });
          await this.sendAdminSettingsPanel((t, opts) => ctx.reply(t, opts), adminLang);
          return;
        }

        if (data === "adm:set_banner") {
          if (caller.role !== "SUPER_ADMIN") {
            await ctx.answerCallbackQuery({ text: "Super Admin only", show_alert: true });
            return;
          }
          await this.setBotState(caller.id, { step: "ADMIN_EDIT_BANNER" });
          await ctx.answerCallbackQuery();
          await ctx.reply(
            adminLang === "AM"
              ? "🖼️ የቦቱን <b>Welcome Banner ፎቶ</b> በቀጥታ እዚህ ይላኩ (ወይም `https://...` URL ይጻፉ፣ ለማጥፋት `clear` ይላኩ)፦"
              : "🖼️ Send the <b>Welcome Banner Photo</b> directly here (or paste `https://...` URL, or send `clear` to remove):",
            { parse_mode: "HTML", reply_markup: this.cancelKeyboard(adminLang) }
          );
          return;
        }

        if (data.startsWith("adm:set:")) {
          if (caller.role !== "SUPER_ADMIN") {
            await ctx.answerCallbackQuery({ text: "Super Admin only", show_alert: true });
            return;
          }
          const field = data.slice("adm:set:".length) as AdminSettingKey;
          const meta = SETTINGS_META[field];
          if (!meta) {
            await ctx.answerCallbackQuery({ text: "Unknown setting", show_alert: true });
            return;
          }
          await this.setBotState(caller.id, { step: "ADMIN_EDIT_SETTING", field });
          await ctx.answerCallbackQuery();
          await ctx.reply(
            `⚙️ <b>${escapeHtml(meta.label)}</b>\n\n${escapeHtml(adminLang === "AM" ? meta.hintAm : meta.hintEn)}`,
            { parse_mode: "HTML", reply_markup: this.cancelKeyboard(adminLang) }
          );
          return;
        }

        if (data === "adm:player_view") {
          await this.setBotState(caller.id, null);
          await ctx.answerCallbackQuery();
          await this.sendLanguagePrompt(ctx);
          await ctx.reply(
            adminLang === "AM"
              ? "👤 <b>Player View</b> — ከላይ ቋንቋ በመምረጥ ይቀጥሉ። ወደ Admin Panel ለመመለስ /admin ወይም /start ይላኩ።"
              : "👤 <b>Player View</b> — Pick a language above to continue. Send /admin or /start anytime to return to the Admin Panel.",
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
            if (res.referralBonus && res.referralBonus.bonusAmount > 0) {
              const referrer = await prisma.user.findUnique({
                where: { id: res.referralBonus.referrerId },
              });
              if (referrer) {
                const rLang: Language = referrer.language || "AM";
                await this.sendSafeMessage(
                  referrer.telegramId,
                  rLang === "AM"
                    ? `🎁 የጋበዙት ተጫዋች (<b>${escapeHtml(res.user.firstName)}</b>) Deposit ስላደረገ የ<b>${res.referralBonus.bonusAmount} ብር</b> የግብዣ ቦነስ ወደ Wallet-ዎ ገብቷል!`
                    : `🎁 You earned <b>${res.referralBonus.bonusAmount} ETB</b> referral bonus from <b>${escapeHtml(res.user.firstName)}</b>'s deposit!`
                );
              }
            }
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

        if (!caller.phoneNumber && !this.isAdminRole(caller.role)) {
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

      // Strict registration gate for all remaining callbacks (players must register; Admin can test directly)
      if (!caller.phoneNumber && !this.isAdminRole(caller.role)) {
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

      if (data === "menu:my_invites") {
        await ctx.answerCallbackQuery();
        await this.sendInviteDetails(caller, (text, opts) => ctx.reply(text, opts));
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

        const rawSupport = settings.supportUsername.trim();
        const supportHandle = rawSupport
          ? rawSupport.startsWith("@")
            ? rawSupport
            : `@${rawSupport}`
          : "";

        const supportHeaderAm = supportHandle
          ? `የሚያጋጥማቹ የክፍያ ችግር:\n${escapeHtml(supportHandle)} ላይ ፃፉልን።\n\n`
          : "";
        const supportHeaderEn = supportHandle
          ? `For any payment issues:\nWrite to us at ${escapeHtml(supportHandle)}.\n\n`
          : "";

        const isTelebirr = acc.provider.trim().toLowerCase() === "telebirr";
        const providerLabelAm = isTelebirr ? "ቴሌብር" : escapeHtml(acc.provider);

        const msg =
          lang === "AM"
            ? `${supportHeaderAm}` +
              `1. ከታች ባለው የ${providerLabelAm} አካውንት ${state.amount} ብር ያስገቡ\n\n` +
              `   Phone: <code>${escapeHtml(acc.accountNumber)}</code>\n\n` +
              `2. የከፈሉበትን አጭር የጹሁፍ መልዕክት(message) copy በማድረግ እዚ ላይ Past አድርገው ያስገቡና ይላኩት 👇 👇 👇`
            : `${supportHeaderEn}` +
              `1. Deposit ${state.amount} ETB to the ${escapeHtml(acc.provider)} account below\n\n` +
              `   Phone: <code>${escapeHtml(acc.accountNumber)}</code>\n\n` +
              `2. Copy your payment confirmation SMS message, paste it here, and send it 👇 👇 👇`;

        await ctx.reply(msg, { parse_mode: "HTML" });
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

    // Photo handler: Admin Banner Upload (when ADMIN_EDIT_BANNER) OR Player Deposit Receipt
    bot.on("message:photo", async (ctx) => {
      if (!ctx.from) return;
      const user = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
      if (!user || user.isBanned) return;
      const state = user.botState as BotConvState;
      const fileId = ctx.message.photo[ctx.message.photo.length - 1]?.file_id;
      const lang: Language = user.language || "AM";

      if (user.role === "SUPER_ADMIN" && state?.step === "ADMIN_EDIT_BANNER" && fileId) {
        await prisma.systemSettings.update({
          where: { id: 1 },
          data: { welcomeBannerUrl: fileId },
        });
        await recordAuditLog(prisma, {
          actorId: user.id,
          actorRole: "SUPER_ADMIN",
          action: "UPDATE_SETTING_welcomeBannerUrl",
          targetType: "SystemSettings",
          targetId: "1",
          after: { welcomeBannerUrl: fileId },
        });
        await this.setBotState(user.id, null);
        await ctx.reply(
          lang === "AM"
            ? "✅ አዲሱ የWelcome Banner ፎቶ ተቀምጧል! (/start ላይ ይታያል)"
            : "✅ New Welcome Banner photo saved!"
        );
        await this.sendAdminSettingsPanel((t, opts) => ctx.reply(t, opts), lang);
        return;
      }

      if (!state || state.step !== "DEPOSIT_RECEIPT") return;
      if (await this.isBlockedByMaintenance(user, (t, opts) => ctx.reply(t, opts))) return;

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
      if (
        rawState &&
        (await this.handleAdminTextState(rawUser, rawState, text, (t, opts) => ctx.reply(t, opts)))
      ) {
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
        kb.text(lang === "AM" ? "❌ ሰርዝ" : "❌ Cancel", "flow:cancel");

        const msg =
          lang === "AM"
            ? `❇️ ብር ማስገባት የሚችሉት አሁን በተቀመጠዉ የ${escapeHtml(providersList)} አካዉንት ብቻ ነዉ።\n\n` +
              `🚫 ከዚህ ዉጭ የላከ አናስተናግድም 🚫\n\n` +
              `👇 ${escapeHtml(providersList)} የሚለዉን ይምረጡ 👇`
            : `❇️ You can only deposit using the active ${escapeHtml(providersList)} account listed below.\n\n` +
              `🚫 Transfers outside this account will not be accepted 🚫\n\n` +
              `👇 Select ${escapeHtml(providersList)} below 👇`;

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
              ? `✅ የ<b>${amount} ብር</b> የወጪ (Withdraw) ጥያቄዎ ቀርቧል! ክፍያው እስኪላክ ገንዘቡ ተይዟል።`
              : `✅ Withdrawal request of <b>${amount} ETB</b> submitted!`,
            { parse_mode: "HTML" }
          );
          await this.notifyAdminsNewWithdraw(withdraw.id);
        } catch (err) {
          await this.setBotState(user.id, null);
          await ctx.reply(this.formatWalletError(err, lang));
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
              ? "❌ በዚህ ስልክ ቁጥር የተመዘገበ ተጫዋች አልተገኘም። ቁጥሩን አረጋግጠው እንደገና ይጻፉ ወይም ሰርዝ ይጫኑ።"
              : "❌ No registered player found with that phone number. Try again or tap Cancel.",
            { reply_markup: this.cancelKeyboard(lang) }
          );
          return;
        }
        if (receiver.id === user.id) {
          await ctx.reply(
            lang === "AM" ? "⚠️ ለራስዎ ገንዘብ መላክ አይችሉም።" : "⚠️ You cannot transfer to yourself."
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
            ? `👤 ተቀባይ: <b>${escapeHtml(receiver.firstName)}</b> (${escapeHtml(receiver.phoneNumber!)})\n\n💵 የሚልኩትን <b>መጠን (በብር)</b> ይጻፉ፦`
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
              ? `✅ <b>${amount} ብር</b> ወደ <b>${escapeHtml(res.receiver.firstName)}</b> (${escapeHtml(res.receiver.phoneNumber!)}) በተሳካ ሁኔታ ተልኳል!\n💰 ቀሪ ሂሳብ: <b>${res.senderBalance.toFixed(2)} ብር</b>`
              : `✅ Transferred <b>${amount} ETB</b> to <b>${escapeHtml(res.receiver.firstName)}</b>!\n💰 New Wallet: <b>${res.senderBalance.toFixed(2)} ETB</b>`,
            { parse_mode: "HTML" }
          );
          const rLang: Language = res.receiver.language || "AM";
          await this.sendSafeMessage(
            res.receiver.telegramId,
            rLang === "AM"
              ? `🎁 ከ<b>${escapeHtml(res.sender.firstName)}</b> <b>${amount} ብር</b> ደርሶዎታል!\n💰 ቀሪ ሂሳብ: <b>${res.receiverBalance.toFixed(2)} ብር</b>`
              : `🎁 You received <b>${amount} ETB</b> from <b>${escapeHtml(res.sender.firstName)}</b>!\n💰 Wallet: <b>${res.receiverBalance.toFixed(2)} ETB</b>`
          );
        } catch (err) {
          await this.setBotState(user.id, null);
          await ctx.reply(this.formatWalletError(err, lang));
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

