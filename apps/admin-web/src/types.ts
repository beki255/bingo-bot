export type AdminTab =
  | "dashboard"
  | "analytics"
  | "deposits"
  | "withdrawals"
  | "users"
  | "games"
  | "transactions"
  | "rooms"
  | "accounts"
  | "broadcast"
  | "channel_post"
  | "settings"
  | "audit";

export type AnalyticsRange = "today" | "7d" | "30d" | "90d" | "all";
export type AnalyticsGranularity = "hour" | "day" | "week" | "month";

export interface AnalyticsSeriesPoint {
  key: string;
  label: string;
  deposits: number;
  depositsCount: number;
  withdrawals: number;
  withdrawalsCount: number;
  netCashflow: number;
  houseProfit: number;
  totalPot: number;
  roundsCount: number;
  ticketsCount: number;
  newUsers: number;
}

export interface HourlyActivityPoint {
  hour: number;
  label: string;
  tickets: number;
  rounds: number;
  depositsAmount: number;
  depositsCount: number;
  withdrawalsAmount: number;
}

export interface ProviderBreakdownRow {
  provider: string;
  amount: number;
  count: number;
  sharePct: number;
}

export interface RoomPerformanceRow {
  roomId: string;
  nameAm: string;
  nameEn: string;
  stakeAmount: number;
  houseCutPercent: number;
  isActive: boolean;
  roundsCount: number;
  ticketsCount: number;
  avgTicketsPerRound: number;
  totalPot: number;
  houseProfit: number;
  prizePool: number;
  sharePct: number;
}

export interface LedgerBreakdownRow {
  type: string;
  count: number;
  amount: number;
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  username: string | null;
  phoneNumber: string | null;
  amount: number;
  count: number;
}

export interface AdminAnalyticsData {
  range: AnalyticsRange;
  granularity: AnalyticsGranularity;
  generatedAt: string;
  summary: {
    approvedDepositsAmount: number;
    approvedDepositsCount: number;
    avgDepositAmount: number;
    pendingDepositsAmount: number;
    pendingDepositsCount: number;
    rejectedDepositsAmount: number;
    rejectedDepositsCount: number;
    depositApprovalRate: number;
    depositsChangePct: number | null;

    paidWithdrawalsAmount: number;
    paidWithdrawalsCount: number;
    avgWithdrawalAmount: number;
    pendingWithdrawalsAmount: number;
    pendingWithdrawalsCount: number;
    rejectedWithdrawalsAmount: number;
    rejectedWithdrawalsCount: number;
    withdrawalApprovalRate: number;
    withdrawalsChangePct: number | null;

    netCashflow: number;
    houseProfit: number;
    houseProfitChangePct: number | null;
    totalPotVolume: number;
    totalPrizesPaid: number;
    effectiveHouseMargin: number;
    totalWalletLiability: number;
    totalLockedLiability: number;

    roundsFinished: number;
    roundsCancelled: number;
    roundsChangePct: number | null;
    totalTicketsSold: number;
    avgTicketsPerRound: number;
    avgPotPerRound: number;
    avgBallsPerWin: number;
    burnedFalseClaims: number;

    welcomeBonusTotal: number;
    welcomeBonusCount: number;
    referralBonusTotal: number;
    referralBonusCount: number;
    adminCreditTotal: number;
    adminDebitTotal: number;
    p2pTransfersVolume: number;
    p2pTransfersCount: number;
  };
  series: AnalyticsSeriesPoint[];
  hourlyActivity: HourlyActivityPoint[];
  peakHour: { hour: number; label: string; tickets: number };
  depositProviders: ProviderBreakdownRow[];
  withdrawalProviders: ProviderBreakdownRow[];
  roomPerformance: RoomPerformanceRow[];
  ledgerBreakdown: LedgerBreakdownRow[];
  userStats: {
    totalUsers: number;
    verifiedUsers: number;
    bannedUsers: number;
    verificationRate: number;
    newUsers: number;
    newUsersChangePct: number | null;
    activePlayers: number;
    depositingPlayers: number;
    referralsInPeriod: number;
    langAm: number;
    langEn: number;
    langUnset: number;
  };
  leaderboards: {
    topDepositors: LeaderboardEntry[];
    topWinners: LeaderboardEntry[];
    mostActive: LeaderboardEntry[];
    topReferrers: LeaderboardEntry[];
  };
}

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
  maxCartelasOverride?: number | null;
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
