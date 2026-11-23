import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const miniAppUrlRaw = (process.env.MINI_APP_URL || "http://localhost:5173").trim().replace(/\/+$/, "");
const rawAdminWebUrl = (process.env.ADMIN_WEB_URL || "").trim().replace(/\/+$/, "");
const computedAdminWebUrl =
  rawAdminWebUrl && !(process.env.NODE_ENV === "production" && rawAdminWebUrl.includes("localhost"))
    ? rawAdminWebUrl
    : miniAppUrlRaw.startsWith("https://")
      ? `${miniAppUrlRaw}/admin`
      : "http://localhost:5174/admin";

const rawBotToken = (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
const resolvedBotToken =
  !rawBotToken || rawBotToken.startsWith("8807985454:")
    ? "9188941192:AAFdFhf6OMUl-yh11k396FYJ-Rl0tWF8xm0"
    : rawBotToken;

const rawBotUsername = (process.env.BOT_USERNAME || "").trim().replace(/^@/, "");
const resolvedBotUsername =
  !rawBotUsername || rawBotUsername.toLowerCase() === "tunnel_bingo_bot"
    ? "Zemen_Bingo_et_bot"
    : rawBotUsername;

const rawBotName = (process.env.BOT_NAME || "").trim();
const resolvedBotName =
  !rawBotName || rawBotName.toLowerCase() === "tunnel bingo"
    ? "Zemen Bingo"
    : rawBotName;

const rawSupportUsername = (process.env.SUPPORT_USERNAME || "").trim();
const resolvedSupportUsername =
  !rawSupportUsername || rawSupportUsername.toLowerCase() === "@tunnel_tech_solution" || rawSupportUsername.toLowerCase() === "tunnel_tech_solution"
    ? "@Zemen_Bingo_support"
    : rawSupportUsername;

export const env = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  botToken: resolvedBotToken,
  botUsername: resolvedBotUsername,
  botName: resolvedBotName,
  welcomeBannerUrl: (
    process.env.WELCOME_BANNER_URL ||
    path.resolve(__dirname, "../../assets/welcome_banner.jpg")
  ).trim(),
  supportUsername: resolvedSupportUsername,
  miniAppUrl: miniAppUrlRaw,
  adminWebUrl: computedAdminWebUrl,
  superAdminTelegramId: (process.env.SUPER_ADMIN_TELEGRAM_ID || "7748253327").trim(),
  superAdminUsername: (process.env.SUPER_ADMIN_USERNAME || "admin").trim(),
  superAdminPassword: (process.env.SUPER_ADMIN_PASSWORD || "ChangeMe123!").trim(),
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || "dev_fallback_secret_change_in_prod",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  allowDevAuth:
    process.env.ALLOW_DEV_AUTH === "true" && process.env.NODE_ENV !== "production",
};

