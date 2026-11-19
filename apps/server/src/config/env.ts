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

export const env = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  botToken: (process.env.BOT_TOKEN || "").trim(),
  botUsername: (process.env.BOT_USERNAME || "").trim(),
  botName: (process.env.BOT_NAME || "Tunnel Bingo").trim(),
  welcomeBannerUrl: (
    process.env.WELCOME_BANNER_URL ||
    "C:/Users/HP/.gemini/antigravity/brain/b8354e76-8edb-40b0-94af-9082a031ac7b/.user_uploaded/media_1794577990868_53b7b1d7.jpg"
  ).trim(),
  supportUsername: (process.env.SUPPORT_USERNAME || "").trim(),
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

