import React, { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Award,
  Clock,
  Download,
  Flame,
  Gamepad2,
  Gift,
  Layers,
  Repeat,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { adminFetch, formatMoney } from "../api";
import {
  GroupedBarChart,
  HourlyActivityChart,
  InteractiveDonutChart,
  MultiAreaTrendChart,
  type MultiSeriesConfig,
} from "../components/AnalyticsCharts";
import type { AdminAnalyticsData, AnalyticsRange, AnalyticsSeriesPoint } from "../types";

interface AnalyticsViewProps {
  refreshSignal: number;
}

const RANGE_OPTIONS: Array<{ id: AnalyticsRange; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "all", label: "All Time" },
];

const PROVIDER_COLORS = [
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#f97316",
];

const ROOM_COLORS = [
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
];

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-[#1a233b] text-slate-500 dark:text-gray-400">
        All-time
      </span>
    );
  }
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black ${
        positive
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
      }`}
    >
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? "+" : ""}
      {value}%
    </span>
  );
}

function formatTxLabel(type: string): string {
  return type
    .split("_")
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(" ");
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ refreshSignal }) => {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [trendMode, setTrendMode] = useState<"cashflow" | "revenue" | "activity">("cashflow");
  const [hourlyMetric, setHourlyMetric] = useState<"tickets" | "deposits" | "rounds">("tickets");
  const [providerSide, setProviderSide] = useState<"deposits" | "withdrawals">("deposits");
  const [leaderboardTab, setLeaderboardTab] = useState<
    "depositors" | "winners" | "active" | "referrers"
  >("depositors");

  const loadAnalytics = async (selectedRange: AnalyticsRange) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminFetch(`/api/admin/analytics?range=${selectedRange}`);
      if (res.ok && res.analytics) {
        setData(res.analytics);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics(range);
  }, [range, refreshSignal]);

  const handleExportCsv = () => {
    if (!data || data.series.length === 0) return;
    const headers = [
      "Period",
      "Key",
      "Approved Deposits (ETB)",
      "Deposits Count",
      "Paid Withdrawals (ETB)",
      "Withdrawals Count",
      "Net Cashflow (ETB)",
      "Total Pot (ETB)",
      "House Profit (ETB)",
      "Finished Rounds",
      "Tickets Sold",
      "New Users",
    ];
    const rows = data.series.map((row) => [
      `"${row.label}"`,
      row.key,
      row.deposits,
      row.depositsCount,
      row.withdrawals,
      row.withdrawalsCount,
      row.netCashflow,
      row.totalPot,
      row.houseProfit,
      row.roundsCount,
      row.ticketsCount,
      row.newUsers,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zemen-bingo-analytics-${data.range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && !data) {
    return (
      <div className="p-4 sm:p-8 flex flex-col gap-5 animate-pulse">
        <div className="h-12 bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl"
            />
          ))}
        </div>
        <div className="h-80 bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl" />
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="p-8">
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 text-center">
          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{errorMsg}</p>
          <button
            onClick={() => loadAnalytics(range)}
            className="mt-3 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, series, hourlyActivity, peakHour, userStats, roomPerformance, ledgerBreakdown, leaderboards } = data;

  const trendSeriesMap: Record<
    "cashflow" | "revenue" | "activity",
    Array<MultiSeriesConfig<AnalyticsSeriesPoint & Record<string, unknown>>>
  > = {
    cashflow: [
      { key: "deposits", label: "Deposits", color: "#10b981", format: (v) => `${formatMoney(v)} ETB` },
      { key: "withdrawals", label: "Withdrawals", color: "#f59e0b", format: (v) => `${formatMoney(v)} ETB` },
      { key: "netCashflow", label: "Net Cashflow", color: "#3b82f6", format: (v) => `${formatMoney(v)} ETB` },
    ],
    revenue: [
      { key: "totalPot", label: "Total Pot Volume", color: "#06b6d4", format: (v) => `${formatMoney(v)} ETB` },
      { key: "houseProfit", label: "House Profit", color: "#8b5cf6", format: (v) => `${formatMoney(v)} ETB` },
    ],
    activity: [
      { key: "ticketsCount", label: "Tickets Sold", color: "#06b6d4", format: (v) => `${v} cards` },
      { key: "roundsCount", label: "Finished Rounds", color: "#8b5cf6", format: (v) => `${v} rounds` },
      { key: "newUsers", label: "New Signups", color: "#10b981", format: (v) => `${v} users` },
    ],
  };

  const activeProviders =
    providerSide === "deposits" ? data.depositProviders : data.withdrawalProviders;
  const activeProvidersTotal =
    providerSide === "deposits" ? summary.approvedDepositsAmount : summary.paidWithdrawalsAmount;

  const activeLeaderboard =
    leaderboardTab === "depositors"
      ? leaderboards.topDepositors
      : leaderboardTab === "winners"
      ? leaderboards.topWinners
      : leaderboardTab === "active"
      ? leaderboards.mostActive
      : leaderboards.topReferrers;

  const maxLeaderboardScore = Math.max(
    1,
    ...activeLeaderboard.map((item) =>
      leaderboardTab === "referrers" ? item.count : item.amount
    )
  );

  const totalDepDecisions = summary.approvedDepositsCount + summary.rejectedDepositsCount;
  const totalWdDecisions = summary.paidWithdrawalsCount + summary.rejectedWithdrawalsCount;
  const totalLangUsers = Math.max(1, userStats.langAm + userStats.langEn + userStats.langUnset);

  return (
    <div className="p-4 sm:p-8 flex flex-col gap-6 animate-fadeIn">
      {/* 1. Top Control Bar */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGE_OPTIONS.map((opt) => {
            const active = range === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setRange(opt.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition ${
                  active
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                    : "bg-slate-100 dark:bg-[#131b2e] text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-[#1a2540]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
          <span className="ml-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-[#131b2e] text-slate-500 dark:text-gray-400">
            By {data.granularity}
          </span>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3">
          <span className="text-[11px] text-slate-500 dark:text-gray-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {isLoading ? "Updating..." : `Updated ${new Date(data.generatedAt).toLocaleTimeString()}`}
          </span>
          <button
            onClick={handleExportCsv}
            disabled={series.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#131b2e] hover:bg-slate-200 dark:hover:bg-[#1a2540] border border-slate-200 dark:border-[#1e2945] text-xs font-bold text-slate-700 dark:text-gray-200 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Primary Financial KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Approved Deposits */}
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-gray-400">Approved Deposits</span>
            </div>
            <DeltaBadge value={summary.depositsChangePct} />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {formatMoney(summary.approvedDepositsAmount)} <span className="text-xs font-bold text-slate-400">ETB</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#161f35] flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
            <span>{summary.approvedDepositsCount} txns • Avg {formatMoney(summary.avgDepositAmount)}</span>
            <span className="text-amber-600 dark:text-amber-400 font-bold">{summary.pendingDepositsCount} pending</span>
          </div>
        </div>

        {/* Paid Withdrawals */}
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-gray-400">Paid Withdrawals</span>
            </div>
            <DeltaBadge value={summary.withdrawalsChangePct} />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {formatMoney(summary.paidWithdrawalsAmount)} <span className="text-xs font-bold text-slate-400">ETB</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#161f35] flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
            <span>{summary.paidWithdrawalsCount} payouts • Avg {formatMoney(summary.avgWithdrawalAmount)}</span>
            <span className="text-amber-600 dark:text-amber-400 font-bold">{summary.pendingWithdrawalsCount} pending</span>
          </div>
        </div>

        {/* Net Cashflow */}
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-gray-400">Net Cashflow (Dep − Wd)</span>
            </div>
          </div>
          <div
            className={`text-2xl font-black ${
              summary.netCashflow >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {summary.netCashflow >= 0 ? "+" : ""}
            {formatMoney(summary.netCashflow)} <span className="text-xs font-bold opacity-75">ETB</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#161f35] flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
            <span>Liability: <b className="text-slate-700 dark:text-gray-200">{formatMoney(summary.totalWalletLiability)}</b></span>
            <span>Locked: <b className="text-amber-600 dark:text-amber-400">{formatMoney(summary.totalLockedLiability)}</b></span>
          </div>
        </div>

        {/* House Profit */}
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-gray-400">House Profit</span>
            </div>
            <DeltaBadge value={summary.houseProfitChangePct} />
          </div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
            {formatMoney(summary.houseProfit)} <span className="text-xs font-bold opacity-75">ETB</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#161f35] flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
            <span>Total Pot: <b className="text-slate-700 dark:text-gray-200">{formatMoney(summary.totalPotVolume)}</b></span>
            <span>Margin: <b className="text-purple-600 dark:text-purple-300">{summary.effectiveHouseMargin}%</b></span>
          </div>
        </div>
      </div>

      {/* 3. Secondary Operational Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-4 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-gray-400">Games & Tickets</span>
              <DeltaBadge value={summary.roundsChangePct} />
            </div>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
              {summary.roundsFinished} Rounds • {summary.totalTicketsSold} Cards
            </div>
            <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
              Avg {summary.avgTicketsPerRound} cards/rd • {summary.avgBallsPerWin} balls/win
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-4 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-gray-400">Player Engagement</span>
              <DeltaBadge value={userStats.newUsersChangePct} />
            </div>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
              +{userStats.newUsers} New • {userStats.activePlayers} Active
            </div>
            <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
              {userStats.depositingPlayers} depositors • {userStats.verificationRate}% verified
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-4 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Gift className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-slate-500 dark:text-gray-400">Bonuses & Referrals</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
              {formatMoney(summary.welcomeBonusTotal + summary.referralBonusTotal)} ETB
            </div>
            <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
              Welcome: {formatMoney(summary.welcomeBonusTotal)} ({summary.welcomeBonusCount}) • Ref: {formatMoney(summary.referralBonusTotal)} ({userStats.referralsInPeriod})
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-4 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Repeat className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-slate-500 dark:text-gray-400">Transfers & Adjustments</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
              {formatMoney(summary.p2pTransfersVolume)} ETB P2P
            </div>
            <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
              {summary.p2pTransfersCount} transfers • Admin: +{formatMoney(summary.adminCreditTotal)} / −{formatMoney(summary.adminDebitTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Hero Interactive Trend Chart */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Performance Timeline
            </h3>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              Hover over any point on the chart to inspect exact figures for that {data.granularity}.
            </p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#131b2e] p-1 rounded-xl self-start">
            {(
              [
                { id: "cashflow", label: "Cashflow" },
                { id: "revenue", label: "Revenue & Pot" },
                { id: "activity", label: "Games & Users" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTrendMode(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  trendMode === tab.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mb-3">
          {trendSeriesMap[trendMode].map((s) => (
            <div key={String(s.key)} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-gray-300">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <MultiAreaTrendChart
          data={series as unknown as Array<AnalyticsSeriesPoint & Record<string, unknown>>}
          xKey="label"
          series={trendSeriesMap[trendMode]}
        />
      </div>

      {/* 5. Deposits vs Withdrawals & 24-Hour Peak Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Deposits vs Withdrawals
              </h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Side-by-side cash inflow vs payout volume
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold text-slate-600 dark:text-gray-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Deposits
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Payouts
              </span>
            </div>
          </div>

          <GroupedBarChart
            data={series.map((s) => ({
              label: s.label,
              primary: s.deposits,
              secondary: s.withdrawals,
              primaryCount: s.depositsCount,
              secondaryCount: s.withdrawalsCount,
            }))}
            primaryLabel="Deposits"
            secondaryLabel="Withdrawals"
          />
        </div>

        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  24-Hour Peak Activity (EAT)
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <Flame className="w-3 h-3" /> Peak: {peakHour.label} ({peakHour.tickets})
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Busiest hours of the day in Ethiopia Time (UTC+3)
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#131b2e] p-1 rounded-xl">
              {(
                [
                  { id: "tickets", label: "Tickets" },
                  { id: "deposits", label: "Deposits" },
                  { id: "rounds", label: "Rounds" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setHourlyMetric(m.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                    hourlyMetric === m.id
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 dark:text-gray-300"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <HourlyActivityChart data={hourlyActivity} metric={hourlyMetric} />
        </div>
      </div>

      {/* 6. Payment Providers & Room Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Providers */}
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Payment Providers Breakdown
              </h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Volume & share by bank / mobile money channel
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#131b2e] p-1 rounded-xl">
              <button
                onClick={() => setProviderSide("deposits")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  providerSide === "deposits"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 dark:text-gray-300"
                }`}
              >
                Deposits
              </button>
              <button
                onClick={() => setProviderSide("withdrawals")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  providerSide === "withdrawals"
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 dark:text-gray-300"
                }`}
              >
                Withdrawals
              </button>
            </div>
          </div>

          <InteractiveDonutChart
            slices={activeProviders.map((p, i) => ({
              label: p.provider,
              value: p.amount,
              sublabel: `${p.count} txns`,
              color: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
            }))}
            centerTitle={providerSide === "deposits" ? "Deposits" : "Payouts"}
            centerValue={`${formatMoney(activeProvidersTotal)} ETB`}
          />
        </div>

        {/* Bingo Rooms Performance */}
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col gap-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Bingo Rooms Performance</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Profit contribution & round volume per stake room
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500 dark:text-gray-400">
              {roomPerformance.length} rooms
            </span>
          </div>

          <InteractiveDonutChart
            slices={roomPerformance.map((r, i) => ({
              label: r.nameAm,
              value: r.houseProfit,
              sublabel: `${r.roundsCount} rds • ${r.ticketsCount} cards`,
              color: ROOM_COLORS[i % ROOM_COLORS.length],
            }))}
            centerTitle="House Profit"
            centerValue={`${formatMoney(summary.houseProfit)} ETB`}
          />

          <div className="overflow-x-auto border-t border-slate-100 dark:border-[#1a233b] pt-3">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-gray-500 border-b border-slate-100 dark:border-[#1a233b]">
                  <th className="py-2 pr-3">Room</th>
                  <th className="py-2 px-2 text-right">Rounds</th>
                  <th className="py-2 px-2 text-right">Cards</th>
                  <th className="py-2 px-2 text-right">Avg/Rd</th>
                  <th className="py-2 px-2 text-right">Pot</th>
                  <th className="py-2 pl-2 text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#161e34]">
                {roomPerformance.map((r) => (
                  <tr key={r.roomId}>
                    <td className="py-2 pr-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {r.nameAm}{" "}
                      <span className="text-[10px] font-normal text-slate-400">
                        ({r.stakeAmount} ETB)
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-700 dark:text-gray-300">
                      {r.roundsCount}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-700 dark:text-gray-300">
                      {r.ticketsCount}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-500 dark:text-gray-400">
                      {r.avgTicketsPerRound}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-700 dark:text-gray-300">
                      {formatMoney(r.totalPot)}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums font-black text-purple-600 dark:text-purple-400">
                      {formatMoney(r.houseProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 7. Approval Health, Player Funnel & Ledger Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Approval & Fulfillment Health */}
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Approval & Game Integrity
            </h3>
          </div>

          {/* Deposits Status */}
          <div className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1a233b] rounded-xl p-3.5">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-slate-700 dark:text-gray-200">Deposit Approval Rate</span>
              <span className="font-black text-emerald-600 dark:text-emerald-400">
                {summary.depositApprovalRate}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-[#1a233b] overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full"
                style={{
                  width: `${
                    totalDepDecisions > 0
                      ? (summary.approvedDepositsCount / totalDepDecisions) * 100
                      : 100
                  }%`,
                }}
              />
              <div
                className="bg-rose-500 h-full"
                style={{
                  width: `${
                    totalDepDecisions > 0
                      ? (summary.rejectedDepositsCount / totalDepDecisions) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500 dark:text-gray-400">
              <span>Approved: <b className="text-emerald-600 dark:text-emerald-400">{summary.approvedDepositsCount}</b></span>
              <span>Rejected: <b className="text-rose-600 dark:text-rose-400">{summary.rejectedDepositsCount}</b></span>
              <span>Pending: <b className="text-amber-600 dark:text-amber-400">{formatMoney(summary.pendingDepositsAmount)} ETB</b></span>
            </div>
          </div>

          {/* Withdrawals Status */}
          <div className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1a233b] rounded-xl p-3.5">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-slate-700 dark:text-gray-200">Withdrawal Payout Rate</span>
              <span className="font-black text-blue-600 dark:text-cyan-400">
                {summary.withdrawalApprovalRate}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-[#1a233b] overflow-hidden flex">
              <div
                className="bg-blue-500 h-full"
                style={{
                  width: `${
                    totalWdDecisions > 0
                      ? (summary.paidWithdrawalsCount / totalWdDecisions) * 100
                      : 100
                  }%`,
                }}
              />
              <div
                className="bg-rose-500 h-full"
                style={{
                  width: `${
                    totalWdDecisions > 0
                      ? (summary.rejectedWithdrawalsCount / totalWdDecisions) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500 dark:text-gray-400">
              <span>Paid: <b className="text-blue-600 dark:text-cyan-400">{summary.paidWithdrawalsCount}</b></span>
              <span>Rejected: <b className="text-rose-600 dark:text-rose-400">{summary.rejectedWithdrawalsCount}</b></span>
              <span>Pending: <b className="text-amber-600 dark:text-amber-400">{formatMoney(summary.pendingWithdrawalsAmount)} ETB</b></span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1a233b] rounded-xl p-3">
              <span className="text-[10px] text-slate-500 dark:text-gray-400 block">Cancelled Rounds</span>
              <b className="text-base font-black text-slate-900 dark:text-white">{summary.roundsCancelled}</b>
            </div>
            <div className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1a233b] rounded-xl p-3">
              <span className="text-[10px] text-slate-500 dark:text-gray-400 block">False Claim Burns</span>
              <b className="text-base font-black text-rose-600 dark:text-rose-400">{summary.burnedFalseClaims}</b>
            </div>
          </div>
        </div>

        {/* Player Funnel & Language Split */}
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Player Funnel & Languages
            </h3>
          </div>

          <div className="flex flex-col gap-3">
            {[
              { label: "Total Registered", value: userStats.totalUsers, color: "bg-blue-500" },
              { label: "Verified Phone", value: userStats.verifiedUsers, color: "bg-cyan-500" },
              { label: "Active Players (Period)", value: userStats.activePlayers, color: "bg-purple-500" },
              { label: "Depositing Players (Period)", value: userStats.depositingPlayers, color: "bg-emerald-500" },
            ].map((step) => {
              const pct =
                userStats.totalUsers > 0
                  ? Math.round((step.value / userStats.totalUsers) * 1000) / 10
                  : 0;
              return (
                <div key={step.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700 dark:text-gray-300">{step.label}</span>
                    <span className="font-black text-slate-900 dark:text-white tabular-nums">
                      {step.value.toLocaleString()}{" "}
                      <span className="text-[10px] font-bold text-slate-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-[#1a233b] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${step.color}`}
                      style={{ width: `${Math.min(100, Math.max(step.value > 0 ? 4 : 0, pct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-auto pt-3 border-t border-slate-100 dark:border-[#1a233b]">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-slate-700 dark:text-gray-200">Language Distribution</span>
              <span className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                {userStats.bannedUsers} Banned
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-200 dark:bg-[#1a233b] overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full"
                style={{ width: `${(userStats.langAm / totalLangUsers) * 100}%` }}
              />
              <div
                className="bg-blue-500 h-full"
                style={{ width: `${(userStats.langEn / totalLangUsers) * 100}%` }}
              />
              <div
                className="bg-slate-400 h-full"
                style={{ width: `${(userStats.langUnset / totalLangUsers) * 100}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-slate-500 dark:text-gray-400">
              <span>🇪🇹 Amharic: <b className="text-slate-900 dark:text-white">{userStats.langAm}</b></span>
              <span>🇬🇧 English: <b className="text-slate-900 dark:text-white">{userStats.langEn}</b></span>
              <span>Unset: <b className="text-slate-900 dark:text-white">{userStats.langUnset}</b></span>
            </div>
          </div>
        </div>

        {/* Wallet Ledger Breakdown */}
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Wallet Ledger Breakdown
              </h3>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              {ledgerBreakdown.reduce((s, r) => s + r.count, 0)} entries
            </span>
          </div>

          {ledgerBreakdown.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 dark:text-gray-500">
              No wallet transactions in this period.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[290px] overflow-y-auto pr-1">
              {ledgerBreakdown.map((row) => (
                <div
                  key={row.type}
                  className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1a233b] rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-800 dark:text-gray-200 block truncate">
                      {formatTxLabel(row.type)}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-gray-400">
                      {row.count.toLocaleString()} transactions
                    </span>
                  </div>
                  <span
                    className={`text-xs font-black tabular-nums shrink-0 ${
                      row.amount >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {row.amount >= 0 ? "+" : ""}
                    {formatMoney(row.amount)} ETB
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 8. Top Players Leaderboards */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Top Players Leaderboard
              </h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Leading players in the selected time period
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-[#131b2e] p-1 rounded-xl self-start">
            {(
              [
                { id: "depositors", label: "Top Depositors" },
                { id: "winners", label: "Top Winners" },
                { id: "active", label: "Most Active" },
                { id: "referrers", label: "Top Referrers" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setLeaderboardTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  leaderboardTab === t.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {activeLeaderboard.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 dark:text-gray-500">
            No player records for this leaderboard in the selected range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-gray-500 border-b border-slate-100 dark:border-[#1a233b]">
                  <th className="py-2.5 pr-3 w-12">Rank</th>
                  <th className="py-2.5 px-3">Player</th>
                  <th className="py-2.5 px-3">Contact</th>
                  <th className="py-2.5 px-3 text-right">
                    {leaderboardTab === "depositors"
                      ? "Deposits"
                      : leaderboardTab === "winners"
                      ? "Wins"
                      : leaderboardTab === "active"
                      ? "Cartelas"
                      : "Invited"}
                  </th>
                  <th className="py-2.5 pl-3 text-right w-48">
                    {leaderboardTab === "referrers" ? "Share" : "Volume (ETB)"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#161e34]">
                {activeLeaderboard.map((entry, idx) => {
                  const score = leaderboardTab === "referrers" ? entry.count : entry.amount;
                  const barPct = Math.round((score / maxLeaderboardScore) * 100);
                  const rankBadge =
                    idx === 0
                      ? "bg-amber-400 text-slate-950"
                      : idx === 1
                      ? "bg-slate-300 text-slate-900"
                      : idx === 2
                      ? "bg-amber-700 text-white"
                      : "bg-slate-100 dark:bg-[#1a233b] text-slate-600 dark:text-gray-300";

                  return (
                    <tr key={entry.userId}>
                      <td className="py-3 pr-3">
                        <span
                          className={`w-6 h-6 rounded-lg inline-flex items-center justify-center text-[11px] font-black ${rankBadge}`}
                        >
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                        {entry.name}
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-gray-400">
                        {entry.phoneNumber || (entry.username ? `@${entry.username}` : "—")}
                      </td>
                      <td className="py-3 px-3 text-right font-bold tabular-nums text-slate-700 dark:text-gray-300">
                        {entry.count.toLocaleString()}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-black tabular-nums text-slate-900 dark:text-white">
                            {leaderboardTab === "referrers"
                              ? `${entry.count} users`
                              : `${formatMoney(entry.amount)} ETB`}
                          </span>
                          <div className="w-28 h-1.5 rounded-full bg-slate-100 dark:bg-[#1a233b] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${Math.max(4, barPct)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
