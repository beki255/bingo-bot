export type AdminTab =
  | "dashboard"
  | "deposits"
  | "withdrawals"
  | "users"
  | "games"
  | "transactions"
  | "rooms"
  | "accounts"
  | "broadcast"
  | "settings"
  | "audit";

export interface AdminProfile {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  phoneNumber: string | null;
  role: "SUPER_ADMIN" | "CASHIER";
}

export interface DashboardMetrics {
  totalUsers: number;
  verifiedUsers: number;
  bannedUsers: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  todayDeposits: number;
  todayWithdrawals: number;
  todayHouseCut: number;
  todayTotalPot: number;
  allTimeDeposits: number;
  allTimeWithdrawals: number;
  allTimeHouseCut: number;
  allTimeTotalPot: number;
  totalWalletBalance: number;
  totalLockedBalance: number;
  activeRoundsCount: number;
  totalGamesFinished: number;
}

export interface AdminUserRow {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  phoneNumber: string | null;
  language: string | null;
  role: "PLAYER" | "CASHIER" | "SUPER_ADMIN";
  isBanned: boolean;
  referralCode: string;
  welcomeBonusClaimed: boolean;
  hasWebPassword: boolean;
  balance: number;
  lockedBalance: number;
  referralsCount: number;
  ticketsCount: number;
  depositsCount: number;
  withdrawalsCount: number;
  createdAt: string;
}

export interface AdminDepositRow {
  id: string;
  userId: string;
  userName: string;
  userPhone: string | null;
  userTelegramId: string;
  amount: number;
  transactionRef: string;
  receiptText: string | null;
  screenshotFileId: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  provider: string;
  accountName: string;
  accountNumber: string;
  createdAt: string;
}

export interface AdminWithdrawalRow {
  id: string;
  userId: string;
  userName: string;
  userPhone: string | null;
  userTelegramId: string;
  provider: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  status: "PENDING" | "PAID" | "REJECTED";
  payoutRef: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AdminRoomRow {
  id: string;
  nameAm: string;
  nameEn: string;
  mode: string;
  stakeAmount: number;
  houseCutPercent: number;
  minPlayers: number;
  maxCartelasPerUser: number | null;
  cartelaPoolSize: number;
  countdownSeconds: number;
  nextGameDelaySeconds: number;
  waitTimeoutSeconds: number;
  callIntervalMs: number;
  winningPattern: "ONE_LINE" | "TWO_LINES" | "FOUR_CORNERS" | "X_SHAPE" | "FULL_HOUSE";
  freeCenter: boolean;
  isActive: boolean;
  sortOrder: number;
  totalRounds: number;
}

export interface AdminPaymentAccountRow {
  id: string;
  provider: string;
  accountName: string;
  accountNumber: string;
  instructionsAm: string;
  instructionsEn: string;
  isActive: boolean;
  sortOrder: number;
}

export interface AdminGameRow {
  id: string;
  roomId: string;
  roomNameAm: string;
  roomNameEn: string;
  stakeAmount: number;
  status: string;
  playersCount: number;
  ticketsCount: number;
  calledCount: number;
  totalPot: number;
  houseCutAmount: number;
  prizePool: number;
  winners: Array<{
    userId: string;
    userName: string;
    cartelaNumber: number;
    prizeWon: number;
  }>;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  countdown?: number;
  currentBall?: { letter: string; num: number } | null;
  recentCalls?: Array<{ num: number; letter: string }>;
  pendingSelectionsCount?: number;
}

export interface AdminTransactionRow {
  id: string;
  userId: string;
  userName: string;
  userPhone: string | null;
  type: string;
  amount: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
}

export interface AdminAuditLogRow {
  id: string;
  actorName: string;
  actorUsername: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;
}

export interface SystemSettingsData {
  botName: string;
  welcomeBannerUrl: string;
  supportUsername: string;
  channelUrl: string;
  welcomeCaptionAm: string;
  welcomeCaptionEn: string;
  instructionAm: string;
  instructionEn: string;
  welcomeBonusEnabled: boolean;
  welcomeBonusAmount: number;
  referralBonusEnabled: boolean;
  referralTriggerType:
    | "ON_SIGNUP_VERIFIED"
    | "ON_FIRST_DEPOSIT"
    | "ON_EVERY_DEPOSIT_PERCENT"
    | "ON_EVERY_BET_PERCENT";
  referralBonusValue: number;
  minDeposit: number;
  maxDeposit: number;
  minWithdraw: number;
  maxWithdraw: number;
  withdrawProviders: string[];
  transferEnabled: boolean;
  minTransfer: number;
  maxTransfer: number;
  manualClaimWindowMs: number;
  maintenanceMode: boolean;
  maintenanceMessageAm: string;
  maintenanceMessageEn: string;
}
