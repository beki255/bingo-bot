import React, { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Users,
  AlertTriangle,
  Wallet,
  Trophy,
  Gamepad2,
  ShieldAlert,
} from "lucide-react";
import { adminFetch, formatMoney } from "../api";
import type { AdminTab, DashboardMetrics } from "../types";

interface DashboardViewProps {
  onNavigate: (tab: AdminTab) => void;
  refreshSignal: number;
}

interface QuickDeposit {
  id: string;
  amount: number;
  status: string;
  provider: string;
  userName: string;
  userPhone: string | null;
}

interface QuickWithdrawal {
  id: string;
  amount: number;
  status: string;
  provider: string;
  accountName: string;
  userName: string;
}

interface ActiveRoomSummary {
  id: string;
  nameAm: string;
  nameEn: string;
  stakeAmount: number;
  isActive: boolean;
  currentRoundStatus: string;
  currentTickets: number;
  currentPot: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, refreshSignal }) => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentDeposits, setRecentDeposits] = useState<QuickDeposit[]>([]);
  const [recentWithdrawals, setRecentWithdrawals] = useState<QuickWithdrawal[]>([]);
  const [activeRooms, setActiveRooms] = useState<ActiveRoomSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    try {
      const res = await adminFetch("/api/admin/dashboard");
      if (res.ok) {
        setMetrics(res.metrics);
        setRecentDeposits(res.recentDeposits || []);
        setRecentWithdrawals(res.recentWithdrawals || []);
        setActiveRooms(res.activeRooms || []);
      }
    } catch {
      // handled globally
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 15000);
    return () => clearInterval(timer);
  }, [refreshSignal]);

  if (isLoading && !metrics) {
    return <div className="p-8 text-xs text-gray-500">Loading real-time dashboard...</div>;
  }

  return (
    <div className="p-4 sm:p-8 flex flex-col gap-6 animate-fadeIn">
      {/* Pending Queue Banner */}
      {metrics && (metrics.pendingDeposits > 0 || metrics.pendingWithdrawals > 0) && (
        <div className="bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-transparent border border-amber-500/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Action Required: Pending Financial Requests
              </h3>
              <p className="text-xs text-slate-600 dark:text-gray-300 mt-0.5">
                You have{" "}
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  {metrics.pendingDeposits} Pending Deposits
                </span>{" "}
                and{" "}
                <span className="text-amber-600 dark:text-amber-400 font-bold">
                  {metrics.pendingWithdrawals} Pending Withdrawals
                </span>{" "}
                awaiting review.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {metrics.pendingDeposits > 0 && (
              <button
                onClick={() => onNavigate("deposits")}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-600/20"
              >
                Review Deposits ({metrics.pendingDeposits})
              </button>
            )}
            {metrics.pendingWithdrawals > 0 && (
              <button
                onClick={() => onNavigate("withdrawals")}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition shadow-lg shadow-amber-600/20"
              >
                Process Payouts ({metrics.pendingWithdrawals})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Primary KPI Row (Today) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 shadow-sm dark:shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-gray-400">Today&apos;s Deposits</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-white block">
            {metrics ? `${formatMoney(metrics.todayDeposits)} ETB` : "..."}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-gray-400 mt-1 block">
            All-time: <b className="text-emerald-600 dark:text-emerald-400">{formatMoney(metrics?.allTimeDeposits || 0)} ETB</b>
          </span>
        </div>

        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 shadow-sm dark:shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-gray-400">Today&apos;s Payouts</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-white block">
            {metrics ? `${formatMoney(metrics.todayWithdrawals)} ETB` : "..."}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-gray-400 mt-1 block">
            All-time: <b className="text-amber-600 dark:text-amber-400">{formatMoney(metrics?.allTimeWithdrawals || 0)} ETB</b>
          </span>
        </div>

        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 shadow-sm dark:shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-gray-400">House Profit (Today)</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-purple-600 dark:text-purple-400 block">
            {metrics ? `${formatMoney(metrics.todayHouseCut)} ETB` : "..."}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-gray-400 mt-1 block">
            All-time: <b className="text-purple-700 dark:text-purple-300">{formatMoney(metrics?.allTimeHouseCut || 0)} ETB</b>
          </span>
        </div>

        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 shadow-sm dark:shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-gray-400">Registered Players</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-white block">
            {metrics ? metrics.totalUsers.toLocaleString() : "..."}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-gray-400 mt-1 block">
            Verified Phones: <b className="text-blue-600 dark:text-cyan-400">{metrics?.verifiedUsers || 0}</b> • Banned:{" "}
            <b className="text-rose-600 dark:text-rose-400">{metrics?.bannedUsers || 0}</b>
          </span>
        </div>
      </div>

      {/* Secondary Financial Health Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-gray-400">Player Wallet Liability</div>
            <div className="text-xl font-black text-slate-900 dark:text-white">
              {formatMoney(metrics?.totalWalletBalance || 0)} ETB
            </div>
            <div className="text-[11px] text-slate-500 dark:text-gray-400">
              Locked in withdrawals: {formatMoney(metrics?.totalLockedBalance || 0)} ETB
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-gray-400">Bingo Games Activity</div>
            <div className="text-xl font-black text-slate-900 dark:text-white">
              {metrics?.totalGamesFinished || 0} Finished
            </div>
            <div className="text-[11px] text-slate-500 dark:text-gray-400">
              Live rounds right now: <b className="text-emerald-600 dark:text-emerald-400">{metrics?.activeRoundsCount || 0}</b> • Total Pot:{" "}
              {formatMoney(metrics?.allTimeTotalPot || 0)} ETB
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 dark:text-gray-400">Net Cashflow (Dep − Wd)</div>
            <div className="text-xl font-black text-slate-900 dark:text-white">
              {formatMoney((metrics?.allTimeDeposits || 0) - (metrics?.allTimeWithdrawals || 0))} ETB
            </div>
            <div className="text-[11px] text-slate-500 dark:text-gray-400">
              Today&apos;s net: {formatMoney((metrics?.todayDeposits || 0) - (metrics?.todayWithdrawals || 0))} ETB
            </div>
          </div>
        </div>
      </div>

      {/* Active Rooms Snapshot */}
      <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-6 shadow-sm dark:shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Live Bingo Rooms Status</h3>
          </div>
          <button
            onClick={() => onNavigate("rooms")}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Manage Rooms →
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {activeRooms.map((r) => (
            <div
              key={r.id}
              className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1a233b] rounded-xl p-4 flex flex-col gap-1.5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900 dark:text-white">{r.nameAm}</span>
                <span
                  className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full border shadow-sm ${
                    r.currentRoundStatus === "RUNNING"
                      ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30"
                      : r.currentRoundStatus === "COUNTDOWN"
                        ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/30 animate-pulse"
                        : "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/40"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      r.currentRoundStatus === "RUNNING"
                        ? "bg-emerald-500 animate-pulse"
                        : r.currentRoundStatus === "COUNTDOWN"
                          ? "bg-amber-500 animate-ping"
                          : "bg-purple-500"
                    }`}
                  />
                  <span>{r.currentRoundStatus || "WAITING"}</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-gray-400">
                Stake: <b className="text-slate-900 dark:text-white">{r.stakeAmount} ETB</b>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-gray-400 flex items-center justify-between pt-1 border-t border-slate-200 dark:border-[#161f35]">
                <span>Tickets: <b className="text-slate-800 dark:text-gray-300">{r.currentTickets}</b></span>
                <span className="text-blue-600 dark:text-cyan-400 font-bold">Pot: {formatMoney(r.currentPot)} ETB</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Deposits & Withdrawals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-6 shadow-sm dark:shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Recent Deposit Requests</h2>
            <button
              onClick={() => onNavigate("deposits")}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              View All →
            </button>
          </div>
          {recentDeposits.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 dark:text-gray-500">No deposits registered yet.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {recentDeposits.map((d) => (
                <div
                  key={d.id}
                  className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1a233b] rounded-xl p-3 flex items-center justify-between shadow-sm"
                >
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">{d.userName}</span>
                    <span className="text-[11px] text-slate-500 dark:text-gray-400">
                      {d.userPhone || "No phone"} • {d.provider}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 block">
                      +{formatMoney(d.amount)} ETB
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase ${
                        d.status === "PENDING"
                          ? "text-amber-600 dark:text-amber-400"
                          : d.status === "APPROVED"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#0f1422] border border-slate-200 dark:border-[#1a233b] rounded-2xl p-6 shadow-sm dark:shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Recent Payout Requests</h2>
            <button
              onClick={() => onNavigate("withdrawals")}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              View All →
            </button>
          </div>
          {recentWithdrawals.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 dark:text-gray-500">
              No payout requests registered yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {recentWithdrawals.map((w) => (
                <div
                  key={w.id}
                  className="bg-slate-50 dark:bg-[#0a0e18] border border-slate-200 dark:border-[#1a233b] rounded-xl p-3 flex items-center justify-between shadow-sm"
                >
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">{w.userName}</span>
                    <span className="text-[11px] text-slate-500 dark:text-gray-400">
                      {w.provider} • {w.accountName}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-amber-600 dark:text-amber-400 block">
                      -{formatMoney(w.amount)} ETB
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase ${
                        w.status === "PENDING"
                          ? "text-amber-600 dark:text-amber-400"
                          : w.status === "PAID"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {w.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
