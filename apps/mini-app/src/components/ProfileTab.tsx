import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../config.js";
import {
  Wallet,
  Trophy,
  Users,
  TrendingUp,
  Gamepad2,
  RotateCw,
} from "lucide-react";

interface ProfileTabProps {
  userBalance: number;
  onRefresh?: () => void;
}

interface UserProfileData {
  name: string;
  username: string | null;
  phoneNumber: string | null;
  balance: number;
  gamesWon: number;
  totalGames: number;
  totalInvites: number;
  totalEarnings: number;
  referralCode: string;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({ userBalance, onRefresh }) => {
  const [profile, setProfile] = useState<UserProfileData>(() => {
    // Read Telegram WebApp user if open in Telegram
    const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    const tgName = tgUser
      ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ")
      : localStorage.getItem("bingo_user_name") || "";

    const rawGames = localStorage.getItem("bingo_user_games");
    const realGamesCount = rawGames ? JSON.parse(rawGames).length : 0;

    return {
      name: tgName,
      username: tgUser?.username || localStorage.getItem("bingo_user_username") || null,
      phoneNumber: localStorage.getItem("bingo_user_phone") || null,
      balance: userBalance,
      gamesWon: 0,
      totalGames: realGamesCount,
      totalInvites: 0,
      totalEarnings: 0,
      referralCode: localStorage.getItem("bingo_user_ref") || "",
    };
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      const tgId = tgUser?.id || new URLSearchParams(window.location.search).get("telegramId");
      if (tgId) {
        const res = await fetch(`${API_BASE_URL}/api/user/profile?telegramId=${tgId}`);
        const data = await res.json();
        if (data.ok && data.profile) {
          setProfile((prev) => ({
            ...prev,
            ...data.profile,
            // Always prioritize real Telegram user name from WebApp if present
            name: tgUser
              ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || data.profile.name
              : data.profile.name || prev.name,
            username: tgUser?.username || data.profile.username || prev.username,
            balance: typeof data.profile.balance === "number" ? data.profile.balance : userBalance,
          }));
        }
      }
    } catch {
      // Fallback
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchProfile();
  }, [userBalance]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (onRefresh) onRefresh();
    await fetchProfile();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <div className="w-full flex flex-col animate-fadeIn">
      {/* 1. Header with Refresh */}
      <div className="flex items-center justify-between mb-4 pt-1">
        <h1 className="text-2xl font-black text-white tracking-tight">Profile</h1>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 active:scale-90 transition"
          aria-label="Refresh profile"
        >
          <RotateCw className={`w-5 h-5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
        </button>
      </div>

      {/* 2. Avatar & Telegram Account Name (Matches screenshot top section) */}
      <div className="flex flex-col items-center justify-center mb-6">
        {/* Avatar Circle with stylized diamond or Telegram avatar */}
        <div className="w-20 h-20 rounded-full bg-[#171938] border-2 border-white/10 flex items-center justify-center shadow-2xl relative mb-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-cyan-500/20 to-purple-500/30 border border-white/20 rotate-45 flex items-center justify-center">
            <span className="-rotate-45 font-black text-lg text-white">?</span>
          </div>
        </div>

        {/* Telegram Account Name (User explained: "profile lay yalwe ye selk melket ye accountu yetelegram name new") */}
        <h2 className="text-xl font-extrabold text-white tracking-wide text-center">
          {profile.name}
        </h2>

        {/* Username / Subtitle */}
        {profile.username && (
          <span className="text-xs text-cyan-400 font-medium mt-0.5">
            @{profile.username}
          </span>
        )}
        {profile.phoneNumber && (
          <span className="text-[11px] text-gray-400 font-medium mt-0.5">
            {profile.phoneNumber}
          </span>
        )}
      </div>

      {/* 3. Stat Cards Grid (2 Columns, Single Wallet System - NO Play Wallet!) */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Card 1: Main Wallet */}
        <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 flex flex-col justify-between shadow-xl min-h-[96px]">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-gray-300">Main Wallet</span>
          </div>
          <div>
            <span className="text-2xl font-black text-white tracking-tight">
              {profile.balance}
            </span>
          </div>
        </div>

        {/* Card 2: Total Earning (In screenshot was Play Wallet, replaced with Total Earning for single wallet!) */}
        <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 flex flex-col justify-between shadow-xl min-h-[96px]">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-semibold text-gray-300">Total Earning</span>
          </div>
          <div>
            <span className="text-2xl font-black text-white tracking-tight">
              {profile.totalEarnings}
            </span>
          </div>
        </div>

        {/* Card 3: Games Won */}
        <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 flex flex-col justify-between shadow-xl min-h-[96px]">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold text-gray-300">Games Won</span>
          </div>
          <div>
            <span className="text-2xl font-black text-white tracking-tight">
              {profile.gamesWon}
            </span>
          </div>
        </div>

        {/* Card 4: Total Invite */}
        <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 flex flex-col justify-between shadow-xl min-h-[96px]">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-semibold text-gray-300">Total Invite</span>
          </div>
          <div>
            <span className="text-2xl font-black text-white tracking-tight">
              {profile.totalInvites}
            </span>
          </div>
        </div>

        {/* Card 5: Total Games */}
        <div className="bg-[#14162e] border border-white/10 rounded-2xl p-4 flex flex-col justify-between shadow-xl min-h-[96px] col-span-2">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-gray-300">Total Games Played</span>
          </div>
          <div>
            <span className="text-2xl font-black text-white tracking-tight">
              {profile.totalGames}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Centered Bot Watermark */}
      <div className="mt-8 text-center">
        <span className="text-xs text-gray-500 font-medium tracking-wider">
          @Zemen_Bingo_et_bot
        </span>
      </div>
    </div>
  );
};
