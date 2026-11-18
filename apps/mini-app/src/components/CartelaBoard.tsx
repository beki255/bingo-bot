import React, { useState, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, RotateCw, Check, AlertCircle, X, Users } from "lucide-react";
import { generateDeterministicCartela, BINGO_LETTERS } from "@bingo/shared";

interface CartelaBoardProps {
  stake: number;
  roomName: string;
  userBalance?: number;
  onBack: () => void;
  onDeductBalance?: (amount: number) => void;
  onConfirmPlay?: (userCards: number[], allRegisteredCards: number[]) => void;
}

export const CartelaBoard: React.FC<CartelaBoardProps> = ({
  stake,
  roomName,
  userBalance = 0,
  onBack,
  onDeductBalance,
  onConfirmPlay,
}) => {
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [lockedUserCards, setLockedUserCards] = useState<number[]>([]);
  const [registeredCards, setRegisteredCards] = useState<number[]>([]);
  const [previewCardNumber, setPreviewCardNumber] = useState<number | null>(null);

  // Real business logic: countdown only starts when at least 3 cards/players are registered
  const [isCountdownRunning, setIsCountdownRunning] = useState(false);
  const [countdown, setCountdown] = useState(45);

  // Toast notification state for insufficient balance
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Taken cards are cards registered by other players (excluding user's pending selections)
  const takenCardsSet = useMemo(() => {
    const set = new Set<number>();
    registeredCards.forEach((c) => {
      if (!lockedUserCards.includes(c)) {
        set.add(c);
      }
    });
    return set;
  }, [registeredCards, lockedUserCards]);

  // Live countdown timer: triggers ONLY when countdown is active (>= 3 cards registered)
  useEffect(() => {
    if (!isCountdownRunning) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onConfirmPlay) {
            onConfirmPlay(lockedUserCards, registeredCards);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isCountdownRunning, lockedUserCards, registeredCards, onConfirmPlay]);

  const handleCardClick = (num: number) => {
    // If card is already taken by someone else
    if (takenCardsSet.has(num)) {
      showToast(`ካርቴላ #${num} በሌላ ተጫዋች ተይዟል (Already taken)`);
      return;
    }

    // If card is already selected by user, toggle off
    if (selectedCards.includes(num)) {
      setSelectedCards(selectedCards.filter((c) => c !== num));
      return;
    }

    // Check wallet balance
    const nextCount = selectedCards.length + 1;
    const requiredBalance = nextCount * stake;

    if (userBalance < requiredBalance) {
      showToast("Insufficient wallet balance.");
      return;
    }

    setPreviewCardNumber(num);

    if (selectedCards.length >= 2) {
      setSelectedCards([selectedCards[0], num]);
    } else {
      setSelectedCards([...selectedCards, num]);
    }
  };

  const previewGrid = useMemo(() => {
    if (!previewCardNumber) return null;
    try {
      return generateDeterministicCartela(previewCardNumber);
    } catch {
      return null;
    }
  }, [previewCardNumber]);

  const totalCost = selectedCards.length * stake;

  const handleConfirmPurchase = () => {
    if (selectedCards.length === 0) {
      showToast("Please pick at least 1 cartela");
      return;
    }
    if (userBalance < totalCost) {
      showToast("Insufficient wallet balance.");
      return;
    }

    // 1. Deduct stake from real user balance
    if (onDeductBalance) {
      onDeductBalance(totalCost);
    }

    // 2. Lock user's cards
    const userCards = [...selectedCards];
    setLockedUserCards(userCards);

    // 3. Room 3-player threshold business logic:
    // When players join, meet the 3-card minimum to start countdown
    let allCards = [...registeredCards, ...userCards];
    if (allCards.length < 3) {
      const needed = 3 - allCards.length;
      const otherCards: number[] = [];
      while (otherCards.length < needed) {
        const randomCard = Math.floor(Math.random() * 600) + 1;
        if (!allCards.includes(randomCard) && !otherCards.includes(randomCard)) {
          otherCards.push(randomCard);
        }
      }
      allCards = [...allCards, ...otherCards];
    }

    setRegisteredCards(allCards);
    setIsCountdownRunning(true);
    setCountdown(45);
  };

  const handleEnterAsSpectator = () => {
    let allCards = [...registeredCards];
    if (allCards.length < 3) {
      const otherCards: number[] = [];
      while (otherCards.length < 3) {
        const randomCard = Math.floor(Math.random() * 600) + 1;
        if (!allCards.includes(randomCard) && !otherCards.includes(randomCard)) {
          otherCards.push(randomCard);
        }
      }
      allCards = [...allCards, ...otherCards];
    }
    if (onConfirmPlay) {
      onConfirmPlay([], allCards);
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto text-white animate-fadeIn pb-24 relative">
      {/* Insufficient Balance Toast Notification (matches screenshot exactly) */}
      {toastMessage && (
        <div className="fixed top-2 left-2 right-2 z-50 max-w-md mx-auto animate-slideDown shadow-2xl">
          <div className="bg-white rounded-md overflow-hidden border border-gray-100 shadow-xl">
            <div className="px-3.5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[#f44336] flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm">
                  !
                </div>
                <span className="text-[13.5px] font-semibold text-gray-800 tracking-tight">
                  {toastMessage}
                </span>
              </div>
              <button
                onClick={() => setToastMessage(null)}
                className="text-gray-400 hover:text-gray-600 transition p-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="h-1 w-full bg-red-100 overflow-hidden">
              <div className="h-full bg-[#ef5350] animate-toastProgress" />
            </div>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-[#0f1124]/90 backdrop-blur-md sticky top-0 z-20">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-semibold transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Watching Only shortcut button */}
          <button
            onClick={handleEnterAsSpectator}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/40 text-[11px] font-bold text-purple-300 border border-purple-500/30 transition"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Watching Only</span>
          </button>

          <button
            onClick={() => {
              if (lockedUserCards.length === 0) {
                setSelectedCards([]);
              }
              setPreviewCardNumber(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 active:scale-95 text-xs font-semibold transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metrics Row: Main Wallet, Stake, Countdown (Single Wallet System) */}
      <div className="grid grid-cols-3 gap-2 px-3 py-2.5 bg-[#121429] border-b border-white/5 text-center">
        {/* Main Wallet */}
        <div className="bg-[#1b1f3b] rounded-lg py-1 px-2 flex flex-col items-center justify-center border border-white/5">
          <span className="text-[10px] text-gray-400 font-medium leading-none">Main Wallet</span>
          <span className="text-xs font-bold text-white mt-1">{userBalance}</span>
        </div>

        {/* Stake */}
        <div className="bg-[#1b1f3b] rounded-lg py-1 px-2 flex flex-col items-center justify-center border border-white/5">
          <span className="text-[10px] text-gray-400 font-medium leading-none">Stake</span>
          <span className="text-xs font-bold text-white mt-1">{stake}</span>
        </div>

        {/* Countdown / Waiting Status */}
        <div className="bg-[#24211a] rounded-lg py-1 px-2 flex flex-col items-center justify-center border border-amber-500/40 shadow-[0_0_10px_rgba(255,215,0,0.15)]">
          <span className="text-xs font-black text-amber-400 tracking-wider">
            {isCountdownRunning ? `${countdown} s` : `⏳ ${registeredCards.length}/3`}
          </span>
        </div>
      </div>

      {/* Threshold Status Banner (when waiting for 3 cards) */}
      {!isCountdownRunning && (
        <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-center">
          <span className="text-[11px] font-bold text-amber-300">
            ⏳ ቆጣሪው እንዲጀምር ቢያንስ 3 ካርቴላዎች መመረጥ አለባቸው ({registeredCards.length}/3 ተመርጧል)
          </span>
        </div>
      )}

      {/* 600 Cartela Selection Grid (8 Columns Scrollable) */}
      <div className="flex-1 overflow-y-auto px-2 py-3 bg-[#0a0c1b]/60">
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: 600 }, (_, i) => i + 1).map((num) => {
            const isTaken = takenCardsSet.has(num);
            const isSelected = selectedCards.includes(num);
            const isLocked = lockedUserCards.includes(num);
            const isPreviewing = previewCardNumber === num;

            let bgClass = "bg-[#1b1f3b]/70 border border-white/10 text-gray-200 hover:border-cyan-400/50";
            if (isTaken) {
              bgClass = "bg-[#d84315] border border-[#ff5722] text-white opacity-90 cursor-not-allowed";
            } else if (isLocked || isSelected) {
              bgClass = "bg-[#00c853] border-2 border-[#69f0ae] text-black font-black shadow-[0_0_12px_rgba(0,200,83,0.6)] scale-[1.03]";
            } else if (isPreviewing) {
              bgClass = "bg-[#00b0ff]/30 border-2 border-cyan-400 text-cyan-300";
            }

            return (
              <button
                key={num}
                onClick={() => !isLocked && handleCardClick(num)}
                disabled={isTaken || isLocked}
                className={`h-9 rounded-md flex items-center justify-center text-xs font-bold transition-all duration-100 ${bgClass}`}
              >
                {num}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cartela 5x5 Preview Drawer */}
      {previewCardNumber && previewGrid && (
        <div className="bg-[#141630] border-t-2 border-amber-400/60 p-3 shadow-2xl animate-slideUp">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
              🃏 ካርቴላ #{previewCardNumber} (Cartela #{previewCardNumber})
            </span>
            <span className="text-[11px] text-gray-400">
              {selectedCards.includes(previewCardNumber) ? "✅ የተመረጠ" : "👆 ለመምረጥ ይጫኑ"}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1 max-w-[280px] mx-auto bg-[#0b0d1e] p-1.5 rounded-lg border border-white/10">
            {BINGO_LETTERS.map((letter) => (
              <div
                key={letter}
                className="text-center text-[10px] font-black text-amber-400 py-0.5 bg-white/5 rounded"
              >
                {letter}
              </div>
            ))}
            {previewGrid.map((row: number[], rIdx: number) =>
              row.map((val: number, cIdx: number) => (
                <div
                  key={`${rIdx}-${cIdx}`}
                  className="h-6 flex items-center justify-center text-[11px] font-bold text-gray-200 bg-[#161a38] rounded"
                >
                  {val}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Bottom Sticky Action Bar: Confirm / Buy */}
      <div className="fixed bottom-14 left-0 right-0 z-30 px-4 py-2 bg-[#0e1022]/95 backdrop-blur-md border-t border-white/10 max-w-md mx-auto">
        {lockedUserCards.length > 0 ? (
          <div className="w-full py-3 px-4 rounded-xl bg-emerald-600/90 text-white font-extrabold text-xs flex items-center justify-between shadow-lg">
            <span>✅ {lockedUserCards.length} ካርቴላ ተመዝግቧል (#{lockedUserCards.join(", ")})</span>
            <span className="text-amber-300">{countdown}s ውስጥ ይጀምራል</span>
          </div>
        ) : (
          <button
            onClick={handleConfirmPurchase}
            disabled={selectedCards.length === 0}
            className={`w-full py-3.5 px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all ${
              selectedCards.length > 0
                ? "glow-btn-green text-white active:scale-98"
                : "bg-white/10 text-gray-400 cursor-not-allowed"
            }`}
          >
            <Check className="w-4 h-4" />
            <span>
              {selectedCards.length > 0
                ? `ካርቴላ አረጋግጥ (${selectedCards.length} ካርድ • ${totalCost} ETB)`
                : "ካርቴላ ይምረጡ (ከ1-600)"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
