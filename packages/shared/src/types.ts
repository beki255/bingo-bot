export type Language = "AM" | "EN";
export type UserRole = "PLAYER" | "CASHIER" | "SUPER_ADMIN";
export type RoomMode = "AUTO" | "MANUAL";
export type WinningPattern =
  | "ONE_LINE"
  | "TWO_LINES"
  | "FOUR_CORNERS"
  | "X_SHAPE"
  | "FULL_HOUSE";

export type GameRoundStatus =
  | "WAITING"
  | "COUNTDOWN"
  | "RUNNING"
  | "CLAIM_WINDOW"
  | "FINISHED"
  | "CANCELLED_REFUNDED";

export type TicketStatus =
  | "ACTIVE"
  | "BURNED_FALSE_CLAIM"
  | "WINNER"
  | "REFUNDED";

export type ReferralTriggerType =
  | "ON_SIGNUP_VERIFIED"
  | "ON_FIRST_DEPOSIT"
  | "ON_EVERY_DEPOSIT_PERCENT"
  | "ON_EVERY_BET_PERCENT";

export interface WalletSummary {
  balance: number;
  lockedBalance: number;
}

