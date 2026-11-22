import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../config.js";
import {
  User as UserIcon,
  RotateCw,
  Check,
  ArrowDownLeft,
  ArrowUpRight,
  Trophy,
  History,
} from "lucide-react";

export interface TransactionItem {
  id: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "BET" | "WIN" | "WELCOME_BONUS" | string;
  amount: number;
  balanceAfter?: number;
  note?: string;
  createdAt: string;
}

interface WalletTabProps {
  userBalance: number;
  phoneNumber?: string | null;
  isVerified?: boolean;
  onUpdateBalance?: (newBalance: number) => void;
  onRefresh?: () => void;
}

export const WalletTab: React.FC<WalletTabProps> = ({
  userBalance,
  phoneNumber,
  isVerified = true,
  onRefresh,
}) => {
  const [subTab, setSubTab] = useState<"balance" | "history">("balance");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [isLoadingTx, setIsLoadingTx] = useState(false);

  // Fetch transactions from server or localStorage
  const fetchTransactions = async () => {
    setIsLoadingTx(true);
    try {
      const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      const tgId = tgUser?.id || new URLSearchParams(window.location.search).get("telegramId");
      if (tgId) {
        const res = await fetch(`${API_BASE_URL}/api/wallet/transactions?telegramId=${tgId}`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
          setIsLoadingTx(false);
          return;
        }
      }
    } catch {
      // Fallback
    }

    const cached = localStorage.getItem("bingo_local_transactions");
    if (cached) {
      try {
        setTransactions(JSON.parse(cached));
      } catch {
        setTransactions([]);
      }
    } else {
      setTransactions([]);
    }
    setIsLoadingTx(false);
  };

  useEffect(() => {
    fetchTransactions();
  }, [subTab, userBalance]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (onRefresh) {
      await onRefresh();
    }
    await fetchTransactions();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const displayPhone = phoneNumber || "ያልተመዘገበ";
  const hasPhone = Boolean(phoneNumber);

  return (
    <div className="w-full flex flex-col animate-fadeIn">
      {/* 1. Header with 'Wallet' title and Refresh icon */}
      <div className="flex items-center justify-between mb-4 pt-1">
        <h1 className="text-2xl font-black text-white tracking-tight">Wallet</h1>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 active:scale-90 transition"
          aria-label="Refresh wallet"
        >
          <RotateCw className={`w-5 h-5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
        </button>
      </div>

      {/* 2. User Profile Card: Icon, Phone Number, Verified Pill */}
      <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-xl mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-gray-300">
            <UserIcon className="w-5 h-5" />
          </div>
          <div>
            <span className="text-base font-bold text-white tracking-wide block">
              {displayPhone}
            </span>
            <span className="text-[11px] text-gray-400">
              {hasPhone ? "የተመዘገበ ስልክ ቁጥር" : "ስልክ ቁጥርዎን በቦቱ ያጋሩ"}
            </span>
          </div>
        </div>

        {hasPhone && isVerified && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 text-emerald-400 shadow-sm">
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="text-xs font-semibold tracking-wide">Verified</span>
          </div>
        )}
      </div>

      {/* 3. Sub-Tab Capsule Switcher: Balance | History */}
      <div className="bg-[#121327] p-1 rounded-xl flex items-center border border-white/5 mb-4">
        <button
          onClick={() => setSubTab("balance")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 text-center ${
            subTab === "balance"
              ? "bg-[#252952] text-white shadow-lg shadow-black/30"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Balance
        </button>
        <button
          onClick={() => setSubTab("history")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 text-center ${
            subTab === "history"
              ? "bg-[#252952] text-white shadow-lg shadow-black/30"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          History
        </button>
      </div>

      {/* 4. Tab 1: Balance View (Strictly single Main Wallet card, matching screenshot) */}
      {subTab === "balance" && (
        <div className="flex flex-col gap-4 animate-fadeIn">
          {/* Main Wallet Card */}
          <div className="bg-[#14162e] border border-white/10 rounded-2xl p-5 flex items-center justify-between shadow-xl">
            <div>
              <span className="text-base font-semibold text-gray-300 block">Main Wallet</span>
              <span className="text-xs text-gray-400 mt-0.5 block">ዋና ቀሪ ሂሳብ</span>
            </div>
            <div className="text-right">
              <span className="text-3xl font-extrabold text-white tracking-tight">
                {userBalance}
              </span>
              <span className="text-xs text-amber-400 ml-1 font-bold">ETB</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tab 2: History View */}
      {subTab === "history" && (
        <div className="flex flex-col gap-2.5 animate-fadeIn">
          {isLoadingTx ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400">
              <RotateCw className="w-6 h-6 animate-spin text-cyan-400 mb-2" />
              <span className="text-xs">የግብይት ታሪክ በመጫን ላይ...</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="bg-[#14162e] border border-white/5 rounded-2xl p-8 text-center shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto mb-3 flex items-center justify-center text-gray-400">
                <History className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-200 mb-1">ምንም የግብይት ታሪክ የለም</h3>
              <p className="text-xs text-gray-400">
                ገንዘብ ሲያስገቡ፣ ካርቴላ ሲገዙ ወይም ሲያሸንፉ እዚህ ዝርዝሩ ይታያል።
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {transactions.map((tx) => {
                const isDeposit = tx.type === "DEPOSIT" || tx.type === "WELCOME_BONUS";
                const isWin = tx.type === "WIN" || tx.type === "BINGO_WIN";
                const isBet = tx.type === "BET" || tx.type === "GAME_ENTRY";
                const isPositive = isDeposit || isWin;

                return (
                  <div
                    key={tx.id}
                    className="bg-[#14162e] border border-white/5 rounded-xl p-3 flex items-center justify-between shadow-sm hover:border-white/10 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isWin
                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            : isDeposit
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                        }`}
                      >
                        {isWin ? (
                          <Trophy className="w-4 h-4" />
                        ) : isDeposit ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">
                          {tx.note ||
                            (isWin
                              ? "የቢንጎ አሸናፊ ሽልማት"
                              : isDeposit
                              ? "ገንዘብ ተቀማጭ (Deposit)"
                              : isBet
                              ? "የካርቴላ ክፍያ (Ticket)"
                              : "ገንዘብ ማውጣት")}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(tx.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-sm font-extrabold block ${
                          isPositive ? "text-emerald-400" : "text-gray-200"
                        }`}
                      >
                        {isPositive ? "+" : "-"}
                        {tx.amount} ETB
                      </span>
                      <span className="text-[10px] text-emerald-400/80 font-medium">Completed</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. Centered Bot Watermark / Handle */}
      <div className="mt-8 text-center">
        <span className="text-xs text-gray-500 font-medium tracking-wider">
          Zemen Bingo
        </span>
      </div>
    </div>
  );
};
