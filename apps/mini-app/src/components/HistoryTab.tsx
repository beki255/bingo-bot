import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../config.js";
import { Calendar, Clock, RotateCw, History, Trophy } from "lucide-react";

export interface GameHistoryItem {
  id: string;
  gameId: string;
  date: string;
  isWinner: boolean;
  stake: number;
  cartelaNumber: number;
  prize: number;
  winnersCount: number;
}

interface HistoryTabProps {
  onRefresh?: () => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ onRefresh }) => {
  const [totalGames, setTotalGames] = useState<number>(() => {
    const cachedGames = localStorage.getItem("bingo_user_games");
    if (cachedGames) {
      try {
        const parsed = JSON.parse(cachedGames);
        return parsed.length;
      } catch {
        return 0;
      }
    }
    return 0;
  });
  const [games, setGames] = useState<GameHistoryItem[]>(() => {
    const cachedGames = localStorage.getItem("bingo_user_games");
    if (cachedGames) {
      try {
        return JSON.parse(cachedGames);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      const tgId = tgUser?.id || new URLSearchParams(window.location.search).get("telegramId");
      if (tgId) {
        const res = await fetch(`${API_BASE_URL}/api/user/game-history?telegramId=${tgId}`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.games)) {
          setTotalGames(data.totalGames);
          setGames(data.games);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // Fallback
    }

    // Only load real saved games played by user (no hardcoded mock)
    const cachedGames = localStorage.getItem("bingo_user_games");
    if (cachedGames) {
      try {
        const parsed = JSON.parse(cachedGames);
        setGames(parsed);
        setTotalGames(parsed.length);
      } catch {
        setGames([]);
        setTotalGames(0);
      }
    } else {
      setGames([]);
      setTotalGames(0);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (onRefresh) onRefresh();
    await fetchHistory();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <div className="w-full flex flex-col animate-fadeIn">
      {/* 1. Header with 'Game History' Title & Refresh */}
      <div className="flex items-center justify-between mb-4 pt-1">
        <h1 className="text-2xl font-black text-white tracking-tight">Game History</h1>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 active:scale-90 transition"
          aria-label="Refresh history"
        >
          <RotateCw className={`w-5 h-5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
        </button>
      </div>

      {/* 2. Total Games Card (Matches screenshot exactly) */}
      <div className="bg-[#14162e] border border-white/10 rounded-2xl p-5 shadow-xl mb-6">
        <span className="text-xs font-semibold text-gray-400 block mb-1">Total Games</span>
        <span className="text-3xl font-extrabold text-white tracking-tight">
          {totalGames}
        </span>
      </div>

      {/* 3. Section Title: Recent Games */}
      <div className="mb-3">
        <h2 className="text-base font-bold text-white tracking-wide">Recent Games</h2>
      </div>

      {/* 4. Games List */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-gray-400">
          <RotateCw className="w-6 h-6 animate-spin text-cyan-400 mb-2" />
          <span className="text-xs">የጨዋታ ታሪክ በመጫን ላይ...</span>
        </div>
      ) : games.length === 0 ? (
        <div className="bg-[#14162e] border border-white/5 rounded-2xl p-8 text-center shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto mb-3 flex items-center justify-center text-gray-400">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-gray-200 mb-1">ምንም የተጫወቱት ጨዋታ የለም</h3>
          <p className="text-xs text-gray-400">
            ጨዋታ ሲጫወቱ ውጤቱና ዝርዝሩ እዚህ ይመዘገባል።
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {games.map((game) => {
            const formattedDate = new Date(game.date).toLocaleString("en-US", {
              month: "2-digit",
              day: "2-digit",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
            });

            return (
              <div
                key={game.id}
                className="bg-[#14162e] border border-white/10 rounded-2xl p-4 shadow-xl hover:border-white/15 transition"
              >
                {/* Top Row: Avatar Circle, Game ID, Date/Time, and Status Badge */}
                <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
                  <div className="flex items-center gap-3">
                    {/* Circle Avatar */}
                    <div className="w-8 h-8 rounded-full bg-purple-950/80 border border-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-300 shrink-0">
                      <Trophy className="w-4 h-4 text-purple-400" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-white block leading-tight">
                        {game.gameId}
                      </span>
                      <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span>{formattedDate}</span>
                        <Clock className="w-3 h-3 text-gray-400 ml-0.5" />
                      </div>
                    </div>
                  </div>

                  {/* Status Badge: Lost / Won */}
                  <div>
                    {game.isWinner ? (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 shadow-sm">
                        Won
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/35 shadow-sm">
                        Lost
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Stake, Cards, Prize, Winners (4 Columns) */}
                <div className="grid grid-cols-4 gap-2 text-left">
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Stake:</span>
                    <span className="text-sm font-bold text-white">{game.stake}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Cards:</span>
                    <span className="text-sm font-bold text-white">{game.cartelaNumber}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Prize:</span>
                    <span className="text-sm font-bold text-white">{game.prize}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Winners:</span>
                    <span className="text-sm font-bold text-white">{game.winnersCount}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Centered Bot Watermark */}
      <div className="mt-8 text-center">
        <span className="text-xs text-gray-500 font-medium tracking-wider">
          @Zemen_Bingo_et_bot
        </span>
      </div>
    </div>
  );
};
