import { prisma } from "../db/prisma.js";

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

export interface AdminAnalyticsResponse {
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

const EAT_OFFSET_MS = 3 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toEatDate(date: Date): Date {
  return new Date(date.getTime() + EAT_OFFSET_MS);
}

function startOfDayEat(date: Date): Date {
  const eat = toEatDate(date);
  return new Date(Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate()) - EAT_OFFSET_MS);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function getHourEat(date: Date): number {
  return toEatDate(date).getUTCHours();
}

function formatKeyDayEat(date: Date): string {
  const eat = toEatDate(date);
  const y = eat.getUTCFullYear();
  const m = String(eat.getUTCMonth() + 1).padStart(2, "0");
  const d = String(eat.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatLabelDayEat(date: Date): string {
  const eat = toEatDate(date);
  return `${MONTH_NAMES[eat.getUTCMonth()]} ${eat.getUTCDate()}`;
}

function formatKeyMonthEat(date: Date): string {
  const eat = toEatDate(date);
  const y = eat.getUTCFullYear();
  const m = String(eat.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatLabelMonthEat(date: Date): string {
  const eat = toEatDate(date);
  return `${MONTH_NAMES[eat.getUTCMonth()]} ${eat.getUTCFullYear()}`;
}

function getWeekStartEat(date: Date): Date {
  const dayStart = startOfDayEat(date);
  const eat = toEatDate(dayStart);
  const dayOfWeek = eat.getUTCDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (dayOfWeek + 6) % 7;
  return addDays(dayStart, -diffToMonday);
}

function calcPctChange(curr: number, prev: number, allowComparison: boolean): number | null {
  if (!allowComparison) return null;
  if (curr === 0 && prev === 0) return 0;
  if (prev === 0) return curr > 0 ? 100 : -100;
  return Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getAdminAnalytics(range: AnalyticsRange): Promise<AdminAnalyticsResponse> {
  const now = new Date();
  const todayStart = startOfDayEat(now);
  const tomorrowStart = addDays(todayStart, 1);

  let start: Date | null = null;
  const end: Date = tomorrowStart;
  let prevStart: Date | null = null;
  let prevEnd: Date | null = null;
  let granularity: AnalyticsGranularity = "day";

  if (range === "today") {
    start = todayStart;
    prevStart = addDays(todayStart, -1);
    prevEnd = todayStart;
    granularity = "hour";
  } else if (range === "7d") {
    start = addDays(todayStart, -6);
    prevStart = addDays(start, -7);
    prevEnd = start;
    granularity = "day";
  } else if (range === "30d") {
    start = addDays(todayStart, -29);
    prevStart = addDays(start, -30);
    prevEnd = start;
    granularity = "day";
  } else if (range === "90d") {
    start = addDays(todayStart, -89);
    prevStart = addDays(start, -90);
    prevEnd = start;
    granularity = "week";
  } else {
    start = null;
    prevStart = null;
    prevEnd = null;
    granularity = "day";
  }

  const queryStart = prevStart ?? start;

  const [
    deposits,
    pendingDepositsAll,
    withdrawals,
    pendingWithdrawalsAll,
    rounds,
    tickets,
    recentUsers,
    totalUsers,
    verifiedUsers,
    bannedUsers,
    usersByLang,
    walletAgg,
    txGroup,
    adminCreditsAgg,
    adminDebitsAgg,
    transfersAgg,
    rooms,
    topReferrersRaw,
  ] = await Promise.all([
    prisma.depositRequest.findMany({
      where: queryStart
        ? { OR: [{ reviewedAt: { gte: queryStart } }, { createdAt: { gte: queryStart } }] }
        : undefined,
      select: {
        id: true,
        userId: true,
        amount: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        paymentAccount: { select: { provider: true } },
      },
    }),
    prisma.depositRequest.aggregate({
      where: { status: "PENDING" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.withdrawRequest.findMany({
      where: queryStart
        ? { OR: [{ reviewedAt: { gte: queryStart } }, { createdAt: { gte: queryStart } }] }
        : undefined,
      select: {
        id: true,
        userId: true,
        amount: true,
        status: true,
        provider: true,
        createdAt: true,
        reviewedAt: true,
      },
    }),
    prisma.withdrawRequest.aggregate({
      where: { status: "PENDING" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.gameRound.findMany({
      where: queryStart
        ? { OR: [{ endedAt: { gte: queryStart } }, { createdAt: { gte: queryStart } }] }
        : undefined,
      select: {
        id: true,
        roomId: true,
        status: true,
        totalPot: true,
        houseCutAmount: true,
        prizePool: true,
        calledNumbers: true,
        createdAt: true,
        endedAt: true,
        _count: { select: { tickets: true } },
      },
    }),
    prisma.gameTicket.findMany({
      where: start ? { purchasedAt: { gte: start, lt: end } } : undefined,
      select: {
        userId: true,
        pricePaid: true,
        prizeWon: true,
        status: true,
        purchasedAt: true,
      },
    }),
    prisma.user.findMany({
      where: queryStart ? { createdAt: { gte: queryStart, lt: end } } : undefined,
      select: {
        id: true,
        createdAt: true,
        referredById: true,
      },
    }),
    prisma.user.count(),
    prisma.user.count({ where: { phoneNumber: { not: null } } }),
    prisma.user.count({ where: { isBanned: true } }),
    prisma.user.groupBy({
      by: ["language"],
      _count: { _all: true },
    }),
    prisma.wallet.aggregate({
      _sum: { balance: true, lockedBalance: true },
    }),
    prisma.walletTransaction.groupBy({
      by: ["type"],
      where: start ? { createdAt: { gte: start, lt: end } } : undefined,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.walletTransaction.aggregate({
      where: {
        type: "ADMIN_ADJUSTMENT",
        amount: { gt: 0 },
        ...(start ? { createdAt: { gte: start, lt: end } } : {}),
      },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: {
        type: "ADMIN_ADJUSTMENT",
        amount: { lt: 0 },
        ...(start ? { createdAt: { gte: start, lt: end } } : {}),
      },
      _sum: { amount: true },
    }),
    prisma.walletTransfer.aggregate({
      where: start ? { createdAt: { gte: start, lt: end } } : undefined,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.room.findMany({
      orderBy: [{ sortOrder: "asc" }, { stakeAmount: "asc" }],
      select: {
        id: true,
        nameAm: true,
        nameEn: true,
        stakeAmount: true,
        houseCutPercent: true,
        isActive: true,
      },
    }),
    prisma.user.groupBy({
      by: ["referredById"],
      where: {
        referredById: { not: null },
        ...(start ? { createdAt: { gte: start, lt: end } } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const inCurrent = (d: Date) => (!start || d >= start) && d < end;
  const inPrev = (d: Date) => Boolean(prevStart && prevEnd && d >= prevStart && d < prevEnd);

  // Determine dynamic granularity & earliest date for "all"
  let seriesStart = start ?? addDays(todayStart, -6);
  if (range === "all") {
    let earliestTs = todayStart.getTime();
    for (const d of deposits) {
      const ts = startOfDayEat(d.reviewedAt ?? d.createdAt).getTime();
      if (ts < earliestTs) earliestTs = ts;
    }
    for (const w of withdrawals) {
      const ts = startOfDayEat(w.reviewedAt ?? w.createdAt).getTime();
      if (ts < earliestTs) earliestTs = ts;
    }
    for (const r of rounds) {
      const ts = startOfDayEat(r.endedAt ?? r.createdAt).getTime();
      if (ts < earliestTs) earliestTs = ts;
    }
    for (const u of recentUsers) {
      const ts = startOfDayEat(u.createdAt).getTime();
      if (ts < earliestTs) earliestTs = ts;
    }
    const earliestDay = new Date(earliestTs);
    const totalDays = Math.round((todayStart.getTime() - earliestDay.getTime()) / DAY_MS) + 1;
    if (totalDays <= 35) {
      granularity = "day";
      seriesStart = totalDays < 7 ? addDays(todayStart, -6) : earliestDay;
    } else if (totalDays <= 180) {
      granularity = "week";
      seriesStart = earliestDay;
    } else {
      granularity = "month";
      seriesStart = earliestDay;
    }
  }

  // Initialize series buckets
  const bucketMap = new Map<string, AnalyticsSeriesPoint>();
  const orderedBuckets: AnalyticsSeriesPoint[] = [];

  const ensureBucket = (key: string, label: string): AnalyticsSeriesPoint => {
    let existing = bucketMap.get(key);
    if (!existing) {
      existing = {
        key,
        label,
        deposits: 0,
        depositsCount: 0,
        withdrawals: 0,
        withdrawalsCount: 0,
        netCashflow: 0,
        houseProfit: 0,
        totalPot: 0,
        roundsCount: 0,
        ticketsCount: 0,
        newUsers: 0,
      };
      bucketMap.set(key, existing);
      orderedBuckets.push(existing);
    }
    return existing;
  };

  if (granularity === "hour") {
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, "0");
      ensureBucket(hh, `${hh}:00`);
    }
  } else if (granularity === "day") {
    let cursor = startOfDayEat(seriesStart);
    while (cursor <= todayStart) {
      ensureBucket(formatKeyDayEat(cursor), formatLabelDayEat(cursor));
      cursor = addDays(cursor, 1);
    }
  } else if (granularity === "week") {
    let cursor = getWeekStartEat(seriesStart);
    const lastWeek = getWeekStartEat(todayStart);
    while (cursor <= lastWeek) {
      ensureBucket(formatKeyDayEat(cursor), formatLabelDayEat(cursor));
      cursor = addDays(cursor, 7);
    }
  } else {
    const startEat = toEatDate(seriesStart);
    const endEat = toEatDate(todayStart);
    let y = startEat.getUTCFullYear();
    let m = startEat.getUTCMonth();
    const endY = endEat.getUTCFullYear();
    const endM = endEat.getUTCMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const dt = new Date(Date.UTC(y, m, 1) - EAT_OFFSET_MS);
      ensureBucket(formatKeyMonthEat(dt), formatLabelMonthEat(dt));
      m += 1;
      if (m >= 12) {
        m = 0;
        y += 1;
      }
    }
  }

  const getBucketKey = (date: Date): string => {
    if (granularity === "hour") return String(getHourEat(date)).padStart(2, "0");
    if (granularity === "day") return formatKeyDayEat(date);
    if (granularity === "week") return formatKeyDayEat(getWeekStartEat(date));
    return formatKeyMonthEat(date);
  };

  // Initialize hourly activity (0..23 EAT)
  const hourlyActivity: HourlyActivityPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    tickets: 0,
    rounds: 0,
    depositsAmount: 0,
    depositsCount: 0,
    withdrawalsAmount: 0,
  }));

  // Aggregations: Deposits
  let approvedDepositsAmount = 0;
  let approvedDepositsCount = 0;
  let rejectedDepositsAmount = 0;
  let rejectedDepositsCount = 0;
  let prevDepositsAmount = 0;
  const depositProvidersMap = new Map<string, { amount: number; count: number }>();
  const depositorsMap = new Map<string, { amount: number; count: number }>();

  for (const d of deposits) {
    const amt = Number(d.amount);
    const effDate = d.status === "APPROVED" ? (d.reviewedAt ?? d.createdAt) : d.createdAt;
    if (inCurrent(effDate)) {
      if (d.status === "APPROVED") {
        approvedDepositsAmount += amt;
        approvedDepositsCount += 1;

        const bucket = bucketMap.get(getBucketKey(effDate));
        if (bucket) {
          bucket.deposits += amt;
          bucket.depositsCount += 1;
        }

        const hr = getHourEat(effDate);
        hourlyActivity[hr].depositsAmount += amt;
        hourlyActivity[hr].depositsCount += 1;

        const prov = d.paymentAccount?.provider || "Other";
        const prevProv = depositProvidersMap.get(prov) || { amount: 0, count: 0 };
        prevProv.amount += amt;
        prevProv.count += 1;
        depositProvidersMap.set(prov, prevProv);

        const prevUser = depositorsMap.get(d.userId) || { amount: 0, count: 0 };
        prevUser.amount += amt;
        prevUser.count += 1;
        depositorsMap.set(d.userId, prevUser);
      } else if (d.status === "REJECTED") {
        rejectedDepositsAmount += amt;
        rejectedDepositsCount += 1;
      }
    } else if (d.status === "APPROVED" && inPrev(effDate)) {
      prevDepositsAmount += amt;
    }
  }

  // Aggregations: Withdrawals
  let paidWithdrawalsAmount = 0;
  let paidWithdrawalsCount = 0;
  let rejectedWithdrawalsAmount = 0;
  let rejectedWithdrawalsCount = 0;
  let prevWithdrawalsAmount = 0;
  const withdrawalProvidersMap = new Map<string, { amount: number; count: number }>();

  for (const w of withdrawals) {
    const amt = Number(w.amount);
    const effDate = w.status === "PAID" ? (w.reviewedAt ?? w.createdAt) : w.createdAt;
    if (inCurrent(effDate)) {
      if (w.status === "PAID") {
        paidWithdrawalsAmount += amt;
        paidWithdrawalsCount += 1;

        const bucket = bucketMap.get(getBucketKey(effDate));
        if (bucket) {
          bucket.withdrawals += amt;
          bucket.withdrawalsCount += 1;
        }

        const hr = getHourEat(effDate);
        hourlyActivity[hr].withdrawalsAmount += amt;

        const prov = w.provider || "Other";
        const prevProv = withdrawalProvidersMap.get(prov) || { amount: 0, count: 0 };
        prevProv.amount += amt;
        prevProv.count += 1;
        withdrawalProvidersMap.set(prov, prevProv);
      } else if (w.status === "REJECTED") {
        rejectedWithdrawalsAmount += amt;
        rejectedWithdrawalsCount += 1;
      }
    } else if (w.status === "PAID" && inPrev(effDate)) {
      prevWithdrawalsAmount += amt;
    }
  }

  // Aggregations: Rounds & Room Performance
  let houseProfit = 0;
  let prevHouseProfit = 0;
  let totalPotVolume = 0;
  let totalPrizesPaid = 0;
  let roundsFinished = 0;
  let prevRoundsFinished = 0;
  let roundsCancelled = 0;
  let totalBallsCalledOnFinish = 0;

  const roomPerfMap = new Map<
    string,
    { roundsCount: number; ticketsCount: number; totalPot: number; houseProfit: number; prizePool: number }
  >();
  for (const r of rooms) {
    roomPerfMap.set(r.id, { roundsCount: 0, ticketsCount: 0, totalPot: 0, houseProfit: 0, prizePool: 0 });
  }

  for (const r of rounds) {
    const effDate = r.endedAt ?? r.createdAt;
    if (inCurrent(effDate)) {
      if (r.status === "FINISHED") {
        const pot = Number(r.totalPot);
        const cut = Number(r.houseCutAmount);
        const prize = Number(r.prizePool);
        const tCount = r._count.tickets;

        roundsFinished += 1;
        totalPotVolume += pot;
        houseProfit += cut;
        totalPrizesPaid += prize;
        totalBallsCalledOnFinish += r.calledNumbers?.length || 0;

        const bucket = bucketMap.get(getBucketKey(effDate));
        if (bucket) {
          bucket.houseProfit += cut;
          bucket.totalPot += pot;
          bucket.roundsCount += 1;
        }

        const hr = getHourEat(effDate);
        hourlyActivity[hr].rounds += 1;

        const rp = roomPerfMap.get(r.roomId);
        if (rp) {
          rp.roundsCount += 1;
          rp.ticketsCount += tCount;
          rp.totalPot += pot;
          rp.houseProfit += cut;
          rp.prizePool += prize;
        }
      } else if (r.status === "CANCELLED_REFUNDED") {
        roundsCancelled += 1;
      }
    } else if (r.status === "FINISHED" && inPrev(effDate)) {
      prevHouseProfit += Number(r.houseCutAmount);
      prevRoundsFinished += 1;
    }
  }

  // Aggregations: Tickets
  let burnedFalseClaims = 0;
  const activePlayerIds = new Set<string>();
  const winnersMap = new Map<string, { amount: number; count: number }>();
  const activeMap = new Map<string, { amount: number; count: number }>();

  for (const t of tickets) {
    activePlayerIds.add(t.userId);
    if (t.status === "BURNED_FALSE_CLAIM") {
      burnedFalseClaims += 1;
    }

    const bucket = bucketMap.get(getBucketKey(t.purchasedAt));
    if (bucket) {
      bucket.ticketsCount += 1;
    }

    const hr = getHourEat(t.purchasedAt);
    hourlyActivity[hr].tickets += 1;

    const paid = Number(t.pricePaid);
    const activeEntry = activeMap.get(t.userId) || { amount: 0, count: 0 };
    activeEntry.amount += paid;
    activeEntry.count += 1;
    activeMap.set(t.userId, activeEntry);

    const won = Number(t.prizeWon);
    if (t.status === "WINNER" || won > 0) {
      const winEntry = winnersMap.get(t.userId) || { amount: 0, count: 0 };
      winEntry.amount += won;
      winEntry.count += 1;
      winnersMap.set(t.userId, winEntry);
    }
  }

  // Aggregations: Users
  let newUsers = 0;
  let prevNewUsers = 0;
  let referralsInPeriod = 0;
  for (const u of recentUsers) {
    if (inCurrent(u.createdAt)) {
      newUsers += 1;
      if (u.referredById) referralsInPeriod += 1;
      const bucket = bucketMap.get(getBucketKey(u.createdAt));
      if (bucket) {
        bucket.newUsers += 1;
      }
    } else if (inPrev(u.createdAt)) {
      prevNewUsers += 1;
    }
  }

  // Compute bucket net cashflow & round numbers
  for (const b of orderedBuckets) {
    b.deposits = roundMoney(b.deposits);
    b.withdrawals = roundMoney(b.withdrawals);
    b.netCashflow = roundMoney(b.deposits - b.withdrawals);
    b.houseProfit = roundMoney(b.houseProfit);
    b.totalPot = roundMoney(b.totalPot);
  }
  for (const h of hourlyActivity) {
    h.depositsAmount = roundMoney(h.depositsAmount);
    h.withdrawalsAmount = roundMoney(h.withdrawalsAmount);
  }

  let peakHour = { hour: 0, label: "00:00", tickets: 0 };
  for (const h of hourlyActivity) {
    if (h.tickets > peakHour.tickets) {
      peakHour = { hour: h.hour, label: h.label, tickets: h.tickets };
    }
  }

  // Provider breakdown formatting
  const formatProviders = (map: Map<string, { amount: number; count: number }>, totalAmt: number): ProviderBreakdownRow[] =>
    Array.from(map.entries())
      .map(([provider, v]) => ({
        provider,
        amount: roundMoney(v.amount),
        count: v.count,
        sharePct: totalAmt > 0 ? Math.round((v.amount / totalAmt) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

  // Room performance formatting
  const roomPerformance: RoomPerformanceRow[] = rooms
    .map((r) => {
      const perf = roomPerfMap.get(r.id)!;
      return {
        roomId: r.id,
        nameAm: r.nameAm,
        nameEn: r.nameEn,
        stakeAmount: Number(r.stakeAmount),
        houseCutPercent: Number(r.houseCutPercent),
        isActive: r.isActive,
        roundsCount: perf.roundsCount,
        ticketsCount: perf.ticketsCount,
        avgTicketsPerRound: perf.roundsCount > 0 ? Math.round((perf.ticketsCount / perf.roundsCount) * 10) / 10 : 0,
        totalPot: roundMoney(perf.totalPot),
        houseProfit: roundMoney(perf.houseProfit),
        prizePool: roundMoney(perf.prizePool),
        sharePct: houseProfit > 0 ? Math.round((perf.houseProfit / houseProfit) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.houseProfit - a.houseProfit || b.ticketsCount - a.ticketsCount);

  // Ledger breakdown & bonuses
  let welcomeBonusTotal = 0;
  let welcomeBonusCount = 0;
  let referralBonusTotal = 0;
  let referralBonusCount = 0;
  const ledgerBreakdown: LedgerBreakdownRow[] = txGroup
    .map((g) => {
      const amount = roundMoney(Number(g._sum.amount ?? 0));
      const count = g._count._all;
      if (g.type === "WELCOME_BONUS") {
        welcomeBonusTotal = amount;
        welcomeBonusCount = count;
      } else if (g.type === "REFERRAL_BONUS") {
        referralBonusTotal = amount;
        referralBonusCount = count;
      }
      return { type: g.type, count, amount };
    })
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  // Languages
  let langAm = 0;
  let langEn = 0;
  let langUnset = 0;
  for (const row of usersByLang) {
    if (row.language === "AM") langAm += row._count._all;
    else if (row.language === "EN") langEn += row._count._all;
    else langUnset += row._count._all;
  }

  // Leaderboards (top 8 each, single batch user query)
  const topDepositorIds = Array.from(depositorsMap.entries())
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 8);
  const topWinnerIds = Array.from(winnersMap.entries())
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 8);
  const mostActiveIds = Array.from(activeMap.entries())
    .sort((a, b) => b[1].count - a[1].count || b[1].amount - a[1].amount)
    .slice(0, 8);
  const topReferrersSorted = topReferrersRaw
    .filter((r): r is typeof r & { referredById: string } => Boolean(r.referredById))
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 8);

  const neededUserIds = Array.from(
    new Set([
      ...topDepositorIds.map(([id]) => id),
      ...topWinnerIds.map(([id]) => id),
      ...mostActiveIds.map(([id]) => id),
      ...topReferrersSorted.map((r) => r.referredById),
    ])
  );

  const userDetails =
    neededUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: neededUserIds } },
          select: { id: true, firstName: true, lastName: true, username: true, phoneNumber: true },
        })
      : [];

  const userMap = new Map(userDetails.map((u) => [u.id, u]));
  const buildEntry = (userId: string, amount: number, count: number): LeaderboardEntry => {
    const u = userMap.get(userId);
    const name = u ? `${u.firstName}${u.lastName ? ` ${u.lastName}` : ""}` : "Unknown User";
    return {
      userId,
      name,
      username: u?.username ?? null,
      phoneNumber: u?.phoneNumber ?? null,
      amount: roundMoney(amount),
      count,
    };
  };

  const allowCompare = range !== "all";
  const pendingDepositsAmount = roundMoney(Number(pendingDepositsAll._sum.amount ?? 0));
  const pendingDepositsCount = pendingDepositsAll._count._all;
  const pendingWithdrawalsAmount = roundMoney(Number(pendingWithdrawalsAll._sum.amount ?? 0));
  const pendingWithdrawalsCount = pendingWithdrawalsAll._count._all;

  const depositDecisions = approvedDepositsCount + rejectedDepositsCount;
  const withdrawalDecisions = paidWithdrawalsCount + rejectedWithdrawalsCount;

  return {
    range,
    granularity,
    generatedAt: now.toISOString(),
    summary: {
      approvedDepositsAmount: roundMoney(approvedDepositsAmount),
      approvedDepositsCount,
      avgDepositAmount: approvedDepositsCount > 0 ? roundMoney(approvedDepositsAmount / approvedDepositsCount) : 0,
      pendingDepositsAmount,
      pendingDepositsCount,
      rejectedDepositsAmount: roundMoney(rejectedDepositsAmount),
      rejectedDepositsCount,
      depositApprovalRate:
        depositDecisions > 0 ? Math.round((approvedDepositsCount / depositDecisions) * 1000) / 10 : 100,
      depositsChangePct: calcPctChange(approvedDepositsAmount, prevDepositsAmount, allowCompare),

      paidWithdrawalsAmount: roundMoney(paidWithdrawalsAmount),
      paidWithdrawalsCount,
      avgWithdrawalAmount: paidWithdrawalsCount > 0 ? roundMoney(paidWithdrawalsAmount / paidWithdrawalsCount) : 0,
      pendingWithdrawalsAmount,
      pendingWithdrawalsCount,
      rejectedWithdrawalsAmount: roundMoney(rejectedWithdrawalsAmount),
      rejectedWithdrawalsCount,
      withdrawalApprovalRate:
        withdrawalDecisions > 0 ? Math.round((paidWithdrawalsCount / withdrawalDecisions) * 1000) / 10 : 100,
      withdrawalsChangePct: calcPctChange(paidWithdrawalsAmount, prevWithdrawalsAmount, allowCompare),

      netCashflow: roundMoney(approvedDepositsAmount - paidWithdrawalsAmount),
      houseProfit: roundMoney(houseProfit),
      houseProfitChangePct: calcPctChange(houseProfit, prevHouseProfit, allowCompare),
      totalPotVolume: roundMoney(totalPotVolume),
      totalPrizesPaid: roundMoney(totalPrizesPaid),
      effectiveHouseMargin:
        totalPotVolume > 0 ? Math.round((houseProfit / totalPotVolume) * 1000) / 10 : 0,
      totalWalletLiability: roundMoney(Number(walletAgg._sum.balance ?? 0)),
      totalLockedLiability: roundMoney(Number(walletAgg._sum.lockedBalance ?? 0)),

      roundsFinished,
      roundsCancelled,
      roundsChangePct: calcPctChange(roundsFinished, prevRoundsFinished, allowCompare),
      totalTicketsSold: tickets.length,
      avgTicketsPerRound:
        roundsFinished > 0 ? Math.round((tickets.length / roundsFinished) * 10) / 10 : 0,
      avgPotPerRound: roundsFinished > 0 ? roundMoney(totalPotVolume / roundsFinished) : 0,
      avgBallsPerWin:
        roundsFinished > 0 ? Math.round((totalBallsCalledOnFinish / roundsFinished) * 10) / 10 : 0,
      burnedFalseClaims,

      welcomeBonusTotal: roundMoney(welcomeBonusTotal),
      welcomeBonusCount,
      referralBonusTotal: roundMoney(referralBonusTotal),
      referralBonusCount,
      adminCreditTotal: roundMoney(Number(adminCreditsAgg._sum.amount ?? 0)),
      adminDebitTotal: roundMoney(Math.abs(Number(adminDebitsAgg._sum.amount ?? 0))),
      p2pTransfersVolume: roundMoney(Number(transfersAgg._sum.amount ?? 0)),
      p2pTransfersCount: transfersAgg._count._all,
    },
    series: orderedBuckets,
    hourlyActivity,
    peakHour,
    depositProviders: formatProviders(depositProvidersMap, approvedDepositsAmount),
    withdrawalProviders: formatProviders(withdrawalProvidersMap, paidWithdrawalsAmount),
    roomPerformance,
    ledgerBreakdown,
    userStats: {
      totalUsers,
      verifiedUsers,
      bannedUsers,
      verificationRate: totalUsers > 0 ? Math.round((verifiedUsers / totalUsers) * 1000) / 10 : 0,
      newUsers,
      newUsersChangePct: calcPctChange(newUsers, prevNewUsers, allowCompare),
      activePlayers: activePlayerIds.size,
      depositingPlayers: depositorsMap.size,
      referralsInPeriod,
      langAm,
      langEn,
      langUnset,
    },
    leaderboards: {
      topDepositors: topDepositorIds.map(([id, v]) => buildEntry(id, v.amount, v.count)),
      topWinners: topWinnerIds.map(([id, v]) => buildEntry(id, v.amount, v.count)),
      mostActive: mostActiveIds.map(([id, v]) => buildEntry(id, v.amount, v.count)),
      topReferrers: topReferrersSorted.map((r) => buildEntry(r.referredById, 0, r._count._all)),
    },
  };
}
