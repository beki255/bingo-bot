import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function verifyTelegramInitData(
  initDataRaw: string,
  botToken: string,
  maxAgeSeconds = 86400
) {
  if (!botToken) throw new Error("BOT_TOKEN is not configured");
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  if (!hash) throw new Error("Missing Telegram initData hash");
  params.delete("hash");

  const entries = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(computedHash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid Telegram initData signature");
  }

  const authDate = Number(params.get("auth_date") || "0");
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || nowSec - authDate > maxAgeSeconds) {
    throw new Error("Telegram initData expired");
  }

  const userJson = params.get("user");
  if (!userJson) throw new Error("Missing user in Telegram initData");
  const user = JSON.parse(userJson) as TelegramWebAppUser;
  if (!user || typeof user.id !== "number") {
    throw new Error("Invalid user object in Telegram initData");
  }

  return { user, authDate };
}

export interface PlayerTokenPayload {
  sub: string;
  telegramId: string;
  kind: "PLAYER";
}

export interface AdminTokenPayload {
  sub: string;
  role: UserRole;
  kind: "ADMIN";
}

export function signPlayerToken(userId: string, telegramId: bigint): string {
  return jwt.sign(
    {
      sub: userId,
      telegramId: telegramId.toString(),
      kind: "PLAYER",
    } satisfies PlayerTokenPayload,
    env.adminJwtSecret,
    { expiresIn: "12h" }
  );
}

export function verifyPlayerToken(token: string): PlayerTokenPayload {
  const decoded = jwt.verify(token, env.adminJwtSecret) as PlayerTokenPayload;
  if (decoded.kind !== "PLAYER" || !decoded.sub) {
    throw new Error("Invalid player token");
  }
  return decoded;
}

export function signAdminToken(userId: string, role: UserRole): string {
  return jwt.sign(
    {
      sub: userId,
      role,
      kind: "ADMIN",
    } satisfies AdminTokenPayload,
    env.adminJwtSecret,
    { expiresIn: "12h" }
  );
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  const decoded = jwt.verify(token, env.adminJwtSecret) as AdminTokenPayload;
  if (
    decoded.kind !== "ADMIN" ||
    !decoded.sub ||
    (decoded.role !== "SUPER_ADMIN" && decoded.role !== "CASHIER")
  ) {
    throw new Error("Invalid admin token");
  }
  return decoded;
}

