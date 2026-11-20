import React, { useState, useEffect } from "react";
import { HelpCircle, Play, AlertCircle } from "lucide-react";
import { API_BASE_URL } from "./config.js";
import { RulesScreen } from "./components/RulesScreen.js";
import { BottomNav, type TabType } from "./components/BottomNav.js";
import { CartelaBoard } from "./components/CartelaBoard.js";
import { LiveGame } from "./components/LiveGame.js";
import { WalletTab } from "./components/WalletTab.js";
import { HistoryTab } from "./components/HistoryTab.js";
import { ProfileTab } from "./components/ProfileTab.js";

interface Room {
  id: string;
  nameAm: string;
  nameEn: string;
  stakeAmount: number;
  houseCutPercent?: number;
  minPlayers?: number;
  maxCartelasPerUser?: number;
  countdownSeconds?: number;
  nextGameDelaySeconds?: number;
  callIntervalMs?: number;
  cartelaPoolSize?: number;
  freeCenter?: boolean;
  winningPattern?: string;
  sortOrder?: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("game");
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [playingCards, setPlayingCards] = useState<number[] | null>(null);
  const [registeredRoundCards, setRegisteredRoundCards] = useState<number[]>([]);
  const [currentRoundGameId, setCurrentRoundGameId] = useState<string>("");

  // User wallet balance (defaults to 0 just like in real accounts and the screenshot)
  const [userBalance, setUserBalance] = useState<number>(() => {
    const saved = localStorage.getItem("bingo_wallet_balance");
    return saved !== null ? Number(saved) : 0;
  });

  // User phone number (from Telegram registration) & verification status
  const [userPhone, setUserPhone] = useState<string>(() => {
    return localStorage.getItem("bingo_user_phone") || "";
  });
  const [isVerified, setIsVerified] = useState<boolean>(() => {
    return localStorage.getItem("bingo_user_verified") === "true";
  });

  // User preferred language from bot registration
  const [userLang, setUserLang] = useState<"AM" | "EN">(() => {
    return (localStorage.getItem("bingo_user_lang") as "AM" | "EN") || "AM";
  });

