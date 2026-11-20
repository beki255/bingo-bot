import React, { useState, useEffect, useMemo, useRef } from "react";
import { ArrowLeft, RotateCw, Check, AlertCircle, X, Users, Eye } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { API_BASE_URL } from "../config.js";

interface CartelaBoardProps {
  roomId?: string;
  telegramId?: string | null;
  clientId?: string | null;
  stake: number;
  roomName: string;
  userBalance?: number;
  minPlayers?: number;
  maxCardsPerPlayer?: number;
  countdownSeconds?: number;
  cartelaPoolSize?: number;
  onBack: () => void;
  onDeductBalance?: (amount: number) => void;
  onConfirmPlay?: (userCards: number[], allRegisteredCards: number[]) => void;
}

export const CartelaBoard: React.FC<CartelaBoardProps> = ({
  roomId,
  telegramId,
  clientId,
  stake,
  roomName,
  userBalance = 0,
  minPlayers = 2,
  maxCardsPerPlayer = 2,
  countdownSeconds = 30,
  cartelaPoolSize = 600,
  onBack,
  onDeductBalance,
  onConfirmPlay,
}) => {
  const [selectedCards, setSelectedCards] = useState<number[]>([]);
  const [lockedUserCards, setLockedUserCards] = useState<number[]>([]);
  const [registeredCards, setRegisteredCards] = useState<number[]>([]);
  const [otherPendingSelections, setOtherPendingSelections] = useState<number[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Countdown starts when at least minPlayers cards are registered
  const [isCountdownRunning, setIsCountdownRunning] = useState(false);
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [postGameDelayRemaining, setPostGameDelayRemaining] = useState(0);

  // Decrement post-game delay remaining
  useEffect(() => {
    if (postGameDelayRemaining <= 0) return;
    const t = setInterval(() => {
      setPostGameDelayRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [postGameDelayRemaining]);

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

  // Cards currently being selected/clicked by other players in real-time
  const otherPendingSet = useMemo(() => {
    const set = new Set<number>();
    otherPendingSelections.forEach((c) => {
      if (!selectedCards.includes(c) && !lockedUserCards.includes(c)) {
        set.add(c);
      }
    });
    return set;
  }, [otherPendingSelections, selectedCards, lockedUserCards]);

  // Real-time WebSocket connection for instant multiplayer card selection & room state
  useEffect(() => {
    if (!roomId) return;
    const socketUrl = API_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "");
    const s = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
    });

    s.on("connect", () => {
      s.emit("join_room", { roomId, clientId });
    });

    s.on("room_state", (state: any) => {
      if (typeof state?.postGameDelayRemaining === "number") {
        setPostGameDelayRemaining(state.postGameDelayRemaining);
      }
      if (Array.isArray(state?.takenCards)) {
        setRegisteredCards(state.takenCards);
      }
      if (Array.isArray(state?.pendingSelections)) {
        setOtherPendingSelections(state.pendingSelections);
      }
      if (state?.status === "COUNTDOWN") {
        setIsCountdownRunning(true);
        if (typeof state.countdown === "number" && state.countdown > 0) {
          setCountdown(state.countdown);
        }
      } else if (state?.status === "WAITING") {
        setIsCountdownRunning(false);
      } else if (state?.status === "RUNNING") {
        // Game has started on the server! Transition immediately to LiveGame!
        if (onConfirmPlayRef.current) {
          const unpaidCards = selectedCardsRef.current.filter(
            (c) => !lockedUserCardsRef.current.includes(c)
          );
          if (unpaidCards.length > 0) {
            const unpaidCost = unpaidCards.length * stake;
            if (onDeductBalanceRef.current) onDeductBalanceRef.current(unpaidCost);
            if (roomId && telegramId) {
              fetch(`${API_BASE_URL}/api/rooms/${roomId}/buy`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ telegramId, cartelaNumbers: unpaidCards }),
              }).catch(() => {});
            }
            setLockedUserCards((p) => [...p, ...unpaidCards]);
            lockedUserCardsRef.current = [...lockedUserCardsRef.current, ...unpaidCards];
          }
          const userPlayingCards = Array.from(
            new Set([...lockedUserCardsRef.current, ...selectedCardsRef.current])
          );
          const allRoundCards = Array.from(
            new Set([
              ...registeredCardsRef.current,
              ...selectedCardsRef.current,
              ...otherPendingSelectionsRef.current,
            ])
          );
          onConfirmPlayRef.current(userPlayingCards, allRoundCards);
        }
      }
    });

    s.on("game_started", () => {
      if (onConfirmPlayRef.current) {
        const unpaidCards = selectedCardsRef.current.filter(
          (c) => !lockedUserCardsRef.current.includes(c)
        );
        if (unpaidCards.length > 0) {
          const unpaidCost = unpaidCards.length * stake;
          if (onDeductBalanceRef.current) onDeductBalanceRef.current(unpaidCost);
          if (roomId && telegramId) {
            fetch(`${API_BASE_URL}/api/rooms/${roomId}/buy`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ telegramId, cartelaNumbers: unpaidCards }),
            }).catch(() => {});
          }
          setLockedUserCards((p) => [...p, ...unpaidCards]);
          lockedUserCardsRef.current = [...lockedUserCardsRef.current, ...unpaidCards];
        }
        const userPlayingCards = Array.from(
          new Set([...lockedUserCardsRef.current, ...selectedCardsRef.current])
        );
        const allRoundCards = Array.from(
          new Set([
            ...registeredCardsRef.current,
            ...selectedCardsRef.current,
            ...otherPendingSelectionsRef.current,
          ])
        );
        onConfirmPlayRef.current(userPlayingCards, allRoundCards);
      }
    });

    s.on("room_selections", (data: any) => {
      if (Array.isArray(data?.pendingSelections)) {
        setOtherPendingSelections(data.pendingSelections);
      }
    });

    s.on("countdown_tick", (data: any) => {
      if (typeof data?.countdown === "number") {
        setIsCountdownRunning(true);
        setCountdown(data.countdown);
      }
    });

    setSocket(s);

    // Fallback HTTP poll every 2.5s to ensure rock-solid state synchronization
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/state`);
        const data = await res.json();
        if (data.ok && data.state) {
          const st = data.state;
          if (typeof st.postGameDelayRemaining === "number") {
            setPostGameDelayRemaining(st.postGameDelayRemaining);
          }
          if (Array.isArray(st.takenCards)) {
            setRegisteredCards(st.takenCards);
          }
          if (Array.isArray(st.pendingSelections)) {
            setOtherPendingSelections(st.pendingSelections);
          }
          if (st.status === "COUNTDOWN") {
            setIsCountdownRunning(true);
            if (typeof st.countdown === "number" && st.countdown > 0) {
              setCountdown(st.countdown);
            }
          } else if (st.status === "WAITING") {
            setIsCountdownRunning(false);
          } else if (st.status === "RUNNING") {
            if (onConfirmPlayRef.current) {
              const unpaidCards = selectedCardsRef.current.filter(
                (c) => !lockedUserCardsRef.current.includes(c)
              );
              if (unpaidCards.length > 0) {
                const unpaidCost = unpaidCards.length * stake;
                if (onDeductBalanceRef.current) onDeductBalanceRef.current(unpaidCost);
                if (roomId && telegramId) {
                  fetch(`${API_BASE_URL}/api/rooms/${roomId}/buy`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ telegramId, cartelaNumbers: unpaidCards }),
                  }).catch(() => {});
                }
                setLockedUserCards((p) => [...p, ...unpaidCards]);
                lockedUserCardsRef.current = [...lockedUserCardsRef.current, ...unpaidCards];
              }
              const userPlayingCards = Array.from(
                new Set([...lockedUserCardsRef.current, ...selectedCardsRef.current])
              );
              const allRoundCards = Array.from(
                new Set([
                  ...registeredCardsRef.current,
                  ...selectedCardsRef.current,
                  ...otherPendingSelectionsRef.current,
                ])
              );
              onConfirmPlayRef.current(userPlayingCards, allRoundCards);
            }
          }
        }
      } catch {}
    }, 2500);

    return () => {
      clearInterval(pollInterval);
      s.disconnect();
    };
  }, [roomId, clientId]);

  // Broadcast current user's card selections immediately to other players in the room
  useEffect(() => {
    if (!roomId || !clientId) return;

    if (socket?.connected) {
      socket.emit("select_cards", { roomId, clientId, cards: selectedCards });
    }

    fetch(`${API_BASE_URL}/api/rooms/${roomId}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, cards: selectedCards }),
    }).catch(() => {});
  }, [selectedCards, roomId, clientId, socket]);

  // Total active/selected cartelas in the room across all players
  const totalActiveRoomCards = useMemo(() => {
    const set = new Set<number>();
    registeredCards.forEach((c) => set.add(c));
    selectedCards.forEach((c) => set.add(c));
    otherPendingSelections.forEach((c) => set.add(c));
    return set.size;
  }, [registeredCards, selectedCards, otherPendingSelections]);

  // When total active cards in the room reach minPlayers threshold, start countdown automatically ONLY if post-game delay has expired
  useEffect(() => {
    if (totalActiveRoomCards >= minPlayers && !isCountdownRunning && postGameDelayRemaining <= 0) {
      setIsCountdownRunning(true);
      setCountdown(countdownSeconds);
    }
  }, [totalActiveRoomCards, minPlayers, isCountdownRunning, postGameDelayRemaining, countdownSeconds]);

  const lockedUserCardsRef = useRef(lockedUserCards);
  lockedUserCardsRef.current = lockedUserCards;

  const selectedCardsRef = useRef(selectedCards);
  selectedCardsRef.current = selectedCards;

  const otherPendingSelectionsRef = useRef(otherPendingSelections);
  otherPendingSelectionsRef.current = otherPendingSelections;

  const registeredCardsRef = useRef(registeredCards);
  registeredCardsRef.current = registeredCards;

  const onConfirmPlayRef = useRef(onConfirmPlay);
  onConfirmPlayRef.current = onConfirmPlay;

  const onDeductBalanceRef = useRef(onDeductBalance);
  onDeductBalanceRef.current = onDeductBalance;

  // Live countdown timer: triggers ONLY when countdown is active (>= minPlayers cards registered)
  useEffect(() => {
    if (!isCountdownRunning) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          try {
            const startAudio = new Audio("/sounds/aac_started.mp3");
            startAudio.play().catch(() => {});
          } catch {}
          if (onConfirmPlayRef.current) {
            // Find any selected cards that user picked but hasn't paid for yet:
            const unpaidCards = selectedCardsRef.current.filter(
              (c) => !lockedUserCardsRef.current.includes(c)
            );

            // Deduct the stake for the unpaid playing cards so the wallet drops by (e.g. 120 - 20 = 100):
            if (unpaidCards.length > 0) {
              const unpaidCost = unpaidCards.length * stake;
              if (onDeductBalanceRef.current) {
                onDeductBalanceRef.current(unpaidCost);
              }
              if (roomId && telegramId) {
                fetch(`${API_BASE_URL}/api/rooms/${roomId}/buy`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    telegramId,
                    cartelaNumbers: unpaidCards,
                  }),
                }).catch(() => {});
              }
              setLockedUserCards((p) => [...p, ...unpaidCards]);
              lockedUserCardsRef.current = [...lockedUserCardsRef.current, ...unpaidCards];
            }

            // When countdown finishes, everyone enters the live game:
            // - If user confirmed cards or selected cards, they enter as active player
            // - If user didn't pick any cards, they enter as spectator in "Watching Only" mode
            const userPlayingCards = Array.from(
              new Set([...lockedUserCardsRef.current, ...selectedCardsRef.current])
            );
            const allRoundCards = Array.from(
              new Set([
                ...registeredCardsRef.current,
                ...selectedCardsRef.current,
                ...otherPendingSelectionsRef.current,
              ])
            );
            onConfirmPlayRef.current(userPlayingCards, allRoundCards);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isCountdownRunning]);

  const handleCardClick = (num: number) => {
    // If cards already confirmed, cannot alter
    if (lockedUserCards.length > 0) return;

    // If card is already taken by someone else
    if (takenCardsSet.has(num)) {
      showToast(`ካርቴላ #${num} በሌላ ተጫዋች ተይዟል (Already taken)`);
      return;
    }

    // If card is currently being selected by another player in real-time
    if (otherPendingSet.has(num)) {
      showToast(`ካርቴላ #${num} በሌላ ተጫዋች እየተመረጠ ነው (Selecting by another player)`);
      return;
    }

    // If card is already selected by user, toggle off
    if (selectedCards.includes(num)) {
      setSelectedCards(selectedCards.filter((c) => c !== num));
      return;
    }

    const maxLimit = maxCardsPerPlayer || 2;
    if (selectedCards.length >= maxLimit) {
      showToast(`በአንድ ጨዋታ መምረጥ የሚችሉት እስከ ${maxLimit} ካርቴላ ብቻ ነው (Max ${maxLimit} cards)`);
      return;
    }

    // Check wallet balance
    const nextCount = selectedCards.length + 1;
    const requiredBalance = nextCount * stake;

    if (userBalance < requiredBalance) {
      showToast("ቀሪ ሂሳብዎ በቂ ስላልሆነ መምረጥ አይችሉም። ተመልካች ሆነው ይከታተሉ (Watching Only)");
      return;
    }

    setSelectedCards([...selectedCards, num]);
  };

  const totalCost = selectedCards.length * stake;

  const handleConfirmPurchase = async () => {
    if (selectedCards.length === 0) {
      showToast("Please pick at least 1 cartela");
      return;
    }
    if (userBalance < totalCost) {
      showToast("ቀሪ ሂሳብዎ በቂ አይደለም (Insufficient balance)");
      return;
    }

    const cardsToBuy = [...selectedCards];

    // Real API purchase if roomId and telegramId are present
    if (roomId && telegramId) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/buy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            telegramId,
            cartelaNumbers: cardsToBuy,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          showToast(data.error || "ካርቴላ መግዛት አልተቻለም");
          return;
        }

        if (onDeductBalanceRef.current) {
          onDeductBalanceRef.current(totalCost);
        }
        setLockedUserCards(cardsToBuy);
        lockedUserCardsRef.current = cardsToBuy;

        if (data.state && Array.isArray(data.state.takenCards)) {
          setRegisteredCards(data.state.takenCards);
        }
        if (data.state?.status === "COUNTDOWN") {
          setIsCountdownRunning(true);
          setCountdown(data.state.countdown || countdownSeconds);
        }
        return;
      } catch {
        showToast("Error processing purchase. Please try again.");
        return;
      }
    }

    // Local state fallback if previewing without Telegram
    if (onDeductBalanceRef.current) {
      onDeductBalanceRef.current(totalCost);
    }
    setLockedUserCards(cardsToBuy);
    lockedUserCardsRef.current = cardsToBuy;
    setRegisteredCards((prev) => {
      const combined = [...prev];
      cardsToBuy.forEach((c) => {
        if (!combined.includes(c)) combined.push(c);
      });
      return combined;
    });
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
          {/* Watching Only Status Badge (Non-clickable visual indicator) */}
          {lockedUserCards.length > 0 ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
              <Check className="w-3.5 h-3.5" />
              <span>ተጫዋች (#{lockedUserCards.join(", ")})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-600/25 text-[11px] font-bold text-purple-300 border border-purple-500/30">
              <Eye className="w-3.5 h-3.5" />
              <span>Watching Only</span>
            </div>
          )}

          <button
            onClick={() => {
              if (lockedUserCards.length === 0) {
                setSelectedCards([]);
              }
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
            {postGameDelayRemaining > 0
              ? `⏳ ${postGameDelayRemaining}s`
              : isCountdownRunning
              ? `${countdown} s`
              : `⏳ ${totalActiveRoomCards}/${minPlayers}`}
          </span>
        </div>
      </div>

      {/* Threshold Status Banner (when waiting for minPlayers cards or post-game delay) */}
      {!isCountdownRunning && (
        <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-center">
          <span className="text-[11px] font-bold text-amber-300">
            {postGameDelayRemaining > 0 ? (
              <span>⏳ ያለፈው ጨዋታ ውጤት እየታየ ነው ({postGameDelayRemaining}s) • ቆጣሪው ከዛ በኋላ ይጀምራል</span>
            ) : (
              <span>⏳ ቆጣሪው እንዲጀምር ቢያንስ {minPlayers} ካርቴላዎች መመረጥ አለባቸው ({totalActiveRoomCards}/${minPlayers} ተመርጧል)</span>
            )}
          </span>
        </div>
      )}

      {/* Cartela Selection Grid (8 Columns Scrollable) */}
      <div className="flex-1 overflow-y-auto px-2 py-3 bg-[#0a0c1b]/60 pb-24">
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: cartelaPoolSize }, (_, i) => i + 1).map((num) => {
            const isTaken = takenCardsSet.has(num);
            const isPendingOther = otherPendingSet.has(num);
            const isSelected = selectedCards.includes(num);
            const isLocked = lockedUserCards.includes(num);

            let bgClass = "bg-[#1b1f3b]/70 border border-white/10 text-gray-200 hover:border-cyan-400/50";
            if (isTaken) {
              bgClass = "bg-[#d84315] border border-[#ff5722] text-white opacity-90 cursor-not-allowed";
            } else if (isPendingOther) {
              bgClass = "bg-amber-600/80 border-2 border-amber-400 text-white font-extrabold shadow-[0_0_10px_rgba(251,191,36,0.6)] animate-pulse";
            } else if (isLocked || isSelected) {
              bgClass = "bg-[#00c853] border-2 border-[#69f0ae] text-black font-black shadow-[0_0_12px_rgba(0,200,83,0.6)] scale-[1.03]";
            }

            return (
              <button
                key={num}
                onClick={() => !isLocked && !isPendingOther && handleCardClick(num)}
                disabled={isTaken || isLocked || isPendingOther}
                className={`h-9 rounded-md flex items-center justify-center text-xs font-bold transition-all duration-100 ${bgClass}`}
              >
                {num}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Sticky Action Bar: Confirm / Buy or Watching Only Info */}
      <div className="fixed bottom-14 left-0 right-0 z-30 px-4 py-2 bg-[#0e1022]/95 backdrop-blur-md border-t border-white/10 max-w-md mx-auto">
        {lockedUserCards.length > 0 ? (
          <div className="w-full py-3 px-4 rounded-xl bg-emerald-600/90 text-white font-extrabold text-xs flex items-center justify-between shadow-lg">
            <span>✅ {lockedUserCards.length} ካርቴላ ተመዝግቧል (#{lockedUserCards.join(", ")})</span>
            <span className="text-amber-300">{countdown}s ውስጥ ይጀምራል</span>
          </div>
        ) : userBalance < stake ? (
          <div className="w-full py-3 px-4 rounded-xl bg-purple-950/80 border border-purple-500/30 text-purple-200 text-xs font-bold flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-purple-400 shrink-0" />
              <span>ቀሪ ሂሳብ የለዎትም (Watching Only)</span>
            </div>
            <span className="text-amber-300 font-extrabold text-xs shrink-0">
              {isCountdownRunning ? `⏳ ${countdown}s` : `⏳ ${totalActiveRoomCards}/${minPlayers}`}
            </span>
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
                : `ካርቴላ ይምረጡ (ከ1-${cartelaPoolSize})`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
