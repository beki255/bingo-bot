import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

export const env = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL || "",
  botToken: (process.env.BOT_TOKEN || "").trim(),
  botUsername: (process.env.BOT_USERNAME || "").trim(),
  botName: (process.env.BOT_NAME || "Bingo Ethiopia").trim(),
  welcomeBannerUrl: (process.env.WELCOME_BANNER_URL || "").trim(),
  supportUsername: (process.env.SUPPORT_USERNAME || "@BingoSupport").trim(),
  miniAppUrl: process.env.MINI_APP_URL || "http://localhost:5173",
  adminWebUrl: process.env.ADMIN_WEB_URL || "http://localhost:5174",
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || "dev_fallback_secret_change_in_prod",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  allowDevAuth:
    process.env.ALLOW_DEV_AUTH === "true" && process.env.NODE_ENV !== "production",
};

