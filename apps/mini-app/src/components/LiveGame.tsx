import React, { useState, useEffect, useRef, useMemo } from "react";
import { Volume2, VolumeX, RotateCw, LogOut, Sparkles, Trophy, Crown } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { generateDeterministicCartela, BINGO_LETTERS, type BingoLetter } from "@bingo/shared";
import { API_BASE_URL } from "../config.js";

interface WinnerInfo {
  name: string;
  avatar: string;
  cardNo: number;
}

interface WinnerData {
  winners: WinnerInfo[];
  winningCartelaNo: number;
  winningPatternKeys: Set<string>;
}

interface LiveGameProps {
  roomId?: string;
  gameId?: string;
  telegramId?: string | null;
  clientId?: string | null;
  stake: number;
  houseCutPercent?: number;
  callIntervalMs?: number;
  freeCenter?: boolean;
  cartelaNumbers: number[];
  registeredCards: number[];
  userBalance: number;
  onWinPrize?: (prize: number) => void;
  onLeave: () => void;
  onNextRound?: () => void;
}

export const LiveGame: React.FC<LiveGameProps> = ({
  roomId,
  gameId: initialGameId,
  telegramId,
  clientId,
  stake,
  houseCutPercent = 20,
  callIntervalMs = 3500,
  freeCenter = true,
  cartelaNumbers,
  registeredCards,
  userBalance,
  onWinPrize,
  onLeave,
  onNextRound,
}) => {
  const isWatchingOnly = cartelaNumbers.length === 0;

  // Active cartela switcher (if user plays multiple cards)
  const [activeCartelaIndex, setActiveCartelaIndex] = useState(0);
  const activeCartelaNo = cartelaNumbers[activeCartelaIndex] || registeredCards[0] || 1;

  // Real synchronized Game ID from server
  const [displayGameId, setDisplayGameId] = useState<string>(initialGameId || "TB100001");

  // Ball calling state synchronized with server
  const [socket, setSocket] = useState<Socket | null>(null);
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [currentBall, setCurrentBall] = useState<{ letter: BingoLetter; num: number } | null>(null);
  const [serverDerash, setServerDerash] = useState<number | null>(null);
  const [serverPlayersCount, setServerPlayersCount] = useState<number>(registeredCards.length);

  const totalCardsCount =
    serverPlayersCount > 0
      ? serverPlayersCount
      : registeredCards.length > 0
      ? registeredCards.length
      : cartelaNumbers.length;
  const playerCount = totalCardsCount;
  const houseCut = (houseCutPercent ?? 20) / 100;
  const derash = serverDerash ?? Math.floor(totalCardsCount * stake * (1 - houseCut));

  const [isAutomatic, setIsAutomatic] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // User marked cells on active cartela: string keys `${row}-${col}`
  const [markedCells, setMarkedCells] = useState<Record<number, Set<string>>>({});

  // Real winner celebration state
  const [winnerData, setWinnerData] = useState<WinnerData | null>(null);
  const [nextGameCountdown, setNextGameCountdown] = useState(6);
  const hasAwardedPrizeRef = useRef(false);
  const hasGameEndedRef = useRef(false);

  // Sound caller using Web Audio API
  const playBallSound = (num: number) => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {}
  };

  const playBingoWinSound = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.4);
      });
    } catch {}
  };

  // Generate 5x5 grid for active cartela (if playing)
  const cartelaGrid: number[][] = useMemo(() => {
    if (isWatchingOnly) return [];
    try {
      return generateDeterministicCartela(activeCartelaNo);
    } catch {
      return Array(5).fill(null).map(() => Array(5).fill(0));
    }
  }, [activeCartelaNo, isWatchingOnly]);

  // Winning cartela grid for Winner Screen (Image 2)
  const winningCartelaGrid: number[][] = useMemo(() => {
    const targetCard = winnerData?.winningCartelaNo || 1;
    try {
      return generateDeterministicCartela(targetCard);
    } catch {
      return [];
    }
  }, [winnerData?.winningCartelaNo]);

  // Helper: map number to B-I-N-G-O letter
  const getLetterForNumber = (n: number): BingoLetter => {
    if (n <= 15) return "B";
    if (n <= 30) return "I";
    if (n <= 45) return "N";
    if (n <= 60) return "G";
    return "O";
  };

  // Helper: pill color per B-I-N-G-O letter
  const getPillColor = (letter: BingoLetter) => {
    switch (letter) {
      case "B":
        return "bg-[#0088ff] text-white";
      case "I":
        return "bg-[#5c2bff] text-white";
      case "N":
        return "bg-[#9c27b0] text-white";
      case "G":
        return "bg-[#00c853] text-black font-black";
      case "O":
        return "bg-[#ff6d00] text-white";
    }
  };

  // Last 4 called numbers (newest on the left, up to 4 recent calls)
  const recentCalls = useMemo(() => {
    return calledNumbers
      .slice(-4)
      .reverse()
      .map((num) => ({
        num,
        letter: getLetterForNumber(num),
      }));
  }, [calledNumbers]);

  // Initialize marked cells with center star if freeCenter is enabled
  useEffect(() => {
    const initMarked: Record<number, Set<string>> = {};
    cartelaNumbers.forEach((cNum) => {
      initMarked[cNum] = freeCenter ? new Set(["2-2"]) : new Set();
    });
    setMarkedCells(initMarked);
  }, [cartelaNumbers, freeCenter]);

  // Real-time server Socket.IO multiplayer connection
  useEffect(() => {
    if (!roomId) return;
    const socketUrl = API_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "");
    const s = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
    });

    s.on("connect", () => {
      s.emit("join_room", { roomId, clientId: clientId || telegramId });
    });

    s.on("room_state", (state: any) => {
      if (state?.gameId || state?.gameCode) {
        setDisplayGameId(state.gameId || state.gameCode);
      }
      if (Array.isArray(state?.calledNumbers)) {
        setCalledNumbers(state.calledNumbers);
      }
      if (state?.currentBall) {
        setCurrentBall(state.currentBall);
      }
      if (typeof state?.derash === "number") {
        setServerDerash(state.derash);
      }
      if (typeof state?.ticketsCount === "number") {
        setServerPlayersCount(state.ticketsCount);
      }
      if (state?.status === "WAITING" && hasGameEndedRef.current) {
        if (onNextRound) onNextRound();
      }
    });

    s.on("ball_called", (data: any) => {
      if (data?.ball) {
        setCurrentBall(data.ball);
        playBallSound(data.ball.num);
      }
      if (Array.isArray(data?.calledNumbers)) {
        setCalledNumbers(data.calledNumbers);
      }
    });

    s.on("game_won", (data: any) => {
      hasGameEndedRef.current = true;
      const winningCard = data?.winningCartelaNo;
      const isUserWinner = cartelaNumbers.includes(winningCard);

      if (isUserWinner && onWinPrize && !hasAwardedPrizeRef.current) {
        hasAwardedPrizeRef.current = true;
        onWinPrize(data?.derash ?? derash);
      }

      setWinnerData({
        winners: Array.isArray(data?.winners) && data.winners.length > 0
          ? data.winners
          : [{ name: isUserWinner ? "You (ተጫዋች)" : `Player #${winningCard}`, avatar: isUserWinner ? "U" : "P", cardNo: winningCard }],
        winningCartelaNo: winningCard,
        winningPatternKeys: new Set(data?.winningPatternKeys || []),
      });

      playBingoWinSound();
    });

    s.on("game_ended", () => {
      hasGameEndedRef.current = true;
      setTimeout(() => {
        if (onNextRound) onNextRound();
      }, 3000);
    });

    setSocket(s);

    // Initial fetch of room state to catch up immediately if joining mid-game
    fetch(`${API_BASE_URL}/api/rooms/${roomId}/state`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.state) {
          const st = data.state;
          if (st.gameId || st.gameCode) setDisplayGameId(st.gameId || st.gameCode);
          if (Array.isArray(st.calledNumbers)) setCalledNumbers(st.calledNumbers);
          if (st.currentBall) setCurrentBall(st.currentBall);
          if (typeof st.derash === "number") setServerDerash(st.derash);
          if (typeof st.ticketsCount === "number") setServerPlayersCount(st.ticketsCount);
        }
      })
      .catch(() => {});

    // Periodic sync poll every 2.5s
    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/state`);
        const data = await res.json();
        if (data.ok && data.state) {
          const st = data.state;
          if (st.gameId || st.gameCode) setDisplayGameId(st.gameId || st.gameCode);
          if (Array.isArray(st.calledNumbers)) setCalledNumbers(st.calledNumbers);
          if (st.currentBall) setCurrentBall(st.currentBall);
          if (st.status === "WAITING" && hasGameEndedRef.current) {
            if (onNextRound) onNextRound();
          }
        }
      } catch {}
    }, 2500);

    return () => {
      clearInterval(pollTimer);
      s.disconnect();
    };
  }, [roomId, clientId, telegramId, cartelaNumbers, onWinPrize, derash, onNextRound]);

  // If Automatic is enabled, automatically mark matching numbers on user's cartela
  useEffect(() => {
    if (!isAutomatic || isWatchingOnly || calledNumbers.length === 0) return;

    setMarkedCells((prev) => {
      const next = { ...prev };
      const calledSet = new Set(calledNumbers);

      cartelaNumbers.forEach((cNum) => {
        const grid = generateDeterministicCartela(cNum);
        const userSet = new Set(next[cNum] || (freeCenter ? ["2-2"] : []));

        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (freeCenter && r === 2 && c === 2) continue; // center free
            if (calledSet.has(grid[r][c])) {
              userSet.add(`${r}-${c}`);
            }
          }
        }
        next[cNum] = userSet;
      });
      return next;
    });
  }, [calledNumbers, isAutomatic, cartelaNumbers, isWatchingOnly, freeCenter]);
  // Check winning line pattern on a specific cartela grid
  const checkGridWin = (grid: number[][], calledSet: Set<number>): { hasWon: boolean; winningKeys: Set<string> } => {
    const isMarked = (r: number, c: number) => {
      if (freeCenter && r === 2 && c === 2) return true; // Center free
      return calledSet.has(grid[r][c]);
    };

    // 1. Any horizontal row
    for (let r = 0; r < 5; r++) {
      if ([0, 1, 2, 3, 4].every((c) => isMarked(r, c))) {
        return { hasWon: true, winningKeys: new Set([0, 1, 2, 3, 4].map((c) => `${r}-${c}`)) };
      }
    }
    // 2. Any vertical column
    for (let c = 0; c < 5; c++) {
      if ([0, 1, 2, 3, 4].every((r) => isMarked(r, c))) {
        return { hasWon: true, winningKeys: new Set([0, 1, 2, 3, 4].map((r) => `${r}-${c}`)) };
      }
    }
    // 3. Diagonal 1 (\)
    if ([0, 1, 2, 3, 4].every((i) => isMarked(i, i))) {
      return { hasWon: true, winningKeys: new Set([0, 1, 2, 3, 4].map((i) => `${i}-${i}`)) };
    }
    // 4. Diagonal 2 (/)
    if ([0, 1, 2, 3, 4].every((i) => isMarked(i, 4 - i))) {
      return { hasWon: true, winningKeys: new Set([0, 1, 2, 3, 4].map((i) => `${i}-${4 - i}`)) };
    }
    // 5. Four Corners
    if (isMarked(0, 0) && isMarked(0, 4) && isMarked(4, 0) && isMarked(4, 4)) {
      return { hasWon: true, winningKeys: new Set(["0-0", "0-4", "4-0", "4-4"]) };
    }

    return { hasWon: false, winningKeys: new Set() };
  };

  // Check ONLY REAL REGISTERED CARDS for winner (NO FAKE UNREGISTERED CARDS)
  useEffect(() => {
    if (winnerData || calledNumbers.length < 4) return;

    const calledSet = new Set(calledNumbers);
    const poolToCheck = registeredCards.length > 0 ? registeredCards : cartelaNumbers;

    for (const cardNo of poolToCheck) {
      const grid = generateDeterministicCartela(cardNo);
      const res = checkGridWin(grid, calledSet);
      if (res.hasWon) {
        const isUserCard = cartelaNumbers.includes(cardNo);

        // If user won, credit real prize to their balance!
        if (isUserCard && onWinPrize && !hasAwardedPrizeRef.current) {
          hasAwardedPrizeRef.current = true;
          onWinPrize(derash);
        }

        // Record real game into history if user actually played cards (not spectator)
        if (cartelaNumbers.length > 0) {
          try {
            const raw = localStorage.getItem("bingo_user_games");
            const list = raw ? JSON.parse(raw) : [];
            const newRecord = {
              id: "game-" + Date.now(),
              gameId: "Game " + displayGameId,
              date: new Date().toISOString(),
              isWinner: isUserCard,
              stake,
              cartelaNumber: cartelaNumbers[0] || cardNo,
              prize: derash,
              winnersCount: 1,
            };
            const updated = [newRecord, ...list].slice(0, 30);
            localStorage.setItem("bingo_user_games", JSON.stringify(updated));
            localStorage.setItem("bingo_history_total", String(updated.length));
          } catch {}
        }

        setWinnerData({
          winners: [
            {
              name: isUserCard ? "You (ተጫዋች)" : `Player #${cardNo}`,
              avatar: isUserCard ? "U" : "P",
              cardNo,
            },
          ],
          winningCartelaNo: cardNo,
          winningPatternKeys: res.winningKeys,
        });

        playBingoWinSound();
        return;
      }
    }
  }, [calledNumbers, registeredCards, cartelaNumbers, derash, onWinPrize, winnerData]);

  // Next game auto-countdown (counts down from 6s to 0s and restarts next round)
  useEffect(() => {
    if (!winnerData) return;

    const interval = setInterval(() => {
      setNextGameCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onNextRound) {
            onNextRound();
          } else {
            onLeave();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [winnerData, onNextRound, onLeave]);

  const handleCellClick = (r: number, c: number, cellValue: number) => {
    if (isAutomatic || isWatchingOnly) return;
    if (freeCenter && r === 2 && c === 2) return;
    if (!calledNumbers.includes(cellValue)) return;

    setMarkedCells((prev) => {
      const currentSet = new Set(prev[activeCartelaNo] || (freeCenter ? ["2-2"] : []));
      const key = `${r}-${c}`;
      if (currentSet.has(key)) {
        currentSet.delete(key);
      } else {
        currentSet.add(key);
      }
      return { ...prev, [activeCartelaNo]: currentSet };
    });
  };

  const handleBingoClick = () => {
    if (isWatchingOnly) return;
    if (socket && roomId) {
      socket.emit("claim_bingo", { roomId, cartelaNo: activeCartelaNo });
    }
    const grid = generateDeterministicCartela(activeCartelaNo);
    const res = checkGridWin(grid, new Set(calledNumbers));
    if (res.hasWon) {
      if (onWinPrize && !hasAwardedPrizeRef.current) {
        hasAwardedPrizeRef.current = true;
        onWinPrize(derash);
      }
      setWinnerData({
        winners: [{ name: "You (ተጫዋች)", avatar: "U", cardNo: activeCartelaNo }],
        winningCartelaNo: activeCartelaNo,
        winningPatternKeys: res.winningKeys,
      });
      playBingoWinSound();

      if (cartelaNumbers.length > 0) {
        try {
          const raw = localStorage.getItem("bingo_user_games");
          const list = raw ? JSON.parse(raw) : [];
          const newRecord = {
            id: "game-" + Date.now(),
            gameId: "Game " + displayGameId,
            date: new Date().toISOString(),
            isWinner: true,
            stake,
            cartelaNumber: activeCartelaNo,
            prize: derash,
            winnersCount: 1,
          };
          const updated = [newRecord, ...list].slice(0, 30);
          localStorage.setItem("bingo_user_games", JSON.stringify(updated));
          localStorage.setItem("bingo_history_total", String(updated.length));
        } catch {}
      }
    } else {
      alert("⚠️ ገና ሙሉ መስመር ወይም 4 ማዕዘን አልሞላም! ምልክት የተደረጉ ቁጥሮችን ያረጋግጡ።");
    }
  };

  const activeMarks = markedCells[activeCartelaNo] || (freeCenter ? new Set(["2-2"]) : new Set<string>());

  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto text-white select-none animate-fadeIn pb-16 relative">
      {/* 1. Top Metrics Bar (Game ID, Players, Bet, Derash, Called) */}
      <div className="grid grid-cols-5 gap-1 p-2 bg-[#101229] border-b border-white/10 text-center text-xs">
        {/* Game ID */}
        <div className="bg-[#1b1f3d] p-1 rounded-lg flex flex-col justify-center border border-white/5">
          <span className="text-[9px] text-gray-400 font-semibold uppercase">Game ID</span>
          <span className="font-extrabold text-[11px] text-white truncate">{displayGameId}</span>
        </div>

        {/* Players */}
        <div className="bg-[#1b1f3d] p-1 rounded-lg flex flex-col justify-center border border-white/5">
          <span className="text-[9px] text-gray-400 font-semibold uppercase">Players</span>
          <span className="font-extrabold text-xs text-white">{playerCount}</span>
        </div>

        {/* Bet */}
        <div className="bg-[#1b1f3d] p-1 rounded-lg flex flex-col justify-center border border-white/5">
          <span className="text-[9px] text-gray-400 font-semibold uppercase">Bet</span>
          <span className="font-extrabold text-xs text-white">{stake}</span>
        </div>

        {/* Derash (Real 80% Pot) */}
        <div className="bg-[#1b1f3d] p-1 rounded-lg flex flex-col justify-center border border-white/5">
          <span className="text-[9px] text-gray-400 font-semibold uppercase">Derash</span>
          <span className="font-extrabold text-xs text-amber-400">{derash}</span>
        </div>

        {/* Called Count */}
        <div className="bg-[#1b1f3d] p-1 rounded-lg flex flex-col justify-center border border-white/5">
          <span className="text-[9px] text-gray-400 font-semibold uppercase">Called</span>
          <span className="font-extrabold text-xs text-white">{calledNumbers.length}</span>
        </div>
      </div>

      {/* 2. Main Live Area: Left 75-Ball Board + Right Caller & Cartela / Watching Only */}
      <div className="flex-1 flex gap-2 p-2 overflow-hidden">
        {/* Left: 75-Ball Master Board (15 rows x 5 cols) */}
        <div className="w-[42%] bg-[#12142d] rounded-xl border border-white/10 p-1 flex flex-col justify-between">
          <div className="grid grid-cols-5 gap-0.5 mb-1 text-center font-black text-[11px]">
            <div className="bg-[#0088ff] text-white py-0.5 rounded">B</div>
            <div className="bg-[#5c2bff] text-white py-0.5 rounded">I</div>
            <div className="bg-[#9c27b0] text-white py-0.5 rounded">N</div>
            <div className="bg-[#00c853] text-black py-0.5 rounded">G</div>
            <div className="bg-[#ff6d00] text-white py-0.5 rounded">O</div>
          </div>

          <div className="flex-1 grid grid-cols-5 gap-0.5">
            {Array.from({ length: 15 }, (_, row) => {
              const b = row + 1;
              const i = row + 16;
              const n = row + 31;
              const g = row + 46;
              const o = row + 61;
              const colNums = [b, i, n, g, o];

              return colNums.map((num) => {
                const isCalled = calledNumbers.includes(num);
                const isCurrent = currentBall?.num === num;

                return (
                  <div
                    key={num}
                    className={`h-[21px] rounded flex items-center justify-center text-[10px] font-bold transition-all duration-200 ${
                      isCurrent
                        ? "bg-[#00e676] text-black font-black scale-105 shadow-[0_0_8px_rgba(0,230,118,0.8)] z-10"
                        : isCalled
                        ? "bg-[#00e676] text-black font-black"
                        : "bg-[#181a38] text-gray-300"
                    }`}
                  >
                    {num}
                  </div>
                );
              });
            })}
          </div>
        </div>

        {/* Right Panel: Live Caller + Cartela OR Watching Only */}
        <div className="flex-1 flex flex-col justify-between gap-1.5">
          {/* Top: Live Ball Caller Box */}
          <div className="bg-[#12142d] rounded-xl border border-white/10 p-2 flex flex-col items-center justify-center relative shadow-lg">
            {/* Header controls: Recent 4 Calls Tray + Sound */}
            <div className="w-full flex items-center justify-between text-xs px-1 mb-1 gap-1">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 max-w-[170px]">
                {recentCalls.length > 0 ? (
                  recentCalls.map((item, idx) => {
                    const isLatest = idx === 0;
                    return (
                      <span
                        key={`${item.num}-${idx}`}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-black shadow-sm shrink-0 transition-all duration-200 ${getPillColor(
                          item.letter
                        )} ${isLatest ? "scale-105 ring-1 ring-white/60" : "opacity-85"}`}
                      >
                        {item.letter}-{item.num}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[10px] text-gray-400">Ready...</span>
                )}
              </div>

              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1 rounded-md bg-white/5 text-gray-300 hover:text-white transition shrink-0"
                aria-label="Toggle Sound"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-gray-200" /> : <VolumeX className="w-4 h-4 text-gray-400" />}
              </button>
            </div>

            {/* Big Glowing Circular Ball */}
            <div className="w-20 h-20 rounded-full border-[3.5px] border-[#ffb300] bg-white flex items-center justify-center my-1 shadow-[0_0_22px_rgba(255,179,0,0.5)]">
              <span className="font-black text-2xl text-[#6a1b9a] tracking-tight">
                {currentBall ? `${currentBall.letter}-${currentBall.num}` : "START"}
              </span>
            </div>

            {/* Automatic Toggle Switch */}
            <div className="w-full flex items-center justify-between px-2 pt-1 border-t border-white/5 mt-1">
              <span className="text-xs font-bold text-gray-300">Automatic</span>
              <button
                onClick={() => !isWatchingOnly && setIsAutomatic(!isAutomatic)}
                disabled={isWatchingOnly}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 ${
                  isAutomatic ? "bg-emerald-500" : "bg-gray-600"
                } ${isWatchingOnly ? "opacity-80" : ""}`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    isAutomatic ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Bottom of Right Panel: Either "Watching Only" Card OR Player's 5x5 Cartela */}
          {isWatchingOnly ? (
            <div className="bg-[#12142d] rounded-xl border border-white/10 p-4 shadow-lg flex-1 flex flex-col items-center justify-center text-center animate-fadeIn">
              <h3 className="text-xl font-black text-white mb-5 tracking-wide">
                Watching Only
              </h3>
              <p className="text-sm font-bold text-gray-200 leading-relaxed max-w-[210px]">
                የዚህ ዙር ጨዋታ ተጀምሯል፤ አዲስ ዙር እስኪጀምር እዚሁ ይጠብቁ።
              </p>
            </div>
          ) : (
            <div className="bg-[#12142d] rounded-xl border border-white/10 p-1.5 shadow-lg flex flex-col justify-center">
              <div className="grid grid-cols-5 gap-1 mb-1 text-center font-black text-xs">
                <div className="bg-[#0088ff] text-white py-0.5 rounded">B</div>
                <div className="bg-[#5c2bff] text-white py-0.5 rounded">I</div>
                <div className="bg-[#9c27b0] text-white py-0.5 rounded">N</div>
                <div className="bg-[#00c853] text-black py-0.5 rounded">G</div>
                <div className="bg-[#ff6d00] text-white py-0.5 rounded">O</div>
              </div>

              <div className="grid grid-cols-5 gap-1">
                {cartelaGrid.map((row, rIdx) =>
                  row.map((val, cIdx) => {
                    const isCenter = freeCenter && rIdx === 2 && cIdx === 2;
                    const key = `${rIdx}-${cIdx}`;
                    const isMarked = activeMarks.has(key);

                    return (
                      <button
                        key={`${rIdx}-${cIdx}`}
                        onClick={() => handleCellClick(rIdx, cIdx, val)}
                        className={`h-8 rounded-lg flex items-center justify-center text-xs font-extrabold transition-all duration-150 ${
                          isCenter
                            ? "bg-[#00e676] text-black shadow-[0_0_8px_rgba(0,230,118,0.7)]"
                            : isMarked
                            ? "bg-[#00e676] text-black shadow-[0_0_8px_rgba(0,230,118,0.7)] font-black scale-95"
                            : "bg-white text-gray-900 active:scale-95 hover:bg-gray-100"
                        }`}
                      >
                        {isCenter ? <Sparkles className="w-4 h-4 fill-amber-300 text-amber-500" /> : val}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mt-1.5 flex items-center justify-center gap-2">
                {cartelaNumbers.length > 1 ? (
                  <div className="flex gap-1">
                    {cartelaNumbers.map((cNum, idx) => (
                      <button
                        key={cNum}
                        onClick={() => setActiveCartelaIndex(idx)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition ${
                          activeCartelaIndex === idx
                            ? "bg-amber-400 text-black shadow"
                            : "bg-white/10 text-gray-400 hover:text-white"
                        }`}
                      >
                        Cartela #{cNum}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-amber-400">
                    Cartela No: {activeCartelaNo}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Controls Bar */}
      <div className="p-2 bg-[#0e1022] border-t border-white/10 grid grid-cols-4 gap-2 items-center">
        <button
          onClick={onLeave}
          className="col-span-1 py-3 rounded-xl bg-[#ff3d00] hover:bg-[#ff5722] text-white font-extrabold text-xs flex items-center justify-center active:scale-95 shadow-md transition"
        >
          <span>Leave</span>
        </button>

        <button
          onClick={() => {}}
          disabled={isWatchingOnly}
          className={`col-span-1 py-3 rounded-xl text-white font-extrabold text-xs flex items-center justify-center gap-1 active:scale-95 shadow-md transition ${
            isWatchingOnly ? "bg-orange-800/40 text-gray-400 cursor-not-allowed" : "bg-[#ff6d00] hover:bg-[#ff8f00]"
          }`}
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>

        <button
          onClick={handleBingoClick}
          disabled={isWatchingOnly}
          className={`col-span-2 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 transition shadow-lg ${
            isWatchingOnly
              ? "bg-[#5d4037]/70 text-[#a1887f] cursor-default font-extrabold"
              : isAutomatic
              ? "bg-[#5d4037]/90 text-[#d7ccc8] cursor-default font-extrabold"
              : "bg-gradient-to-r from-amber-500 to-yellow-500 text-black shadow-amber-500/30 active:scale-95"
          }`}
        >
          <span>Automatic</span>
        </button>
      </div>

      {/* 4. Winner Announcement Screen (Image 2) */}
      {winnerData && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-[#0d0e20]/98 backdrop-blur-xl animate-fadeIn text-white select-none overflow-y-auto">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center shadow-[0_0_30px_rgba(255,179,0,0.6)] mb-2 mt-auto">
            <Crown className="w-9 h-9 text-[#3a1d00] fill-[#3a1d00]" />
          </div>

          <h1 className="text-3xl font-black text-amber-400 tracking-wider mb-1">
            BINGO!
          </h1>

          <div className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
            <span>🎉</span>
            <span>{winnerData.winners.length} {winnerData.winners.length > 1 ? "players" : "player"} won!</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mb-4 max-w-xs">
            {winnerData.winners.map((winner, idx) => (
              <div
                key={idx}
                className="px-3 py-1.5 rounded-full bg-[#1e223d] border border-white/10 flex items-center gap-2 shadow-md"
              >
                <div className="w-5 h-5 rounded-full bg-[#3d456b] flex items-center justify-center font-bold text-[11px] text-white">
                  {winner.avatar}
                </div>
                <span className="text-xs font-bold text-white">{winner.name}</span>
                <span className="text-xs font-semibold text-gray-400">#{winner.cardNo}</span>
              </div>
            ))}
          </div>

          <div className="w-full max-w-[310px] bg-[#161834] border border-white/10 rounded-2xl p-3 shadow-2xl">
            <div className="flex items-center justify-between text-xs mb-2 px-1">
              <div className="flex items-center gap-1.5 text-amber-400 font-extrabold text-xs">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Winning Cartela: #{winnerData.winningCartelaNo}</span>
              </div>
              <div className="text-emerald-400 font-black text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                +{derash} ETB
              </div>
            </div>

            <div className="bg-[#0f1124] p-1.5 rounded-xl border border-white/5">
              <div className="grid grid-cols-5 gap-1 mb-1 text-center font-black text-[11px]">
                <div className="bg-[#0088ff] text-white py-0.5 rounded">B</div>
                <div className="bg-[#5c2bff] text-white py-0.5 rounded">I</div>
                <div className="bg-[#9c27b0] text-white py-0.5 rounded">N</div>
                <div className="bg-[#00c853] text-black py-0.5 rounded">G</div>
                <div className="bg-[#ff6d00] text-white py-0.5 rounded">O</div>
              </div>

              <div className="grid grid-cols-5 gap-1">
                {winningCartelaGrid.map((row, rIdx) =>
                  row.map((val, cIdx) => {
                    const isCenter = rIdx === 2 && cIdx === 2;
                    const key = `${rIdx}-${cIdx}`;
                    const isWinningPattern = winnerData.winningPatternKeys.has(key);
                    const isCalled = calledNumbers.includes(val);

                    let cellStyle = "bg-white text-gray-900 font-extrabold";
                    if (isWinningPattern) {
                      cellStyle = "bg-[#ff8f00] text-white font-black shadow-[0_0_10px_rgba(255,143,0,0.7)]";
                    } else if (isCalled || isCenter) {
                      cellStyle = "bg-[#00e676] text-black font-black";
                    }

                    return (
                      <div
                        key={key}
                        className={`h-7 rounded flex items-center justify-center text-xs font-bold transition-all ${cellStyle}`}
                      >
                        {isCenter ? <Sparkles className="w-3.5 h-3.5 fill-current" /> : val}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 px-4 py-2 rounded-full bg-[#1e223d] border border-white/10 text-xs font-bold text-gray-200 flex items-center justify-center gap-2 shadow-lg mb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Auto-starting next game in {nextGameCountdown}s</span>
          </div>

          <button
            onClick={onLeave}
            className="mb-auto text-xs text-gray-400 hover:text-white underline underline-offset-4 py-1"
          >
            Leave to Lobby (ውጣ)
          </button>
        </div>
      )}
    </div>
  );
};