  // Native Telegram WebApp SDK initialization
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready?.();
      tg.expand?.();
    }
  }, []);

  const getTelegramUser = () => {
    if (typeof window !== "undefined") {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.initDataUnsafe?.user) {
        return tg.initDataUnsafe.user;
      }
    }
    return null;
  };

  const getTelegramId = () => {
    // 1. Telegram WebApp object when opened inside Telegram
    const tgUser = getTelegramUser();
    if (tgUser?.id) {
      return String(tgUser.id);
    }
    // 2. Direct query param fallback if passed
    const searchParams = new URLSearchParams(window.location.search);
    const fromUrl = searchParams.get("telegramId");
    if (fromUrl) {
      return fromUrl;
    }
    // 3. Persistent browser session ID for multi-account testing
    let saved = localStorage.getItem("bingo_client_tg_id");
    if (!saved) {
      saved = String(Math.floor(100000000 + Math.random() * 900000000));
      localStorage.setItem("bingo_client_tg_id", saved);
    }
    return saved;
  };

  const updateBalance = (newBal: number) => {
    setUserBalance(newBal);
    localStorage.setItem("bingo_wallet_balance", String(newBal));
  };

  const handleDeductBalance = (amount: number) => {
    if (amount <= 0) return;
    setUserBalance((prev) => {
      const next = Math.max(0, prev - amount);
      localStorage.setItem("bingo_wallet_balance", String(next));
      return next;
    });
  };

  const handleWinPrize = (prize: number) => {
    if (prize <= 0) return;
    setUserBalance((prev) => {
      const next = prev + prize;
      localStorage.setItem("bingo_wallet_balance", String(next));
      return next;
    });

    const tgId = getTelegramId();
    if (tgId && selectedRoom) {
      fetch(`${API_BASE_URL}/api/rooms/${selectedRoom.id}/claim-win`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId: tgId,
          prize,
        }),
      }).catch(() => {});
    }
  };

  const [rooms, setRooms] = useState<Room[]>([
    { id: "10", nameAm: "መደብ 10", nameEn: "Play 10", stakeAmount: 10 },
    { id: "20", nameAm: "መደብ 20", nameEn: "Play 20", stakeAmount: 20 },
  ]);

  const handleRefreshUserData = async () => {
    const tgId = getTelegramId();
    if (!tgId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/wallet/balance?telegramId=${tgId}`);
      const data = await res.json();
      if (data.ok) {
        if (typeof data.balance === "number") {
          updateBalance(data.balance);
        }
        if (data.phoneNumber) {
          setUserPhone(data.phoneNumber);
          localStorage.setItem("bingo_user_phone", data.phoneNumber);
          setIsVerified(true);
          localStorage.setItem("bingo_user_verified", "true");
        }
        if (data.language) {
          setUserLang(data.language);
          localStorage.setItem("bingo_user_lang", data.language);
        }
        if (data.firstName) {
          localStorage.setItem("bingo_user_name", data.firstName);
        }
      }
    } catch {}
  };

  // Fetch live rooms & Telegram user balance
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/rooms`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.rooms) && data.rooms.length > 0) {
          setRooms(data.rooms);
        }
      })
      .catch(() => {});

    handleRefreshUserData();
  }, []);

  const handleSelectRoom = async (room: Room) => {
    setSelectedRoom(room);
    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/${room.id}/state`);
      const data = await res.json();
      if (data.ok && data.state) {
        if (data.state.gameId || data.state.gameCode) {
          setCurrentRoundGameId(data.state.gameId || data.state.gameCode);
        }
        if (data.state.status === "RUNNING" && (!Array.isArray(data.state.calledNumbers) || data.state.calledNumbers.length < 75)) {
          // Ongoing game currently active: enter directly as spectator in Watching Only mode
          setPlayingCards([]);
          setRegisteredRoundCards(data.state.takenCards || []);
          return;
        }
      }
    } catch {}
    setPlayingCards(null);
    setRegisteredRoundCards([]);
  };

  const handleBackToLobby = () => {
    setSelectedRoom(null);
    setPlayingCards(null);
    setRegisteredRoundCards([]);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between text-white bg-[#0c0d1c]">
      {/* 1. Live In-Game Screen (Active Players & Watching Only Spectators) */}
      {activeTab === "game" && selectedRoom && playingCards !== null ? (
        <LiveGame
          roomId={selectedRoom.id}
          gameId={currentRoundGameId}
          telegramId={getTelegramId()}
          clientId={getTelegramId()}
          stake={selectedRoom.stakeAmount}
          houseCutPercent={selectedRoom.houseCutPercent ?? 20}
          callIntervalMs={selectedRoom.callIntervalMs ?? 3500}
          winnerDelaySeconds={selectedRoom.nextGameDelaySeconds ?? 6}
          freeCenter={selectedRoom.freeCenter ?? true}
          cartelaNumbers={playingCards}
          registeredCards={registeredRoundCards}
          userBalance={userBalance}
          onWinPrize={handleWinPrize}
          onLeave={handleBackToLobby}
          onNextRound={() => {
            setPlayingCards(null);
            setRegisteredRoundCards([]);
          }}
        />
      ) : activeTab === "game" && selectedRoom ? (
        /* 2. Cartela Selection Board */
        <CartelaBoard
          roomId={selectedRoom.id}
          telegramId={getTelegramId()}
          clientId={getTelegramId()}
          stake={selectedRoom.stakeAmount}
          minPlayers={selectedRoom.minPlayers ?? 2}
          maxCardsPerPlayer={selectedRoom.maxCartelasPerUser ?? 2}
          countdownSeconds={selectedRoom.countdownSeconds ?? 30}
          cartelaPoolSize={selectedRoom.cartelaPoolSize ?? 600}
          roomName={userLang === "AM" ? selectedRoom.nameAm || selectedRoom.nameEn : selectedRoom.nameEn || selectedRoom.nameAm}
          userBalance={userBalance}
          onBack={handleBackToLobby}
          onDeductBalance={handleDeductBalance}
          onConfirmPlay={(userCards, allRegisteredCards) => {
            setPlayingCards(userCards);
            setRegisteredRoundCards(allRegisteredCards);
          }}
        />
      ) : (
        /* 3. Main Lobby & Tabs */
        <>
          {/* Top Header - Only shown in Lobby game tab when Rules is NOT open */}
          {activeTab === "game" && !isRulesOpen && (
            <header className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/5 bg-[#0e1022]/60 backdrop-blur-md sticky top-0 z-30">
              <div className="flex items-center gap-3">
                {/* Tunnel Bingo Logo */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 via-purple-600 to-amber-400 p-[2px] shadow-lg shadow-purple-500/20">
                  <div className="w-full h-full rounded-full bg-[#14122d] flex items-center justify-center font-black text-amber-400 text-lg">
                    T
                  </div>
                </div>
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
                  Tunnel Bingo
                </span>
              </div>

              {/* Rules Button */}
              <button
                onClick={() => setIsRulesOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-semibold text-gray-200 transition shadow-sm"
              >
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <span>Rules</span>
              </button>
            </header>
          )}

          {/* Main Content Area */}
          <main
            className={`flex-1 flex flex-col px-4 py-5 max-w-md mx-auto w-full pb-24 ${
              activeTab === "game" && !isRulesOpen ? "items-center justify-center" : "items-stretch"
            }`}
          >
            {/* Rules Screen (Interactive 4-Step Rules Guide with Language Sync) */}
            {activeTab === "game" && isRulesOpen && (
              <RulesScreen initialLang={userLang} onBack={() => setIsRulesOpen(false)} />
            )}

            {/* Game Lobby (When rules is not open) */}
            {activeTab === "game" && !isRulesOpen && (
              <div className="w-full flex flex-col items-center animate-fadeIn">
                {/* Welcome Title */}
                <div className="text-center my-6">
                  <h1 className="text-3xl font-extrabold tracking-tight">
                    Welcome to{" "}
                    <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 bg-clip-text text-transparent drop-shadow-[0_2px_15px_rgba(255,215,0,0.4)]">
                      Tunnel Bingo
                    </span>
                  </h1>
                </div>

                {/* Stake Selector Box */}
                <div className="w-full rounded-2xl p-5 bg-[#141733]/85 glow-gold-border backdrop-blur-md shadow-2xl transition-all">
                  <div className="flex items-center justify-center gap-2 mb-5">
                    <Play className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <h2 className="text-base font-bold text-gray-200 tracking-wide uppercase">
                      Choose Your Stake
                    </h2>
                  </div>

                  {/* Stake Buttons */}
                  <div className="flex flex-col gap-3.5">
                    {rooms.length === 0 ? (
                      <div className="py-6 text-center text-gray-400 text-xs flex flex-col items-center">
                        <AlertCircle className="w-8 h-8 text-amber-400 mb-2 opacity-80" />
                        <p className="font-bold text-gray-200">
                          {userLang === "AM" ? "በአሁኑ ጊዜ ክፍት መደቦች የሉም" : "No active game rooms right now"}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {userLang === "AM" ? "እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ" : "Please check back shortly."}
                        </p>
                      </div>
                    ) : (
                      rooms.map((room, idx) => {
                        const isGreen = idx % 2 === 0;
                        return (
                          <button
                            key={room.id}
                            onClick={() => handleSelectRoom(room)}
                            className={`w-full py-4 px-6 rounded-xl font-extrabold text-lg flex items-center justify-center gap-2.5 text-white active:scale-[0.98] transition-all duration-150 ${
                              isGreen ? "glow-btn-green" : "glow-btn-blue"
                            }`}
                          >
                            <Play className="w-5 h-5 fill-white text-white" />
                            <span>{userLang === "AM" ? room.nameAm || room.nameEn : room.nameEn || room.nameAm}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* History Tab (Game History - Matches Screenshot) */}
            {activeTab === "history" && (
              <HistoryTab onRefresh={handleRefreshUserData} />
            )}

            {/* Wallet Tab (Single Wallet System - Exactly Matches Screenshot) */}
            {activeTab === "wallet" && (
              <WalletTab
                userBalance={userBalance}
                phoneNumber={
                  userPhone ||
                  (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.phone_number ||
                  "0912345678"
                }
                isVerified={isVerified || Boolean(userPhone)}
                onUpdateBalance={updateBalance}
                onRefresh={handleRefreshUserData}
              />
            )}

            {/* Profile Tab (User Profile - Matches Screenshot) */}
            {activeTab === "profile" && (
              <ProfileTab
                userBalance={userBalance}
                onRefresh={handleRefreshUserData}
              />
            )}
          </main>
        </>
      )}

      {/* Bottom Navigation (Visible in Lobby & Cartela Selection, hidden in Live Game) */}
      {!(activeTab === "game" && selectedRoom && playingCards !== null) && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setIsRulesOpen(false);
            if (tab !== "game") {
              setSelectedRoom(null);
              setPlayingCards(null);
            }
          }}
        />
      )}
    </div>
  );
}
